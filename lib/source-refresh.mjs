// Refresh source evidence while preserving confirmed project inputs by stable ID.
export function refreshSourceRecords(saved, sources) {
  const previous=new Map(saved.map(r=>[r.id,r]));
  const matchedIds=new Set();
  const linked=new Set(['insightIds','rateIds','coverageIds','traffic','trafficMonth','trafficSources','trafficStatus','trafficReportCount']);
  const confirmed=new Set(['unitPrice','production','periodDays','priceIncludesTax','taxRate','billingUnit','billingSource','priceSource','availableStart','availableEnd','snapshotDate','conditionsConfirmedAt']);
  const blank=v=>v===null||v===undefined||v==='';
  const records=sources.map(source=>{
    const old=previous.get(source.id)||(source.sourceResourceId?previous.get(source.sourceResourceId):null);if(!old)return structuredClone(source);
    matchedIds.add(old.id);
    const row={...old,...structuredClone(source)};
    for(const [key,value]of Object.entries(old))if(!linked.has(key)&&!blank(value)&&(blank(source[key])||confirmed.has(key)||(old.updatedFields||[]).includes(key)))row[key]=value;
    if(old.id!==source.id){row.id=old.id;row.upstreamId=source.id;row.idOrigin='沿用既有方案稳定编号；红豆导出编号：'+source.id;}
    return row;
  });
  const ids=new Set(sources.map(r=>r.id));
  for(const row of saved)if(!ids.has(row.id)&&!matchedIds.has(row.id)&&row.id&&row.name&&['bus','metro'].includes(row.media)&&row.source&&row.demo!==true&&!String(row.id).startsWith('DEMO-'))records.push({...row});
  return records;
}
