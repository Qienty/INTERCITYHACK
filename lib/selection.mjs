// The UI and standalone proposal share these deterministic allocation rules.
export function selectionErrors(b){
  const errors=[],c=b.constraints||{},present=v=>v!==null&&v!==undefined&&v!=='';
  if(b.selection&&(typeof b.selection!=='object'||Array.isArray(b.selection)))errors.push('人工选择须按资源编号保存');
  for(const [key,min,max,integer]of [['reserve',0,b.budget,false],['busShare',0,100,false],['shareTolerance',0,100,false],['maxConcentration',.0001,100,false],['minAreas',1,5000,true],['minPerArea',1,1000000000,true],['discountFloor',.0001,1,false]])if(present(c[key])&&(!Number.isFinite(Number(c[key]))||Number(c[key])<min||Number(c[key])>max||integer&&!Number.isSafeInteger(Number(c[key]))))errors.push('组合约束 '+key+' 超出有效范围');
  for(const key of ['requiredMedia','areaTargets'])if(c[key]!==undefined&&!Array.isArray(c[key]))errors.push('组合约束 '+key+' 须为列表');
  if(Array.isArray(c.requiredMedia)&&c.requiredMedia.some(m=>!['bus','metro'].includes(m)))errors.push('必投渠道仅支持公交车辆和地铁站口');
  if(b.spatial){if(typeof b.spatial!=='object'||Array.isArray(b.spatial))errors.push('空间条件格式无效');else for(const key of ['mappings','coverageReports','areas','requiredLandmarks'])if(b.spatial[key]!==undefined&&!Array.isArray(b.spatial[key]))errors.push('空间条件 '+key+' 须为列表');}
  return errors;
}
export function billingTerms(row,segments,discount=1){
  const basis=row.billingUnit||(row.periodDays===28?'period28':'');
  const periods=basis==='day'?segments.reduce((s,r)=>s+r.days,0):basis==='calendarMonth'?segments.reduce((s,r)=>s+(Number(r.end.slice(0,4))-Number(r.start.slice(0,4)))*12+Number(r.end.slice(5,7))-Number(r.start.slice(5,7))+1,0):segments.reduce((s,r)=>s+Math.ceil(r.days/28),0);
  const tax=row.priceIncludesTax===false?Number(row.taxRate)/100:0;
  const mediaBaseCents=Math.round(row.unitPrice*periods*discount*100),productionBaseCents=Math.round(row.production*100);
  const mediaTaxCents=Math.round(mediaBaseCents*tax),productionTaxCents=Math.round(productionBaseCents*tax);
  return {billingUnit:basis,billingLabel:({day:'按天',calendarMonth:'各分段触及自然月分别计月',period28:'各分段28天整期'})[basis]||'待确认',billingPeriods:periods,mediaBaseCents,productionBaseCents,mediaTaxCents,productionTaxCents,mediaUnitCents:mediaBaseCents+mediaTaxCents,productionUnitCents:productionBaseCents+productionTaxCents};
}
export function spatialFacts(row,b){
  const spatial=b.spatial||{},mappings=(spatial.mappings||[]).filter(m=>m.resourceId===row.id&&m.verified===true&&m.source&&m.verifiedAt);
  const reports=(spatial.coverageReports||[]).filter(r=>r.resourceIds?.includes(row.id)||(row.sourceResourceId&&r.resourceIds?.includes(row.sourceResourceId)));
  const areas=[...new Set([row.district,...mappings.map(m=>m.area),...reports.map(r=>r.center)].filter(Boolean))];
  const landmarks=mappings.filter(m=>m.relation==='途经').map(m=>m.landmark).filter(Boolean);
  const issues=[];
  if(spatial.areas?.length&&!spatial.areas.some(a=>areas.includes(a)))issues.push('没有所选区域的已核实对应关系');
  if(spatial.requiredLandmarks?.some(name=>!landmarks.includes(name)))issues.push('缺少必须途经地标的已核实关系');
  if(spatial.coverageReports?.length&&!reports.length)issues.push('不在所选平台覆盖报告的同名媒体关系中');
  if(spatial.radius?.enabled){
    const p=spatial.radius,valid=Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&Number.isFinite(p.meters)&&p.meters>0&&p.coordinateSystem;
    const points=mappings.filter(m=>m.coordinateSystem===p.coordinateSystem&&Number.isFinite(m.lon)&&Number.isFinite(m.lat));
    if(!valid||!points.length)issues.push('半径筛选缺少已核实的同坐标系参考点');
    else{const rad=Math.PI/180;const close=points.some(m=>{const h=Math.sin((m.lat-p.lat)*rad/2)**2+Math.cos(p.lat*rad)*Math.cos(m.lat*rad)*Math.sin((m.lon-p.lon)*rad/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))<=p.meters;});if(!close)issues.push('已核实参考点位于圈选半径之外');}
  }
  return {areas,landmarks,reports:reports.map(r=>r.id),issues};
}
export function allocateSelection(eligible,b,monitoringCents=0){
  const rules=b.selection||{},c=b.constraints||{},unresolved=[],changes=[];
  const budgetCents=Math.round(b.budget*100),reserveCents=Math.round((Number(c.reserve)||0)*100);
  let remainingCents=budgetCents-reserveCents-monitoringCents;
  const mediaCounts=Object.create(null),districtCounts=Object.create(null);
  const byId=new Map(eligible.map(r=>[r.id,r]));
  if(!Number.isFinite(reserveCents)||reserveCents<0||remainingCents<0)unresolved.push({id:'budget',reason:'预算预留及固定费用超过总预算，或预留值无效'});
  const target=Number(c.busShare),hasTarget=c.busShare!==''&&c.busShare!=null&&Number.isFinite(target);
  const canAuto=r=>!['fixed','excluded'].includes(rules[r.id]?.mode);
  const utility=r=>{const total=Object.values(mediaCounts).reduce((s,n)=>s+n,0),share=(mediaCounts.bus||0)/Math.max(1,total);const boost=hasTarget?((r.media==='bus'?share<target/100:share>target/100)?2:.6):1;return r.score/(1+r.quantity*.24+(districtCounts[r.district]||0)*.025)*(!mediaCounts[r.media]?1.35:1)*boost/Math.sqrt(r.unitTotalCents);};
  const allocate=(r,requested,locked=false)=>{const n=Math.max(0,Math.min(requested,r.available-r.quantity,Math.floor(Math.max(0,remainingCents)/r.unitTotalCents)));if(locked&&n!==requested)return 0;r.quantity+=n;remainingCents-=n*r.unitTotalCents;mediaCounts[r.media]=(mediaCounts[r.media]||0)+n;districtCounts[r.district]=(districtCounts[r.district]||0)+n;return n;};
  for(const [id,rule]of Object.entries(rules)){
    if(!rule||!['auto','fixed','required','excluded'].includes(rule.mode)){unresolved.push({id,reason:'人工选择模式无效'});continue;}
    if(['auto','excluded'].includes(rule.mode))continue;
    const quantity=rule.quantity;
    if(!Number.isSafeInteger(quantity)||quantity<0||(rule.mode==='required'&&quantity<1)){unresolved.push({id,reason:'指定数量须为有效整数；必投数量至少为1'});continue;}
    const r=byId.get(id);
    if(!r){unresolved.push({id,reason:'必选资源当前未通过库存、价格、档期或空间条件核验'});continue;}
    if(quantity>r.available){unresolved.push({id,reason:'指定数量 '+quantity+' 超过已核实可售量 '+r.available});continue;}
    if(quantity*r.unitTotalCents>remainingCents){unresolved.push({id,reason:'指定项超过扣除预留和固定费后的可用预算'});continue;}
    allocate(r,quantity,true);changes.push({id,name:r.name,mode:rule.mode,quantity});
  }
  for(const media of c.requiredMedia||[]){if(!b.media.includes(media)){unresolved.push({id:media,reason:'必投渠道未勾选'});continue;}if(mediaCounts[media])continue;const candidates=eligible.filter(r=>r.media===media&&canAuto(r)).sort((a,z)=>a.unitTotalCents-z.unitTotalCents);if(!candidates.some(r=>allocate(r,1)>0))unresolved.push({id:media,reason:'必投渠道无已核实且可负担的资源'});}
  const areaTargets=[...new Set([...(c.areaTargets||[]),...(b.spatial?.areas||[])])];
  if(c.minAreas&&!areaTargets.length){const available=[...new Set(eligible.flatMap(r=>r.verifiedAreas||[]))];areaTargets.push(...available.slice(0,Number(c.minAreas)));}
  for(const area of areaTargets){let count=eligible.filter(r=>r.verifiedAreas?.includes(area)).reduce((s,r)=>s+r.quantity,0);const minimum=Number(c.minPerArea)||1;for(const r of eligible.filter(r=>r.verifiedAreas?.includes(area)&&canAuto(r)).sort((a,z)=>a.unitTotalCents-z.unitTotalCents)){if(count>=minimum)break;count+=allocate(r,minimum-count);}}
  let rounds=0;
  // A hard share uses integer channel quotas. Locked quantities remain lower bounds.
  let hardQuotaDone=false;
  if(c.shareHard&&hasTarget&&target>=0&&target<=100){
    const tolerance=Number(c.shareTolerance)||0,baseBus=mediaCounts.bus||0,baseMetro=mediaCounts.metro||0;
    const free=media=>eligible.filter(r=>r.media===media&&canAuto(r)).sort((a,z)=>a.unitTotalCents-z.unitTotalCents||String(a.id).localeCompare(String(z.id)));
    const buses=free('bus'),metros=free('metro'),busMax=baseBus+buses.reduce((s,r)=>s+r.available-r.quantity,0),metroMax=baseMetro+metros.reduce((s,r)=>s+r.available-r.quantity,0);
    const cost=(rows,n)=>{let sum=0;for(const r of rows){const count=Math.min(n,r.available-r.quantity);sum+=count*r.unitTotalCents;n-=count;if(!n)break;}return n?Infinity:sum;};
    const choice=n=>{const low=Math.max(baseBus,n-metroMax,Math.ceil(n*Math.max(0,target-tolerance)/100-1e-9)),high=Math.min(busMax,n-baseMetro,Math.floor(n*Math.min(100,target+tolerance)/100+1e-9));if(low>high)return null;const counts=[Math.max(low,Math.min(high,Math.round(n*target/100))),low,high];for(const bus of [...new Set(counts)])if(cost(buses,bus-baseBus)+cost(metros,n-bus-baseMetro)<=remainingCents)return {bus,metro:n-bus};return null;};
    const minimum=baseBus+baseMetro,cheapest=Math.min(...eligible.filter(canAuto).map(r=>r.unitTotalCents));
    const maximum=Math.min(busMax+metroMax,minimum+(Number.isFinite(cheapest)?Math.floor(Math.max(0,remainingCents)/cheapest):0));let desired=null;
    if(maximum<=20000){for(let n=maximum;n>=Math.max(1,minimum);n--){desired=choice(n);if(desired)break;}}
    else if(tolerance===0){let numerator=Math.round(target*1000),denominator=100000,a=numerator,z=denominator;while(z){const next=a%z;a=z;z=next;}const busPart=numerator/a,metroPart=(denominator-numerator)/a,quantum=denominator/a;let low=Math.max(1,busPart?Math.ceil(baseBus/busPart):baseBus?Infinity:0,metroPart?Math.ceil(baseMetro/metroPart):baseMetro?Infinity:0),high=Math.floor(maximum/quantum);while(low<=high){const middle=Math.floor((low+high)/2),found=choice(middle*quantum);if(found){desired=found;low=middle+1;}else high=middle-1;}}
    else{let low=Math.max(1,minimum),high=maximum;while(low<=high){const middle=Math.floor((low+high)/2),found=choice(middle);if(found){desired=found;low=middle+1;}else high=middle-1;}for(let n=Math.min(maximum,(desired?desired.bus+desired.metro:minimum)+200);n>=Math.max(1,minimum,(desired?desired.bus+desired.metro:minimum));n--){const found=choice(n);if(found){desired=found;break;}}}
    if(desired){for(const [rows,needed]of [[buses,desired.bus-baseBus],[metros,desired.metro-baseMetro]]){let left=needed;for(const row of rows){left-=allocate(row,left);if(!left)break;}}}
    else unresolved.push({id:'channel-share',reason:'当前指定项、可售量和预算下未找到满足硬性渠道比例的整数配单；请调整容差或指定数量'});
    hardQuotaDone=true;
  }
  while(remainingCents>0){
    if(hardQuotaDone)break;
    const candidates=eligible.filter(r=>canAuto(r)&&r.quantity<r.available&&r.unitTotalCents<=remainingCents);
    if(!candidates.length)break;
    const weights=candidates.map(utility),sum=weights.reduce((s,n)=>s+n,0),roundBudget=remainingCents;let assigned=0;
    candidates.forEach((r,i)=>assigned+=allocate(r,Math.floor(roundBudget*(weights[i]/sum)/r.unitTotalCents)));
    if(!assigned){candidates.sort((a,z)=>utility(z)-utility(a)||String(a.id).localeCompare(String(z.id)));allocate(candidates[0],1);}
    if(++rounds>20000){unresolved.push({id:'allocation',reason:'组合计算达到安全迭代上限，请减少候选或手动指定数量'});break;}
  }
  return {remainingCents,mediaCounts,unresolved,changes,reserveCents,areaTargets};
}
export function selectionAudit(lines,b,unresolved=[],chosenAreas=[]){
  const c=b.constraints||{},checks=[],add=(label,status,detail)=>checks.push({label,status,detail});
  const totalUnits=lines.reduce((s,r)=>s+r.quantity,0),bus=lines.filter(r=>r.media==='bus').reduce((s,r)=>s+r.quantity,0),share=totalUnits?bus/totalUnits*100:0;
  for(const item of unresolved)add('指定项 '+item.id,'block',item.reason);
  if(c.busShare!=null&&c.busShare!==''){const target=Number(c.busShare),tolerance=Number(c.shareTolerance)||0,valid=Number.isFinite(target)&&target>=0&&target<=100&&Number.isFinite(tolerance)&&tolerance>=0&&tolerance<=100;const diff=Math.abs(share-target);add('公交数量占比',!valid?'block':totalUnits&&diff<=tolerance?'pass':c.shareHard?'block':'deviation',valid?'目标 '+target+'%，实际 '+share.toFixed(1)+'%，容差 '+tolerance+' 个百分点；按资源数量计算':'目标或容差须为0–100之间数值');}
  const areas=[...new Set(lines.flatMap(r=>r.verifiedAreas||[]))];
  if(c.minAreas!=null&&c.minAreas!=='')add('最低覆盖区域',Number.isSafeInteger(Number(c.minAreas))&&Number(c.minAreas)>0&&areas.length>=Number(c.minAreas)?'pass':'block','已核实覆盖 '+areas.length+' 个，要求 '+c.minAreas+' 个；未核实关系不计入');
  for(const area of [...new Set([...(c.areaTargets||[]),...(b.spatial?.areas||[]),...chosenAreas])]){const count=lines.filter(r=>r.verifiedAreas?.includes(area)).reduce((s,r)=>s+r.quantity,0),min=Number(c.minPerArea)||1;add(area+' 最低投放密度',count>=min?'pass':'block','已选 '+count+' 个，要求至少 '+min+' 个；途经多个区域的同一资源可分别覆盖，不相加为总数量');}
  if(c.maxConcentration!=null&&c.maxConcentration!==''){const max=Number(c.maxConcentration),media=lines.reduce((s,r)=>s+r.mediaAmount,0),actual=media?Math.max(0,...lines.map(r=>r.mediaAmount/media*100)):0;add('单资源媒介费集中度',Number.isFinite(max)&&max>0&&max<=100&&media&&actual<=max+1e-7?'pass':'block','上限 '+max+'%，实际最高 '+actual.toFixed(1)+'%；分母为全案含税媒介费，资源按稳定编号区分');}
  if(c.discountFloor!=null&&c.discountFloor!==''){const floor=Number(c.discountFloor),valid=Number.isFinite(floor)&&floor>0&&floor<=1&&c.discountSource;add('折扣审批',valid&&(b.discount>=floor||c.discountApproval)?'pass':'block',!valid?'审批线及企业规则来源须明确':b.discount>=floor?'未低于已录入审批线':c.discountApproval?'审批依据：'+c.discountApproval:'价格系数低于审批线，缺少审批依据');}
  if(!checks.length)add('组合约束','pending','尚未设置额外组合目标；库存、预算与档期仍独立核验');
  return {checks,busShare:share,areas,blocking:checks.filter(x=>x.status==='block').map(x=>x.label+'：'+x.detail)};
}
