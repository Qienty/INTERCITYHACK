import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sourceInventory} from '../lib/source-catalog.mjs';
import {realInventory,realCoverage,dataManifest} from '../data/real-data.mjs';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await mkdir(resolve('test-results'),{recursive:true});
const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 const confirmed={...realInventory[0],unitPrice:43210,production:0,priceIncludesTax:false,periodDays:28,availableStart:'2027-03-01',availableEnd:'2027-03-28',conditionsConfirmedAt:'2026-11-21',coverageIds:[]};
 const custom={...realInventory[1],id:'CUSTOM-IMPORTED',name:'已确认导入资源',source:'已核实库存.csv'};
 await context.addInitScript(({confirmed,custom})=>{if(!sessionStorage.getItem('coverage-refresh-seeded')){localStorage.setItem('xinyun-studio-v2-real',JSON.stringify({sourceVersion:'previous-source-version',brief:{industry:'食品饮料',brand:'保留的客户需求',budget:2000000,media:['bus'],start:'',end:'',discount:1,goal:''},records:[confirmed,custom],places:[],evidence:[],imports:[{name:'已核实库存.csv',type:'用户导入',count:1}]}));sessionStorage.setItem('coverage-refresh-seeded','1');}},{confirmed,custom});
 await page.goto('http://localhost:3000');await page.locator('.resource-card').waitFor();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));
 assert.equal(saved.records.length,sourceInventory.length+1);assert.equal(saved.records[0].unitPrice,43210);assert.equal(saved.records[0].production,0);assert.equal(saved.records[0].priceIncludesTax,false);assert.equal(saved.records.at(-1).id,custom.id);assert.equal(saved.imports.length,dataManifest.files.length+1);
 assert.deepEqual(saved.records[0].coverageIds,realInventory[0].coverageIds);
 assert.ok(await page.evaluate(()=>localStorage.getItem('xinyun-studio-before-source-refresh')));
 await page.locator('nav [data-page="coverage"]').click();assert.equal(await page.locator('.coverage-source-panel tbody tr').count(),8);
 await page.locator('[data-coverage-list-page="2"]').click();assert.match(await page.locator('.coverage-source-panel').textContent(),/第 9–16 份/);
 await page.locator('#coverage-source-query').fill('虹桥国际机场');assert.equal(await page.locator('[data-coverage-open]').count(),1);await page.locator('[data-coverage-open]').click();
 assert.match(await page.locator('#modal').textContent(),/989.13/);assert.match(await page.locator('#modal').textContent(),/1438.72/);await page.locator('#modal [data-action="close"]').click();
 await page.locator('#coverage-source-query').fill('');
 await page.locator('#materials-query').fill('人民广场');await page.locator('[data-material-kind="coverage"]').click();
 const report=realCoverage.find(r=>r.name==='人民广场');await page.locator('[data-material-type="coverage"][data-material-id="'+report.id+'"]').click();
 assert.equal(await page.locator('#modal tbody tr').count(),10);assert.match(await page.locator('#modal').textContent(),/131.07 \/ 426.97/);
 await page.locator('[data-coverage-detail-page="2"]').click();assert.match(await page.locator('#modal').textContent(),/第 11–20 条/);
 await page.locator('[data-coverage-section="details"]').click();assert.match(await page.locator('#modal').textContent(),/121.48149169283094/);assert.match(await page.locator('#modal').textContent(),/最近轨迹点/);
 await page.locator('#modal [data-detail]').first().click();assert.match(await page.locator('#modal').textContent(),/关联的平台覆盖报告/);await page.locator('#modal [data-coverage-open]').first().click();assert.match(await page.locator('#modal').textContent(),/站点坐标不填入公交线路坐标/);
 await page.locator('#modal [data-action="close"]').click();await page.locator('[data-action="clear-materials"]').click();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.coverage-source-panel').scrollIntoViewIfNeeded();await page.screenshot({path:resolve('test-results','coverage-import-'+width+'.png')});}
 await page.reload();await page.locator('.resource-card').waitFor();saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));assert.equal(saved.sourceVersion,dataManifest.version);assert.equal(saved.records[0].unitPrice,43210);assert.equal(saved.brief.brand,'保留的客户需求');assert.deepEqual(errors,[]);
 console.log('PASS new coverage search/paging/details, exact distance and source coordinates, inventory links, source refresh preserving confirmed values and imports, responsive widths');
}finally{await context.close();await browser.close();}
