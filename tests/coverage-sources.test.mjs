import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {realCoverage,realInventory,realInsights,dataManifest} from '../data/real-data.mjs';
import {parseCSV} from '../lib/engine.mjs';
import {searchMaterials} from '../lib/listing.mjs';
import {refreshSourceRecords} from '../lib/source-refresh.mjs';
import {reviewSheets} from '../lib/review-export.mjs';

test('all coverage summary and detail cells reconcile to 50 untouched source CSVs',async()=>{
  assert.equal(realCoverage.length,50);let summaries=0,details=0;
  for(const report of realCoverage){
    const matrix=parseCSV(await readFile(new URL('../data/'+report.source,import.meta.url),'utf8'),{preserveBlankRows:true});
    for(const [section,header] of [['summary','媒体类型'],['details','中心点名称']]){
      const index=matrix.findIndex(row=>row[0]===header),keys=matrix[index];
      for(const row of report[section]){
        assert.deepEqual(row.raw,Object.fromEntries(keys.map((key,i)=>[key,matrix[row.sourceRow-1][i]])),report.source+':'+row.sourceRow);
        assert.equal(row.radius,1000);assert.ok(!('available' in row));assert.ok(!('unitPrice' in row));
      }
    }
    assert.equal(report.coordinateSystem,null);assert.equal(report.queryDate,'');assert.equal(report.referenceOnly,true);
    summaries+=report.summary.length;details+=report.details.length;
  }
  assert.equal(summaries,894);assert.equal(details,894);
  assert.equal(dataManifest.summary.coverageSummaryRows,summaries);assert.equal(dataManifest.summary.coverageDetailRows,details);
});

test('coverage links use exact bus aliases and retain independent distance values',()=>{
  const key=name=>name.trim().replace(/路$/,'');
  let linked=0;
  for(const report of realCoverage)for(const row of report.summary){
    if(row.matchedIds.length)linked++;
    for(const id of row.matchedIds){const stock=realInventory.find(r=>r.id===id);assert.equal(stock.media,row.media);assert.ok(stock.name.split('/').some(n=>key(n)===key(row.name)));assert.ok(stock.coverageIds.includes(report.id));}
    if(row.media==='metro')assert.deepEqual(row.matchedIds,[]);
  }
  assert.equal(linked,654);assert.equal(realInventory.filter(r=>r.coverageIds.length).length,151);
  const example=realCoverage.find(r=>r.name==='人民广场').summary[0];
  assert.equal(example.distance,131.07);assert.equal(example.stationDistance,426.97);
  assert.ok(realInventory.every(r=>r.lat===null&&r.lon===null));
});

test('new metro reports retain table names, historical month and repeated data provenance',()=>{
  const extra=realInsights.filter(r=>r.source.startsWith('洞察源文件_'));
  assert.equal(extra.length,dataManifest.files.filter(f=>f.type==='历史人流画像'&&f.name.startsWith('洞察源文件_')).length);
  const namedTest=realInsights.find(r=>r.route.includes('一大会址新天地'));assert.ok(namedTest);assert.ok(extra.every(r=>r.filenameRoute===r.route));
  assert.ok(extra.every(r=>r.media==='metro'&&r.month==='2023-05'&&r.matchedIds.length===0));
  assert.equal(realInsights.filter(r=>!r.source.includes('/')).length,dataManifest.files.filter(f=>f.type==='历史人流画像'&&!f.name.includes('/')).length);
});

test('global search finds coverage by landmark and route while preserving source identity',()=>{
  const input={records:realInventory,insights:realInsights,coverage:realCoverage,files:dataManifest.files,imports:[],evidence:[]};
  const found=searchMaterials(input,'人民广场','coverage');assert.ok(found.some(r=>r.title==='人民广场 · 媒体覆盖分析'));
  assert.ok(searchMaterials(input,'455路','coverage').some(r=>r.source.includes('人民广场')));
});

test('source refresh preserves confirmed prices, zero fees and genuine imported stock',()=>{
  const source=realInventory[0],confirmed={...source,unitPrice:43210,production:0,priceIncludesTax:false,periodDays:28,availableStart:'2027-03-01',availableEnd:'2027-03-28',conditionsConfirmedAt:'2026-11-21',coverageIds:[]};
  const custom={id:'CUSTOM-1',name:'人工导入站口',media:'metro',source:'真实库存导入.csv',available:1};
  const output=refreshSourceRecords([confirmed,custom,{id:'old',name:'旧资料'},{id:'DEMO-1',name:'无效',media:'bus',source:'old.csv'}],realInventory);
  assert.equal(output.length,432);const row=output[0];
  for(const key of ['unitPrice','production','priceIncludesTax','periodDays','availableStart','availableEnd','conditionsConfirmedAt'])assert.equal(row[key],confirmed[key]);
  assert.deepEqual(row.coverageIds,source.coverageIds);assert.equal(row.available,source.available);assert.deepEqual(output.at(-1),custom);
});

test('review workbook separates coverage summary and detail instead of double counting',()=>{
  const state={brief:{industry:'食品饮料',budget:2000000,media:['bus'],start:'',end:'',discount:1,brand:'',goal:''},records:realInventory,places:[],evidence:[],hypothesis:{},delivery:{}};
  const sheets=reviewSheets(state,{coverage:realCoverage});
  for(const name of ['覆盖分析汇总','覆盖分析明细']){const sheet=sheets.find(s=>s.name===name);assert.equal(sheet.rows.length,895);assert.equal(sheet.rows[1][3],1000);assert.equal(sheet.rows[1][14],'未注明');}
});
