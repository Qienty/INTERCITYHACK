// Channel keys retain bus/metro compatibility with existing saved briefs and source inventory.
export const CHANNELS=[
  {id:'bus',label:'公交车辆',aliases:['公交车辆','公交车身','公交车','公交','巴士','bus','bus_vehicle']},
  {id:'metro',label:'地铁站站口',aliases:['地铁站站口','地铁站口','地铁出入口','地铁入口','地铁出口','地铁站','地铁口','地铁','metro','metro_station','metro_entrance']}
];
export function channelName(id){return CHANNELS.find(c=>c.id===id)?.label||id||'未提供';}
export function channelKey(value){const text=String(value??'').trim().toLowerCase();return CHANNELS.find(c=>c.id.toLowerCase()===text||c.aliases.some(a=>a.toLowerCase()===text))?.id||'';}
export function campaignRanges(brief){
  if(brief.schedule?.mode==='segments')return Array.isArray(brief.schedule.ranges)?brief.schedule.ranges.map(r=>({start:r?.start||'',end:r?.end||''})):[];
  return [{start:brief.start||'',end:brief.end||''}];
}
export function periodRange(unit,year,value){
  year=Number(year);if(year!==2027)return {start:'',end:''};
  const month=unit==='year'?1:unit==='quarter'?(Number(value)-1)*3+1:Number(value);
  if(!Number.isInteger(month)||month<1||month>12||(unit==='quarter'&&(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>4)))return {start:'',end:''};
  const count=unit==='year'?12:unit==='quarter'?3:1;
  const pad=n=>String(n).padStart(2,'0');
  return {start:year+'-'+pad(month)+'-01',end:new Date(Date.UTC(year,month+count-1,0)).toISOString().slice(0,10)};
}
export function scheduleSummary(brief){return campaignRanges(brief).map(r=>(r.start||'待填写')+' 至 '+(r.end||'待填写')).join('；');}
export function withSchedule(brief,schedule){
  const ranges=Array.isArray(schedule.ranges)?schedule.ranges:[];
  const sorted=ranges.filter(r=>r&&typeof r.start==='string'&&typeof r.end==='string'&&r.start&&r.end).slice().sort((a,b)=>a.start.localeCompare(b.start));
  return {...brief,schedule:{...schedule,ranges:ranges.map(r=>({...r}))},start:sorted[0]?.start||'',end:sorted.length?sorted.reduce((last,r)=>r.end>last?r.end:last,''):''};
}
export function scheduleErrors(brief,validDate){
  const errors=scheduleShapeErrors(brief);
  if(errors.length)return errors;
  const ranges=campaignRanges(brief);
  if(!ranges.length)errors.push('请至少添加一段投放日期');
  if(ranges.length>24)errors.push('投放分段最多 24 段');
  for(const [i,r]of ranges.entries())if(!validDate(r.start)||!validDate(r.end)||r.start>r.end||!r.start.startsWith('2027-')||!r.end.startsWith('2027-'))errors.push((ranges.length>1?'第 '+(i+1)+' 段：':'')+'请选择 2027 年内有效的开始与结束日期');
  if(!errors.length){const sorted=[...ranges].sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<sorted.length;i++)if(sorted[i].start<=sorted[i-1].end){errors.push('投放分段不能重叠，请调整日期后再报价');break;}}
  if(!errors.length&&brief.schedule){const sorted=[...ranges].sort((a,b)=>a.start.localeCompare(b.start)),end=sorted.reduce((last,r)=>r.end>last?r.end:last,'');if(brief.start!==sorted[0].start||brief.end!==end)errors.push('排期摘要与实际投放时段不一致');}
  return errors;
}
export function scheduleShapeErrors(brief){
  const s=brief?.schedule;
  if(s===undefined)return [];
  if(!s||typeof s!=='object'||Array.isArray(s)||!['year','quarter','month','custom'].includes(s.unit)||!['continuous','segments'].includes(s.mode))return ['投放日期的周期或投放方式无效'];
  if(!Array.isArray(s.ranges)||s.ranges.length>24||s.ranges.some(r=>!r||typeof r!=='object'||typeof r.start!=='string'||typeof r.end!=='string'))return ['投放分段格式无效，最多 24 段'];
  if(s.mode==='continuous'&&s.ranges.length!==1)return ['连续投放只能有一个时段，请改为分段投放'];
  if(s.mode==='continuous'&&(s.ranges[0].start!==brief.start||s.ranges[0].end!==brief.end))return ['连续投放的起止日期与时段不一致'];
  return [];
}
