import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {realInventory,realInsights,realRates,realPOIs,realSearches,realBriefSources,dataManifest} from '../data/real-data.mjs';
import {readXlsx} from '../lib/xlsx.mjs';
import {parseCSV,calculatePlan} from '../lib/engine.mjs';
import {searchMaterials} from '../lib/listing.mjs';
const inputs={records:realInventory,insights:realInsights,rates:realRates,pois:realPOIs,searches:realSearches,files:dataManifest.files,imports:[],evidence:[]};

test('report source counts distinguish repeated data from byte-identical files',()=>{
 assert.equal(dataManifest.summary.distinctInsightGroups,27);assert.equal(dataManifest.summary.duplicateInsights,realInsights.filter(r=>r.duplicateOf).length);
 assert.equal(dataManifest.summary.byteDuplicateReports,dataManifest.files.filter(f=>f.type==='历史人流画像').length-new Set(dataManifest.files.filter(f=>f.type==='历史人流画像').map(f=>f.sha256)).size);assert.equal(dataManifest.summary.unlinkedDuplicateInsights,realInsights.filter(r=>!r.matchedIds.length&&r.duplicateOf).length);assert.equal(dataManifest.summary.unlinkedDistinctGroups,16);
 assert.ok(realInsights.every(r=>r.filenameRoute===r.route));
});
test('multiple reports never imply a single chosen traffic value and every rateIds key exists',()=>{
 const multiple=realInventory.filter(r=>r.insightIds.length>1);assert.equal(multiple.length,dataManifest.summary.multiReportInventory);
 for(const r of realInventory){assert.ok(Array.isArray(r.rateIds));assert.equal(r.trafficReportCount,r.insightIds.length);assert.equal(r.trafficSources.length,r.insightIds.length);}
 for(const r of multiple){assert.equal(r.traffic,null);assert.match(r.trafficStatus,/多报告不取单一数值/);}
 const linked=realRates.filter(r=>r.matchedIds.length);assert.equal(linked.length,3);assert.deepEqual(linked.map(r=>r.matchedIds.length).sort((a,b)=>a-b),[48,181,200]);
 assert.ok(realInventory.filter(r=>['南京路观光线','都市观光线'].includes(r.name)).every(r=>r.rateIds.length===0));
});
test('every user spreadsheet/CSV is catalogued and all source hashes reconcile',async()=>{
 const files=(await readdir(new URL('../data/',import.meta.url),{recursive:true})).filter(n=>/\.(xlsx?|csv)$/i.test(n)).sort();assert.ok(files.length>70);assert.deepEqual(dataManifest.files.map(f=>f.name).sort(),files.map(n=>n.replaceAll('\\','/')).sort());
 for(const f of dataManifest.files){const bytes=await readFile(new URL('../data/'+f.name,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,f.name);}
});
test('all thirty range rates keep original amount, period, production and source cells',async()=>{
 assert.equal(realRates.length,30);const rows=readXlsx(await readFile(new URL('../data/07-媒体刊例价.xlsx',import.meta.url)))[0].rows;
 for(const r of realRates){const row=rows[r.sourceRow-1];assert.equal(r.name,String(row[1]).trim());assert.equal(r.priceText,String(row[2]).trim());assert.equal(r.periodText,String(row[4]).trim());assert.equal(r.productionText,String(row[5]).trim());assert.equal(r.priceIncludesTax,null);assert.equal(r.periodDays,null);}
 const bus=realRates.find(r=>r.mediaType==='公交车'&&r.name==='A++');assert.equal(bus.priceLow,40000);assert.equal(bus.priceHigh,60000);assert.equal(bus.productionLow,5000);assert.equal(bus.productionHigh,10000);assert.equal(bus.periodText,'1月');
 assert.equal(realInventory.filter(r=>r.rateIds?.length).length,429);assert.ok(realInventory.every(r=>r.unitPrice===null&&r.periodDays===null&&r.availableStart===''));
 assert.equal(calculatePlan(realInventory,{industry:'食品饮料',brand:'',budget:2000000,media:['bus'],start:'2027-03-01',end:'2027-03-28',discount:1}).lines.length,0);
});
test('current metro exports retain thirteen distinct entrances without creating station inventory',()=>{
 assert.equal(realInsights.length,dataManifest.insightCount);assert.equal(realInsights.filter(r=>r.media==='metro').length,dataManifest.summary.metroInsights);assert.equal(new Set(realInsights.filter(r=>r.media==='metro').map(r=>r.route)).size,13);assert.ok(realInsights.filter(r=>r.media==='metro').every(r=>r.matchedIds.length===0));assert.equal(realInventory.length,431);
 for(const i of realInsights.filter(r=>r.duplicateOf))assert.ok(realInsights.some(r=>r.id===i.duplicateOf));
});
test('all 64 point rows retain coordinates from literal CSV strings, with no guessed coordinate system',async()=>{
 const name='周边点位_圆形_东方明珠_商场_景点_20261121.csv',rows=parseCSV(await readFile(new URL('../data/'+name,import.meta.url),'utf8'));
 assert.equal(realPOIs.length,64);assert.equal(rows.length,65);
 for(const p of realPOIs){const row=rows[p.sourceRow-1],numeric=text=>Number(text.replace(/^="?/,'').replace(/"$/,''));assert.equal(p.name,row[2]);assert.equal(p.address,row[5]);assert.equal(p.lon,numeric(row[9]));assert.equal(p.lat,numeric(row[10]));assert.equal(p.coordinateSystem,null);assert.ok(!('available'in p));}
 assert.equal(realSearches.length,1);assert.equal(realSearches[0].count,149);assert.equal(realSearches[0].lon,null);assert.equal(realBriefSources.length,1);assert.equal(realBriefSources[0].filledCount,0);
});
test('new rates, metro reports, source locations and summary records can be retrieved independently',()=>{
 assert.equal(searchMaterials(inputs,'一大会址新天地','insight').length,realInsights.filter(r=>r.route.includes('一大会址新天地')).length);assert.ok(searchMaterials(inputs,'A++','rate').length>=2);assert.ok(searchMaterials(inputs,'259M','place').length);assert.equal(searchMaterials(inputs,'149','search').length,1);
 assert.ok(searchMaterials(inputs,'客户需求导入模板','file').some(r=>r.subtitle.includes('空白')));
});
