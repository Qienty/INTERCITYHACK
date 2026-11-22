import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceInventory,sourceInsights,sourceManifest,appendMissingMetro,metroCatalogVersion} from '../lib/source-catalog.mjs';
import {realInventory,realInventorySnapshots} from '../data/real-data.mjs';
import {calculatePlan} from '../lib/engine.mjs';
import {refreshSourceRecords} from '../lib/source-refresh.mjs';
test('default catalog uses the real combined snapshot once, including 861 metro entrances and 742 vacant units',()=>{
 assert.equal(sourceInventory.length,1292);assert.equal(new Set(sourceInventory.map(r=>r.id)).size,1292);const metro=sourceInventory.filter(r=>r.media==='metro');assert.equal(metro.length,861);assert.equal(metro.reduce((sum,r)=>sum+r.available,0),742);assert.equal(sourceManifest.summary.metroInventory,861);assert.equal(sourceManifest.summary.metroAvailable,742);
 const input=realInventorySnapshots.find(s=>s.source.includes('_metro_')),headers=input.rows[0],byId=new Map(input.rows.slice(1).map(row=>[row[headers.indexOf('媒体编号')],row]));
 for(const r of metro){const original=byId.get(r.id);assert.ok(original);assert.equal(r.name,original[headers.indexOf('媒体名称')]);assert.equal(r.available,Number(original[headers.indexOf('空车数')]));assert.equal(r.availableStart,'2027-01-01');assert.equal(r.availableEnd,'2027-03-31');for(const key of ['unitPrice','production','priceIncludesTax','periodDays','lat','lon'])assert.equal(r[key],null);}
});
test('old full bus drafts gain metro records without losing stable IDs, confirmed prices or customer requirements',()=>{
 const state={brief:{brand:'原有客户'},records:structuredClone(realInventory),projectMeta:{id:'existing',status:'draft',sourceVersion:'old-source'}};state.records[0].unitPrice=12345;state.records[0].available=0;state.records[0].availableStart='2027-02-01';const before=structuredClone(state.records);
 assert.equal(appendMissingMetro(state).added,861);assert.deepEqual(state.records.slice(0,431),before);assert.equal(state.records.length,1292);assert.equal(state.brief.brand,'原有客户');assert.equal(state.metroCatalogVersion,metroCatalogVersion);assert.equal(appendMissingMetro(state).added,0);
});
test('legacy technical IDs reconcile to upstream IDs without duplicate buses or lost confirmed terms',()=>{
 const saved=structuredClone(realInventory);Object.assign(saved[0],{unitPrice:12345,production:0,priceIncludesTax:true,periodDays:28,availableStart:'2027-01-01',availableEnd:'2027-12-31',conditionsConfirmedAt:'2026-11-21'});
 const refreshed=refreshSourceRecords(saved,sourceInventory);assert.equal(refreshed.length,1292);assert.equal(refreshed[0].id,saved[0].id);assert.equal(refreshed[0].upstreamId,sourceInventory[0].id);assert.equal(refreshed[0].availableEnd,'2027-12-31');assert.equal(refreshed[0].unitPrice,12345);assert.equal(refreshed.filter(r=>r.media==='bus').length,431);assert.equal(refreshed.filter(r=>r.media==='metro').length,861);
});
test('archived stock remains frozen and intentionally partial inventories offer explicit loading rather than replacement',()=>{
 const archived={records:structuredClone(realInventory),projectMeta:{status:'archived'}};assert.equal(appendMissingMetro(archived,{force:true}).added,0);assert.equal(archived.records.length,431);
 const partial={records:[structuredClone(realInventory[0])]};assert.equal(appendMissingMetro(partial).added,0);assert.equal(appendMissingMetro(partial,{force:true}).added,861);assert.equal(partial.records.length,862);
});
test('loaded metro stock remains unquoted until real prices and tax/billing terms are confirmed',()=>{
 const p=calculatePlan(sourceInventory,{industry:'银行保险',brand:'待核实客户',budget:2000000,media:['metro'],start:'2027-01-01',end:'2027-03-31',discount:1});assert.equal(p.lines.length,0);assert.equal(p.total,0);assert.equal(p.excluded.length,861);assert.ok(p.excluded.every(r=>r.issues.some(s=>s.includes('刊例价'))));
 assert.ok(sourceInsights.some(r=>r.media==='metro'&&r.matchedIds.length));assert.ok(sourceInsights.every(r=>r.matchedIds.every(id=>sourceInventory.some(stock=>stock.id===id))));
});
