import {selectionErrors,billingTerms,spatialFacts,allocateSelection,selectionAudit} from './selection.mjs';
import {quoteFees} from './fees.mjs';
import {CHANNELS,channelName,channelKey,campaignRanges,scheduleErrors} from './campaign.mjs';
export const INDUSTRIES = {
  '食品饮料': {brand:'待调研饮料品牌',campaign:'把日常经过，变成品牌相遇',audience:'年轻白领、城市通勤者与品质生活人群',objective:'围绕线下消费场景，连接通勤与商圈触点。',tags:['商圈','办公','社区'],color:'#ee7753'},
  '银行保险': {brand:'待调研金融品牌',campaign:'在每一次通勤中，积累信任',audience:'家庭决策者、职场人群与社区居民',objective:'优先覆盖网点周边社区与办公区域，建立持续品牌认知。',tags:['办公','社区','交通'],color:'#577bbd'},
  '保健品': {brand:'待调研保健品牌',campaign:'让健康，走进身边的生活',audience:'关注健康管理的家庭与成熟消费人群',objective:'联动药房、社区与生活圈，以稳定频次建立健康品牌认知。',tags:['社区','医疗','商圈'],color:'#4d9381'},
  '私立医院': {brand:'待调研医疗品牌',campaign:'离优质医疗，更近一步',audience:'周边家庭、高品质医疗服务需求人群',objective:'以院区为中心验证交通可达性，覆盖居住和办公人群。',tags:['医疗','社区','办公'],color:'#6b88b6'},
  '乐园（主题公园）': {brand:'待调研乐园品牌',campaign:'快乐，从出发的那一刻开始',audience:'亲子家庭、年轻客群与城市游客',objective:'连接家庭生活圈、交通枢纽与休闲商圈，促成出游考虑。',tags:['休闲','交通','商圈'],color:'#b68b51'}
};
export const DAY=86400000;
export function validDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
export function invoiceIssues(b){
  const invoice=b?.invoice;
  if(invoice===undefined||invoice===null)return [];
  if(typeof invoice!=='object'||Array.isArray(invoice))return ['结算发票条款格式无效'];
  if(!['none','special','general'].includes(invoice.type))return ['结算发票类型无效'];
  return [];
}
// 发票/税率依据缺失属于待补条款，不阻断报价：切换发票选项时组合与金额应保持。
export function invoicePending(b){
  const invoice=b?.invoice;
  if(!invoice||!invoice.type||invoice.type==='none')return [];
  const pending=[];
  const rate=Number(invoice.taxRate);
  if(!Number.isFinite(rate)||rate<=0||rate>100)pending.push('税率');
  if(!String(invoice.source||'').trim())pending.push('税率与发票依据');
  return pending.length?['发票条款待补：'+pending.join('、')]:[];
}
export function addressIssues(b){
  const radius=b?.spatial?.radius;
  if(radius?.enabled!==true)return [];
  const problems=[];
  const meters=Number(radius.meters);
  if(!Number.isFinite(meters)||meters<=0||meters>50000)problems.push('必须经过地址的圈选半径须为 1–50,000 米');
  if(!Number.isFinite(Number(radius.lon))||Math.abs(Number(radius.lon))>180)problems.push('必须经过地址缺少有效经度');
  if(!Number.isFinite(Number(radius.lat))||Math.abs(Number(radius.lat))>90)problems.push('必须经过地址缺少有效纬度');
  if(!radius.coordinateSystem)problems.push('必须经过地址须注明坐标系');
  return problems;
}
export function validateBrief(b) {
  const errors=[];
  if(!Object.hasOwn(INDUSTRIES,b.industry)) errors.push('请选择赛题规定的行业');
  if(!Number.isFinite(+b.budget)||+b.budget<1000000||+b.budget>5000000) errors.push('预算应在 100–500 万元之间');
  errors.push(...scheduleErrors(b,validDate));
  if(!Array.isArray(b.media)||!b.media.length||b.media.some(m=>!CHANNELS.some(c=>c.id===m))) errors.push('至少选择一种有效投放渠道');
  if(!Number.isFinite(+b.discount)||+b.discount<=0||+b.discount>1) errors.push('价格系数应大于 0 且不超过 1');
  errors.push(...quoteFees(b).errors);
  errors.push(...selectionErrors(b));
  errors.push(...invoiceIssues(b));
  errors.push(...addressIssues(b));
  return errors;
}
export function distanceKm(a,b) {
  const r=Math.PI/180, dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function calculatePlan(records,b,places=[]) {
  const errors=validateBrief(b),fees=quoteFees(b),invoiceWarnings=invoicePending(b);
  if(errors.length) return {errors,lines:[],total:0,media:0,production:0,execution:0,monitoring:0,fees,warnings:[...fees.pending.map(x=>x+'待确认'),...invoiceWarnings],remaining:b.budget,excluded:[],days:0,periods:0,segments:[],eligible:0,units:0,districts:[],mediaCounts:{},coveredPlaces:0,tax:null};
  const ranges=campaignRanges(b),segments=ranges.map(r=>({...r,days:Math.round((Date.parse(r.end)-Date.parse(r.start))/DAY)+1}));
  // Each discontinuous booking is rounded independently. Gap days are never charged.
  const days=segments.reduce((s,r)=>s+r.days,0),periods=segments.reduce((s,r)=>s+Math.ceil(r.days/28),0);
  const excluded=[], eligible=[];
  for(const row of records) {
    if(!b.media.includes(row.media)) continue;
    const spatial=spatialFacts(row,b);const issues=[...quoteConditionIssues(row,ranges),...spatial.issues];
    if(issues.length) { excluded.push({...row,reason:issues[0],issues}); continue; }
    const tags=INDUSTRIES[b.industry].tags;
    const matches=(Array.isArray(row.tags)?row.tags:[]).filter(t=>tags.includes(t));
    const nearby=places.filter(p=>Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&distanceKm(row,p)<=p.radius/1000);
    const score=35+matches.length*14+Math.min(nearby.length,3)*12+(row.grade==='S'?9:row.grade==='A'?5:0);
    const billing=billingTerms(row,segments,b.discount),{mediaUnitCents,productionUnitCents}=billing,executionUnitCents=fees.executionUnitCents,unitTotalCents=mediaUnitCents+productionUnitCents+executionUnitCents;
    if(!Number.isSafeInteger(unitTotalCents)||unitTotalCents<=0){excluded.push({...row,reason:'单资源金额须为至少 0.01 元的有效金额',issues:['单资源金额须为至少 0.01 元的有效金额']});continue;}
    eligible.push({...row,...billing,verifiedAreas:spatial.areas,score:Math.min(score,100),matches,nearby:nearby.map(x=>x.name),mediaUnitCents,productionUnitCents,executionUnitCents,unitTotalCents,reasons:[...matches.map(t=>'场景标签：'+t),...nearby.map(p=>'已录入参考点邻近：'+p.name),'源表等级：'+row.grade,'当前可用数量：'+row.available],mediaUnit:mediaUnitCents/100,productionUnit:productionUnitCents/100,unitTotal:unitTotalCents/100,quantity:0});
  }
  const allocation=allocateSelection(eligible,b,fees.monitoringCents);const {remainingCents,mediaCounts}=allocation;
  const lines=eligible.filter(r=>r.quantity>0).map(r=>({...r,amount:r.quantity*r.unitTotalCents/100,mediaAmount:r.quantity*r.mediaUnitCents/100,productionAmount:r.quantity*r.productionUnitCents/100,executionAmount:r.quantity*r.executionUnitCents/100})).sort((a,c)=>c.score-a.score||c.amount-a.amount);
  const mediaCents=lines.reduce((s,r)=>s+r.quantity*r.mediaUnitCents,0),productionCents=lines.reduce((s,r)=>s+r.quantity*r.productionUnitCents,0),executionCents=lines.reduce((s,r)=>s+r.quantity*r.executionUnitCents,0),monitoringCents=lines.length?fees.monitoringCents:0,totalCents=mediaCents+productionCents+executionCents+monitoringCents;
  // 结算发票与税率只做价税拆分展示，不改变应付含税金额，避免重复加税。
  const invoiceRate=b.invoice&&b.invoice.type!=='none'?Number(b.invoice.taxRate):null;
  const tax=Number.isFinite(invoiceRate)&&invoiceRate>0?(()=>{const netCents=Math.round(totalCents/(1+invoiceRate/100));return {rate:invoiceRate,gross:totalCents/100,net:netCents/100,amount:(totalCents-netCents)/100,basis:'按条款税率对含税合计做价税拆分（信息项），不重复加税'};})():null;
  const candidates=eligible.filter(r=>r.quantity===0).map(r=>({id:r.id,name:r.name,media:r.media,grade:r.grade,district:r.district,available:r.available,unitTotal:r.unitTotal,reason:r.unitTotalCents>remainingCents?'预算余量不足以追加；可作待核实备选':'本轮启发式未选入；仍须人工核实替换条件'}));
  const constraintAudit=selectionAudit(lines,b,allocation.unresolved,allocation.areaTargets);
  // 必须经过的地址：只按已核实的同坐标系参考点判断，缺关系或超出半径的资源不进入报价。
  const requiredRadius=b.spatial?.radius;
  if(requiredRadius?.enabled===true){
    const mappings=(b.spatial?.mappings||[]).filter(m=>m.coordinateSystem===requiredRadius.coordinateSystem&&Number.isFinite(m.lon)&&Number.isFinite(m.lat));
    const excludedByAddress=excluded.filter(row=>(row.issues||[]).some(issue=>/圈选|半径|坐标系|参考点/.test(issue))).length;
    constraintAudit.checks.push({label:'必须经过地址',status:lines.length?'pass':'block',detail:'按 '+(requiredRadius.name?requiredRadius.name+' · ':'')+requiredRadius.coordinateSystem+' 参考点 '+requiredRadius.meters+' 米圈选；已核实关系 '+mappings.length+' 条，'+excludedByAddress+' 条资源因缺少或超出已核实参考点被排除'});
    if(!lines.length)constraintAudit.blocking.push('必须经过地址：没有资源能通过已核实参考点核验，请导入同坐标系关系或调整半径');
  }
  errors.push(...constraintAudit.blocking);
  const before=b.selectionBaseline||{},current=new Map(lines.map(r=>[r.id,r]));
  const manualChanges=[...new Set([...Object.keys(before),...current.keys(),...Object.keys(b.selection||{})])].map(id=>({id,name:records.find(r=>r.id===id)?.name||id,before:before[id]||0,after:current.get(id)?.quantity||0,delta:(current.get(id)?.quantity||0)-(before[id]||0),mode:b.selection?.[id]?.mode||'auto',requested:b.selection?.[id]?.quantity})).filter(r=>(Object.keys(before).length&&r.delta!==0)||r.mode!=='auto');
  return {errors,lines,candidates,constraintAudit,manualChanges,reserve:allocation.reserveCents/100,unresolved:allocation.unresolved,total:totalCents/100,media:mediaCents/100,production:productionCents/100,execution:executionCents/100,monitoring:monitoringCents/100,fees,warnings:[...fees.pending.map(x=>x+'待确认，当前总价未包含该项未核实费用'),...invoiceWarnings],remaining:(Math.round(b.budget*100)-totalCents)/100,days,periods,segments,excluded,eligible:eligible.length,units:lines.reduce((s,r)=>s+r.quantity,0),districts:[...new Set(lines.map(r=>String(r.district||'').trim()).filter(Boolean))],mediaCounts,coveredPlaces:places.filter(p=>lines.some(r=>r.nearby.includes(p.name))).length,tax};
}
export function quoteConditionIssues(row,ranges=[]) {
  const issues=[];
  if(!Number.isSafeInteger(row.available)||row.available<=0)issues.push('无可售库存');
  if(!validDate(row.availableStart)||!validDate(row.availableEnd)||row.availableStart>row.availableEnd)issues.push('缺少有效可售起止日期');
  else if(ranges.some(r=>row.availableStart>r.start||row.availableEnd<r.end))issues.push('可售档期未完整覆盖投放期');
  if(!Number.isFinite(row.unitPrice)||row.unitPrice<=0)issues.push('缺少有效刊例价');
  if(!Number.isFinite(row.production)||row.production<0)issues.push('制作费待确认');
  if(!(['day','calendarMonth'].includes(row.billingUnit)&&row.billingSource)&&!(row.periodDays===28&&(!row.billingUnit||row.billingUnit==='period28')))issues.push('计价周期未确认');
  if(row.quoteReconfirmationRequired||row.inventoryReconfirmationRequired)issues.push('复制方案或历史资源需重新核价核档');
  if(row.priceIncludesTax!==true&&!(row.priceIncludesTax===false&&Number.isFinite(row.taxRate)&&row.taxRate>=0&&row.taxRate<=100&&row.billingSource))issues.push('税费口径待确认');
  return issues;
}
export function parseCSV(text,{preserveBlankRows=false}={}) {
  text=text.replace(/^\uFEFF/,''); const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {const c=text[i]; if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(preserveBlankRows||row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV 引号未闭合');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function toCSV(rows) { return '\uFEFF'+rows.map(row=>row.map(v=> {let s=String(v??''); if(typeof v==='string'&&/^[\t\r ]*[=+@-]/.test(s))s="'"+s; return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n'); }
const aliases={billingUnit:['billingUnit','计价单位'],billingSource:['billingSource','计价规则来源'],taxRate:['taxRate','税率'],quoteReconfirmationRequired:['quoteReconfirmationRequired','重新核价'],inventoryReconfirmationRequired:['inventoryReconfirmationRequired','重新核档'],
  id:['id','媒体编号','编号','资源编号'],name:['name','媒体名称','线路名称','线路','点位名称'],media:['media','resourceType','媒体大类','媒体类型','媒体形式','类型'],district:['district','区域','行政区'],grade:['grade','等级','级别','线路级别','线路等级'],available:['available','空车数','可售数量','空位数','空位'],unitPrice:['unitPrice','刊例价','28天刊例价','单价'],production:['production','制作费','单件制作费'],availableStart:['availableStart','可售开始','可售开始日期'],availableEnd:['availableEnd','可售结束','可售结束日期'],lat:['lat','纬度'],lon:['lon','lng','经度'],tags:['tags','场景标签','标签'],source:['source','来源'],snapshotDate:['snapshotDate','查询日期','库存查询日期'],priceSource:['priceSource','价格来源'],priceIncludesTax:['priceIncludesTax','含税','是否含税'],periodDays:['periodDays','计价天数','计费周期天数'],traffic:['traffic','人流量'],trafficMonth:['trafficMonth','人流月份'],operator:['operator','运营公司'],format:['format','媒体规格','媒体形式','媒体类型'],capacity:['capacity','总车辆数（可售）'],maintenance:['maintenance','保养影响容量'],contracted:['contracted','合同车数'],reserved:['reserved','预定车数'],renewal:['renewal','可能续约数'],trafficStatus:['trafficStatus','人流取值说明'],trafficReportCount:['trafficReportCount','关联报告数']
};
export function mapHeaders(headers){const map={};for(const [key,names]of Object.entries(aliases)){for(const name of names){const idx=headers.findIndex(h=>String(h).trim().toLowerCase()===name.toLowerCase());if(idx>=0){map[key]=idx;break;}}}return map;}
export function normalizeRows(matrix,filename,kind='inventory') {
  if(matrix.length<2)throw new Error('文件至少需要表头和一条数据');
  const mapping=mapHeaders(matrix[0]);
  const required=kind==='rates'?['unitPrice']:['name','media','available'];
  const missing=required.filter(k=>mapping[k]===undefined);if(missing.length)throw new Error('缺少字段：'+missing.map(k=>aliases[k][1]).join('、')+'。请下载模板核对表头。');
  if(kind==='rates'&&mapping.id===undefined&&mapping.media===undefined)throw new Error('价格表须包含媒体编号，或媒体类型与等级');
  const errors=[],warnings=[],seen=new Set();
  const numeric=v=>v===undefined||v===null||String(v).trim()===''?null:Number(String(v).replace(/[￥¥,，\s]/g,''));
  const data=matrix.slice(1).map((r,index)=>({r,line:index+2})).filter(({r})=>r.some(x=>String(x??'').trim())).map(({r,line},i)=> {
    const get=k=>mapping[k]===undefined?'':String(r[mapping[k]]??'').trim();
    const mediaText=get('media'), media=channelKey(mediaText);
    if(!media&&!(kind==='rates'&&get('id')&&!mediaText))errors.push('第 '+line+' 行：未知媒体类型 '+mediaText);
    const num=k=>numeric(get(k)); const available=num('available'),unitPrice=num('unitPrice'),production=num('production');
    if(kind==='inventory'&&(!Number.isInteger(available)||available<0))errors.push('第 '+line+' 行：可售数量须为非负整数');
    if((kind==='rates'||unitPrice!==null)&&(!Number.isFinite(unitPrice)||unitPrice<=0))errors.push('第 '+line+' 行：刊例价须大于 0');
    if(production!==null&&(!Number.isFinite(production)||production<0))errors.push('第 '+line+' 行：制作费须为非负数');
    if(get('periodDays') && +get('periodDays')!==28&&!['day','calendarMonth'].includes(get('billingUnit')))errors.push('第 '+line+' 行：仅支持明确的 28 天计价口径，请先核实并换算');
    if(!get('periodDays')&&unitPrice!==null){const message='第 '+line+' 行未填写计价天数：合并时仅保留已有确认值，仍缺失时不会报价';warnings.push(message);}
    const id=get('id')||kind+'-'+(i+1);if(seen.has(id))errors.push('第 '+line+' 行：重复编号 '+id);seen.add(id);
    if(kind==='inventory'&&(!validDate(get('availableStart'))||!validDate(get('availableEnd'))))warnings.push('第 '+line+' 行缺少有效可售日期，将排除在报价外');
    let lat=num('lat'),lon=num('lon');if(lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90))errors.push('第 '+line+' 行：纬度无效');if(lon!==null&&(!Number.isFinite(lon)||Math.abs(lon)>180))errors.push('第 '+line+' 行：经度无效');
    const traffic=num('traffic'),trafficMonth=get('trafficMonth');if(traffic!==null&&!/^2023-(0[1-9]|1[0-2])$/.test(trafficMonth))warnings.push('第 '+line+' 行人流月份不是 2023 年，不参与展示');
    return {...(get('billingUnit')?{billingUnit:get('billingUnit')}:{}),...(get('billingSource')?{billingSource:get('billingSource')}:{}),...(get('taxRate')?{taxRate:num('taxRate')}:{}),...(get('quoteReconfirmationRequired')?{quoteReconfirmationRequired:/^(是|true|1)$/.test(get('quoteReconfirmationRequired'))}:{}),...(get('inventoryReconfirmationRequired')?{inventoryReconfirmationRequired:/^(是|true|1)$/.test(get('inventoryReconfirmationRequired'))}:{}),id,name:get('name'),media,district:get('district'),operator:get('operator'),format:get('format'),capacity:num('capacity'),maintenance:num('maintenance'),contracted:num('contracted'),reserved:num('reserved'),renewal:num('renewal'),sourceRow:line,insightIds:[],grade:get('grade')||'未分级',available,unitPrice,production,availableStart:get('availableStart'),availableEnd:get('availableEnd'),lat,lon,tags:get('tags').split(/[、,，;；|]/).filter(Boolean),source:get('source')||filename,snapshotDate:get('snapshotDate'),priceSource:get('priceSource')||(unitPrice?filename:''),priceIncludesTax:get('priceIncludesTax')?/^(是|true|1|含税)$/i.test(get('priceIncludesTax')):null,periodDays:get('periodDays')?Number(get('periodDays')):null,traffic:traffic!==null&&/^2023-(0[1-9]|1[0-2])$/.test(trafficMonth)?traffic:null,trafficMonth,trafficStatus:get('trafficStatus'),trafficReportCount:num('trafficReportCount')};
  });
  if(data.length>5000)throw new Error('单次最多导入 5000 行');
  return {data,errors,warnings,mapping,headers:matrix[0]};
}
export function mergeRates(records,rates) {
  let matched=0;const warnings=[];
  const data=records.map(row=>{const exact=rates.filter(r=>r.id===row.id&&!r.id.startsWith('rates-'));const candidates=exact.length?exact:rates.filter(r=>r.id.startsWith('rates-')&&r.media===row.media&&r.grade===row.grade);if(candidates.length!==1){warnings.push(row.name+'：'+(candidates.length?'价格匹配不唯一':'没有匹配价格')+'，未覆盖原价');return row;}const rate=candidates[0];if(!Number.isFinite(rate.unitPrice)||rate.unitPrice<=0){warnings.push(row.name+'：单价无效，未覆盖原价');return row;}matched++;return {...row,unitPrice:rate.unitPrice,production:rate.production??row.production,priceIncludesTax:rate.priceIncludesTax??row.priceIncludesTax,periodDays:['day','calendarMonth'].includes(rate.billingUnit)?null:rate.periodDays??row.periodDays,billingUnit:rate.billingUnit||(rate.periodDays===28?'period28':row.billingUnit),billingSource:rate.billingSource??row.billingSource,taxRate:rate.taxRate??row.taxRate,priceSource:rate.priceSource||rate.source||row.priceSource};});
  const incomplete=data.filter(row=>rates.some(rate=>rate.id===row.id||rate.id.startsWith('rates-')&&rate.media===row.media&&rate.grade===row.grade)).map(row=>({id:row.id,name:row.name,issues:quoteConditionIssues(row)})).filter(row=>row.issues.length);
  return {data,matched,warnings,incomplete};
}
export const INVENTORY_HEADERS=['媒体编号','媒体名称','媒体类型','区域','等级','空车数','可售开始','可售结束','28天刊例价','制作费','含税','计价天数','纬度','经度','场景标签','查询日期','来源','价格来源','人流量','人流月份','运营公司','媒体规格','总车辆数（可售）','保养影响容量','合同车数','预定车数','可能续约数','人流取值说明','关联报告数','人流来源文件','计价单位','计价规则来源','税率','重新核价','重新核档'];
export const RATE_HEADERS=['媒体编号','媒体类型','等级','28天刊例价','制作费','含税','计价天数','来源'];
export function inventoryMatrix(records){return [INVENTORY_HEADERS,...records.map(r=>[r.id,r.name,channelName(r.media),r.district||'',r.grade||'',r.available,r.availableStart||'',r.availableEnd||'',r.unitPrice??'',r.production??'',r.priceIncludesTax===true?'是':r.priceIncludesTax===false?'否':'',r.periodDays??'',r.lat??'',r.lon??'',(Array.isArray(r.tags)?r.tags:[]).join('、'),r.snapshotDate||'',r.source||'',r.priceSource||'',r.traffic??'',r.trafficMonth||'',r.operator||'',r.format||'',r.capacity??'',r.maintenance??'',r.contracted??'',r.reserved??'',r.renewal??'',r.trafficStatus||'',r.trafficReportCount??(r.insightIds||[]).length,(Array.isArray(r.trafficSources)?r.trafficSources:[]).join('；'),r.billingUnit||'',r.billingSource||'',r.taxRate??'',r.quoteReconfirmationRequired===undefined?'':r.quoteReconfirmationRequired?'是':'否',r.inventoryReconfirmationRequired===undefined?'':r.inventoryReconfirmationRequired?'是':'否'])];}
