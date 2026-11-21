export const INDUSTRIES = {
  '食品饮料': {brand:'待调研饮料品牌',campaign:'把日常经过，变成品牌相遇',audience:'年轻白领、城市通勤者与品质生活人群',objective:'围绕线下消费场景，连接通勤与商圈触点。',tags:['商圈','办公','社区'],color:'#ee7753'},
  '银行保险': {brand:'待调研金融品牌',campaign:'在每一次通勤中，积累信任',audience:'家庭决策者、职场人群与社区居民',objective:'优先覆盖网点周边社区与办公区域，建立持续品牌认知。',tags:['办公','社区','交通'],color:'#577bbd'},
  '保健品': {brand:'待调研保健品牌',campaign:'让健康，走进身边的生活',audience:'关注健康管理的家庭与成熟消费人群',objective:'联动药房、社区与生活圈，以稳定频次建立健康品牌认知。',tags:['社区','医疗','商圈'],color:'#4d9381'},
  '私立医院': {brand:'待调研医疗品牌',campaign:'离优质医疗，更近一步',audience:'周边家庭、高品质医疗服务需求人群',objective:'以院区为中心验证交通可达性，覆盖居住和办公人群。',tags:['医疗','社区','办公'],color:'#6b88b6'},
  '乐园（主题公园）': {brand:'待调研乐园品牌',campaign:'快乐，从出发的那一刻开始',audience:'亲子家庭、年轻客群与城市游客',objective:'连接家庭生活圈、交通枢纽与休闲商圈，促成出游考虑。',tags:['休闲','交通','商圈'],color:'#b68b51'}
};
export const DAY=86400000;
export function validDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
export function validateBrief(b) {
  const errors=[];
  if(!INDUSTRIES[b.industry]) errors.push('请选择赛题规定的行业');
  if(!Number.isFinite(+b.budget)||+b.budget<1000000||+b.budget>5000000) errors.push('预算应在 100–500 万元之间');
  if(!validDate(b.start)||!validDate(b.end)||b.start>b.end||!b.start.startsWith('2027-')||!b.end.startsWith('2027-')) errors.push('请选择 2027 年内有效的开始与结束日期');
  if(!Array.isArray(b.media)||!b.media.length) errors.push('至少选择一种投放媒体');
  if(!Number.isFinite(+b.discount)||+b.discount<=0||+b.discount>1) errors.push('价格系数应大于 0 且不超过 1');
  return errors;
}
export function distanceKm(a,b) {
  const r=Math.PI/180, dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function calculatePlan(records,b,places=[]) {
  const errors=validateBrief(b);
  if(errors.length) return {errors,lines:[],total:0,remaining:b.budget,excluded:[],days:0,periods:0,units:0,districts:[],mediaCounts:{},coveredPlaces:0};
  const days=Math.round((Date.parse(b.end)-Date.parse(b.start))/DAY)+1, periods=Math.ceil(days/28);
  const excluded=[], eligible=[];
  for(const row of records) {
    if(!b.media.includes(row.media)) continue;
    let reason='';
    if(!Number.isInteger(row.available)||row.available<=0) reason='无可售库存';
    else if(!validDate(row.availableStart)||!validDate(row.availableEnd)) reason='缺少可售起止日期';
    else if(row.availableStart>b.start||row.availableEnd<b.end) reason='可售档期未完整覆盖投放期';
    else if(!Number.isFinite(row.unitPrice)||row.unitPrice<=0) reason='缺少有效刊例价';
    else if(!Number.isFinite(row.production)||row.production<0) reason='制作费待确认';
    else if(row.periodDays!==28) reason='计价周期未确认';
    else if(row.priceIncludesTax!==true) reason='税费口径待确认';
    if(reason) { excluded.push({...row,reason}); continue; }
    const tags=INDUSTRIES[b.industry].tags;
    const matches=(row.tags||[]).filter(t=>tags.includes(t));
    const nearby=places.filter(p=>Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&distanceKm(row,p)<=p.radius/1000);
    const score=35+matches.length*14+Math.min(nearby.length,3)*12+(row.grade==='S'?9:row.grade==='A'?5:0);
    const mediaUnit=Math.round(row.unitPrice*periods*b.discount*100)/100;
    const unitTotal=Math.round((mediaUnit+row.production)*100)/100;
    eligible.push({...row,score:Math.min(score,100),matches,nearby:nearby.map(x=>x.name),mediaUnit,unitTotal,quantity:0});
  }
  let remainingCents=Math.round(b.budget*100);
  const districtCounts={}, mediaCounts={};
  for(let n=0;n<10000;n++) {
    const candidates=eligible.filter(r=>r.quantity<r.available&&Math.round(r.unitTotal*100)<=remainingCents);
    if(!candidates.length) break;
    candidates.sort((a,c)=> {
      const utility=r=>(r.score/(1+r.quantity*.24+(districtCounts[r.district]||0)*.025))*(!mediaCounts[r.media]?1.35:1)/Math.sqrt(r.unitTotal);
      return utility(c)-utility(a)||String(a.id).localeCompare(String(c.id));
    });
    const row=candidates[0]; row.quantity++; remainingCents-=Math.round(row.unitTotal*100);
    districtCounts[row.district]=(districtCounts[row.district]||0)+1; mediaCounts[row.media]=(mediaCounts[row.media]||0)+1;
  }
  const lines=eligible.filter(r=>r.quantity>0).map(r=>({...r,amount:Math.round(r.quantity*r.unitTotal*100)/100,mediaAmount:Math.round(r.quantity*r.mediaUnit*100)/100,productionAmount:Math.round(r.quantity*r.production*100)/100})).sort((a,c)=>c.score-a.score||c.amount-a.amount);
  const total=lines.reduce((s,r)=>s+r.amount,0), production=lines.reduce((s,r)=>s+r.productionAmount,0);
  return {errors,lines,total:Math.round(total*100)/100,production,remaining:Math.round((b.budget-total)*100)/100,days,periods,excluded,eligible:eligible.length,units:lines.reduce((s,r)=>s+r.quantity,0),districts:[...new Set(lines.map(r=>r.district))],mediaCounts,coveredPlaces:places.filter(p=>lines.some(r=>r.nearby.includes(p.name))).length};
}
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,''); const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {const c=text[i]; if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV 引号未闭合');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function toCSV(rows) { return '\uFEFF'+rows.map(row=>row.map(v=> {let s=String(v??''); if(/^[\t\r ]*[=+@-]/.test(s))s="'"+s; return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n'); }
const aliases={
  id:['id','媒体编号','编号','资源编号'],name:['name','媒体名称','线路名称','线路','点位名称'],media:['media','resourceType','媒体大类','媒体类型','媒体形式','类型'],district:['district','区域','行政区'],grade:['grade','等级','级别','线路级别','线路等级'],available:['available','空车数','可售数量','空位数','空位'],unitPrice:['unitPrice','刊例价','28天刊例价','单价'],production:['production','制作费','单件制作费'],availableStart:['availableStart','可售开始','可售开始日期'],availableEnd:['availableEnd','可售结束','可售结束日期'],lat:['lat','纬度'],lon:['lon','lng','经度'],tags:['tags','场景标签','标签'],source:['source','来源'],snapshotDate:['snapshotDate','查询日期','库存查询日期'],priceSource:['priceSource','价格来源'],priceIncludesTax:['priceIncludesTax','含税','是否含税'],periodDays:['periodDays','计价天数','计费周期天数'],traffic:['traffic','人流量'],trafficMonth:['trafficMonth','人流月份'],operator:['operator','运营公司'],format:['format','媒体规格','媒体形式','媒体类型'],capacity:['capacity','总车辆数（可售）'],maintenance:['maintenance','保养影响容量'],contracted:['contracted','合同车数'],reserved:['reserved','预定车数'],renewal:['renewal','可能续约数']
};
export function mapHeaders(headers){const map={};for(const [key,names]of Object.entries(aliases)){for(const name of names){const idx=headers.findIndex(h=>String(h).trim().toLowerCase()===name.toLowerCase());if(idx>=0){map[key]=idx;break;}}}return map;}
export function normalizeRows(matrix,filename,kind='inventory') {
  if(matrix.length<2)throw new Error('文件至少需要表头和一条数据');
  const mapping=mapHeaders(matrix[0]);
  const required=kind==='rates'?['media','unitPrice']:['name','media','available'];
  const missing=required.filter(k=>mapping[k]===undefined);if(missing.length)throw new Error('缺少字段：'+missing.map(k=>aliases[k][1]).join('、')+'。请下载模板核对表头。');
  const errors=[],warnings=[],seen=new Set();
  const numeric=v=>v===undefined||v===null||String(v).trim()===''?null:Number(String(v).replace(/[￥¥,，\s]/g,''));
  const data=matrix.slice(1).filter(r=>r.some(x=>String(x??'').trim())).map((r,i)=> {
    const get=k=>mapping[k]===undefined?'':String(r[mapping[k]]??'').trim();
    const mediaText=get('media'), media=/公交|bus/i.test(mediaText)?'bus':/地铁|metro/i.test(mediaText)?'metro':'';
    if(!media)errors.push('第 '+(i+2)+' 行：未知媒体类型 '+mediaText);
    const num=k=>numeric(get(k)); const available=num('available'),unitPrice=num('unitPrice'),production=num('production');
    if(kind==='inventory'&&(!Number.isInteger(available)||available<0))errors.push('第 '+(i+2)+' 行：可售数量须为非负整数');
    if(unitPrice!==null&&(!Number.isFinite(unitPrice)||unitPrice<=0))errors.push('第 '+(i+2)+' 行：刊例价须大于 0');
    if(production!==null&&(!Number.isFinite(production)||production<0))errors.push('第 '+(i+2)+' 行：制作费须为非负数');
    if(get('periodDays') && +get('periodDays')!==28)errors.push('第 '+(i+2)+' 行：仅支持明确的 28 天计价口径，请先核实并换算');
    if((kind==='rates'||unitPrice!==null)&&!get('periodDays'))errors.push('第 '+(i+2)+' 行：须注明计价天数 28');
    const id=get('id')||kind+'-'+(i+1);if(seen.has(id))errors.push('第 '+(i+2)+' 行：重复编号 '+id);seen.add(id);
    if(kind==='inventory'&&(!validDate(get('availableStart'))||!validDate(get('availableEnd'))))warnings.push('第 '+(i+2)+' 行缺少有效可售日期，将排除在报价外');
    let lat=num('lat'),lon=num('lon');if(lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90))errors.push('第 '+(i+2)+' 行：纬度无效');if(lon!==null&&(!Number.isFinite(lon)||Math.abs(lon)>180))errors.push('第 '+(i+2)+' 行：经度无效');
    const traffic=num('traffic'),trafficMonth=get('trafficMonth');if(traffic!==null&&!/^2023-(0[1-9]|1[0-2])$/.test(trafficMonth))warnings.push('第 '+(i+2)+' 行人流月份不是 2023 年，不参与展示');
    return {id,name:get('name'),media,district:get('district'),operator:get('operator'),format:get('format'),capacity:num('capacity'),maintenance:num('maintenance'),contracted:num('contracted'),reserved:num('reserved'),renewal:num('renewal'),sourceRow:i+2,insightIds:[],grade:get('grade')||'未分级',available,unitPrice,production,availableStart:get('availableStart'),availableEnd:get('availableEnd'),lat,lon,tags:get('tags').split(/[、,，;；|]/).filter(Boolean),source:get('source')||filename,snapshotDate:get('snapshotDate'),priceSource:get('priceSource')||(unitPrice?filename:''),priceIncludesTax:get('priceIncludesTax')?/^(是|true|1|含税)$/i.test(get('priceIncludesTax')):null,periodDays:get('periodDays')?Number(get('periodDays')):null,traffic:traffic!==null&&/^2023-(0[1-9]|1[0-2])$/.test(trafficMonth)?traffic:null,trafficMonth};
  });
  if(data.length>5000)throw new Error('单次最多导入 5000 行');
  return {data,errors,warnings,mapping,headers:matrix[0]};
}
export function mergeRates(records,rates) {
  let matched=0;const warnings=[];
  const data=records.map(row=>{const exact=rates.filter(r=>r.id===row.id&&!r.id.startsWith('rates-'));const candidates=exact.length?exact:rates.filter(r=>r.id.startsWith('rates-')&&r.media===row.media&&r.grade===row.grade);if(candidates.length!==1){warnings.push(row.name+'：'+(candidates.length?'价格匹配不唯一':'没有匹配价格')+'，未覆盖原价');return row;}matched++;const rate=candidates[0];return {...row,unitPrice:rate.unitPrice,production:rate.production,priceIncludesTax:rate.priceIncludesTax,priceSource:rate.source};});return {data,matched,warnings};
}
export const INVENTORY_HEADERS=['媒体编号','媒体名称','媒体类型','区域','等级','空车数','可售开始','可售结束','28天刊例价','制作费','含税','计价天数','纬度','经度','场景标签','查询日期','来源','价格来源','人流量','人流月份','运营公司','媒体规格','总车辆数（可售）','保养影响容量','合同车数','预定车数','可能续约数'];
export const RATE_HEADERS=['媒体编号','媒体类型','等级','28天刊例价','制作费','含税','计价天数','来源'];
export function inventoryMatrix(records){return [INVENTORY_HEADERS,...records.map(r=>[r.id,r.name,r.media==='bus'?'公交车身':'地铁出入口',r.district||'',r.grade||'',r.available,r.availableStart||'',r.availableEnd||'',r.unitPrice??'',r.production??'',r.priceIncludesTax===true?'是':r.priceIncludesTax===false?'否':'',r.periodDays??'',r.lat??'',r.lon??'',(r.tags||[]).join('、'),r.snapshotDate||'',r.source||'',r.priceSource||'',r.traffic??'',r.trafficMonth||'',r.operator||'',r.format||'',r.capacity??'',r.maintenance??'',r.contracted??'',r.reserved??'',r.renewal??''])];}
