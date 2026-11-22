import {realInventory as legacyInventory,realInsights,realInventorySnapshots,realRates,dataManifest} from '../data/real-data.mjs';
import {normalizeRows} from './engine.mjs';

const identity=row=>[row.name,row.operator||'',row.format||'',row.grade||''].join('|');
const legacyByIdentity=new Map();for(const row of legacyInventory){const key=identity(row);const matches=legacyByIdentity.get(key)||[];matches.push(row);legacyByIdentity.set(key,matches);}
const parsed=realInventorySnapshots.map(snapshot=>{const result=normalizeRows(snapshot.rows,snapshot.source);return {...snapshot,result,rows:result.data};}).filter(snapshot=>!snapshot.result.errors.length);
// Prefer the supplied combined view. Its bus/metro copies are alternative views, not extra stock.
const combined=parsed.filter(s=>s.rows.some(r=>r.media==='bus')&&s.rows.some(r=>r.media==='metro')).sort((a,b)=>String(b.rows[0]?.snapshotDate||'').localeCompare(String(a.rows[0]?.snapshotDate||'')))[0];
const metroOnly=parsed.filter(s=>s.rows.length&&s.rows.every(r=>r.media==='metro')).sort((a,b)=>String(b.rows[0]?.snapshotDate||'').localeCompare(String(a.rows[0]?.snapshotDate||'')))[0];
const chosen=combined||metroOnly;
const snapshotRows=(chosen?.rows||[]).map(row=>{
  const matches=row.media==='bus'?legacyByIdentity.get(identity(row))||[]:[];
  const legacy=matches.length===1?matches[0]:null;
  return {...row,sourceFile:chosen.source,sourceSheet:'CSV',sourceRef:'CSV!A'+row.sourceRow+':AI'+row.sourceRow,...(legacy?{sourceResourceId:legacy.id}:{}),rateIds:legacy?.rateIds||[],insightIds:[],coverageIds:legacy?.coverageIds||[],idOrigin:'红豆系统导出原始媒体编号；按原表保留查询日期与可售窗口'};
});
export const sourceInventory=combined?snapshotRows:[...structuredClone(legacyInventory),...snapshotRows.filter(r=>r.media==='metro')];
const byLegacyId=new Map(sourceInventory.filter(r=>r.sourceResourceId).map(r=>[r.sourceResourceId,r.id]));
const entranceKey=value=>{let depth=0,result='';for(const char of String(value||'').normalize('NFKC')){if(char==='(')depth++;else if(char===')')depth=Math.max(0,depth-1);else if(!depth&&char.trim())result+=char;}return result;};
const lineCodes=value=>[...new Set((String(value||'').toUpperCase().match(/L[0-9]{1,2}/g)||[]).map(code=>'L'+code.slice(1).padStart(2,'0')))];
export const sourceInsights=realInsights.map(report=>{
  const matchedIds=report.media==='metro'?sourceInventory.filter(row=>row.media==='metro'&&entranceKey(row.name)===entranceKey(report.route)&&lineCodes(report.route).every(code=>lineCodes(row.format).includes(code))).map(row=>row.id):report.matchedIds.map(id=>byLegacyId.get(id)||id).filter(id=>sourceInventory.some(row=>row.id===id));
  return {...report,matchedIds,issues:matchedIds.length?report.issues.filter(s=>s!=='当前库存文件没有同名线路，保留独立报告'):report.issues};
});
for(const row of sourceInventory){
  const reports=sourceInsights.filter(i=>i.matchedIds.includes(row.id));row.insightIds=reports.map(i=>i.id);row.trafficReportCount=reports.length;row.trafficSources=reports.map(i=>i.source);row.traffic=reports.length===1?reports[0].people:null;row.trafficMonth=reports.length===1?reports[0].month:'';row.trafficStatus=reports.length===1?'单报告原表人数；历史数据，非广告曝光':reports.length?'多报告不取单一数值；请分别查看原表，不累加、不任意选取':'无同名报告，未填人流量';
}
const metro=sourceInventory.filter(r=>r.media==='metro');
export const metroCatalogVersion='metro-'+dataManifest.version+'|'+(chosen?.source||'');
export const sourceManifest={...dataManifest,inventoryCount:sourceInventory.length,activeInventorySource:chosen?.source||'公交车身媒体库存.xlsx',summary:{...dataManifest.summary,available:sourceInventory.reduce((s,r)=>s+(r.available||0),0),totalCapacity:sourceInventory.reduce((s,r)=>s+(r.capacity||0),0),withVacancy:sourceInventory.filter(r=>r.available>0).length,withInsights:sourceInventory.filter(r=>r.insightIds.length).length,linkedInsights:sourceInsights.filter(i=>i.matchedIds.length).length,unlinkedInsights:sourceInsights.filter(i=>!i.matchedIds.length).length,withRateReferences:sourceInventory.filter(r=>r.rateIds.length).length,metroInventory:metro.length,metroAvailable:metro.reduce((s,r)=>s+(r.available||0),0),busInventory:sourceInventory.filter(r=>r.media==='bus').length},issues:dataManifest.issues.filter(s=>!s.includes('库存文件没有可售起止日期'))};

Object.assign(sourceManifest.summary,{contracted:sourceInventory.reduce((sum,r)=>sum+(r.contracted||0),0),reserved:sourceInventory.reduce((sum,r)=>sum+(r.reserved||0),0),maintenance:sourceInventory.reduce((sum,r)=>sum+(r.maintenance||0),0),singleReportInventory:sourceInventory.filter(r=>r.insightIds.length===1).length,multiReportInventory:sourceInventory.filter(r=>r.insightIds.length>1).length,unlinkedDuplicateInsights:sourceInsights.filter(i=>!i.matchedIds.length&&i.duplicateOf).length,unlinkedDistinctGroups:new Set(sourceInsights.filter(i=>!i.matchedIds.length).map(i=>i.duplicateOf||i.id)).size});

export function appendMissingMetro(state,{force=false}={}){
  if(state.projectMeta?.status==='archived')return {added:0};
  if(!force&&state.metroCatalogVersion===metroCatalogVersion)return {added:0};
  const knownBulk=state.records.length>=legacyInventory.length&&state.records.some(r=>String(r.id).startsWith('BUS-')||String(r.id).startsWith('HDBUS-'));
  if(!force&&(!knownBulk||state.records.some(r=>r.media==='metro'))){state.metroCatalogVersion=metroCatalogVersion;return {added:0};}
  const existing=new Set(state.records.map(r=>r.id));const extra=metro.filter(r=>!existing.has(r.id));
  state.records.push(...structuredClone(extra));state.metroCatalogVersion=metroCatalogVersion;return {added:extra.length};
}
