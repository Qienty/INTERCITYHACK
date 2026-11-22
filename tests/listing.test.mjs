import test from 'node:test';
import assert from 'node:assert/strict';
import {paginate,matchesQuery,searchMaterials} from '../lib/listing.mjs';
import {realInventory,realInsights,dataManifest} from '../data/real-data.mjs';
const inputs={records:realInventory,insights:realInsights,files:dataManifest.files,imports:dataManifest.files,evidence:[]};
test('pagination reaches every real row once, preserving data and order',()=>{
  const before=JSON.stringify(realInventory),ids=[];
  for(let p=1;p<=44;p++)ids.push(...paginate(realInventory,p,10).items.map(r=>r.id));
  assert.deepEqual(ids,realInventory.map(r=>r.id));assert.equal(JSON.stringify(realInventory),before);
  assert.deepEqual([paginate(realInventory,44,10).start,paginate(realInventory,44,10).end],[431,431]);
});
test('pagination clamps shrinking lists and has a valid empty state',()=>{
  assert.equal(paginate(realInventory.slice(0,2),44,10).page,1);
  assert.deepEqual(paginate([],4,10),{items:[],total:0,pages:1,page:1,size:10,start:0,end:0});
  assert.equal(paginate(realInventory,-2,5).page,1);
});
test('search matches multiple terms, ignores case and normalizes full width characters',()=>{
  assert.equal(matchesQuery(['1002','巴士公司','A++'],'１００２ 公司'),true);
  assert.equal(matchesQuery(['BUS-123'],'bus'),true);
  assert.equal(matchesQuery(['1002','巴士公司'],'1002 医院'),false);
  assert.deepEqual(searchMaterials(inputs,'   '),[]);
});
test('search uses all real rows before pagination and locates linked reports',()=>{
  const id=realInventory.at(-1).id;
  assert.equal(searchMaterials(inputs,id,'inventory')[0].id,id);
  const found=searchMaterials(inputs,'1002');
  assert.ok(found.some(r=>r.kind==='inventory'));assert.ok(found.some(r=>r.kind==='insight'));
  assert.ok(searchMaterials(inputs,'1002 2023-05','insight').length>0);
  assert.deepEqual(searchMaterials(inputs,'__no_such_material_548__'),[]);
});
test('separate source reports remain searchable without duplicate file cards',()=>{
  const reports=searchMaterials(inputs,'历史人流','insight');assert.equal(reports.length,realInsights.length);
  const found=searchMaterials(inputs,realInsights[0].source);assert.equal(found.filter(r=>r.kind==='insight').length,1);assert.equal(found.filter(r=>r.kind==='file').length,0);
  assert.equal(searchMaterials(inputs,'公交车身媒体库存.xlsx','file').length,1);
});
test('newly imported material metadata and user research are indexed without changing sources',()=>{
  const extended={...inputs,imports:[{name:'pricing-review.csv',type:'刊例价',count:3}],evidence:[{title:'客户已确认需求',note:'关注线下门店周边客流',url:''}]};
  assert.equal(searchMaterials(extended,'pricing-review','file').length,1);
  assert.equal(searchMaterials(extended,'门店 客流','evidence')[0].title,'客户已确认需求');
});
