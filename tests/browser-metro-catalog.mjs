import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {realInventory,dataManifest} from '../data/real-data.mjs';
import {sourceInventory} from '../lib/source-catalog.mjs';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await mkdir('test-results',{recursive:true});const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const errors=[];
try{
 for(const mode of ['fresh','old-bus-draft','partial-project']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  if(mode!=='fresh')await context.addInitScript(({rows,mode,version})=>{if(sessionStorage.getItem('metro-seeded'))return;sessionStorage.setItem('metro-seeded','1');rows[0].unitPrice=12345;rows[0].production=0;rows[0].priceIncludesTax=true;rows[0].periodDays=28;localStorage.setItem('xinyun-studio-v2-real',JSON.stringify({records:mode==='partial-project'?[rows[0]]:rows,sourceVersion:version,projectMeta:{id:'metro-regression-'+mode,name:'已有客户方案',status:'draft',sourceVersion:'original-library-version'},brief:{industry:'银行保险',brand:'保留的客户',budget:2000000,media:['metro'],start:'2027-01-01',end:'2027-03-31',discount:1,goal:''},places:[],evidence:[],imports:[]}));},{rows:realInventory,mode,version:dataManifest.version});
  await page.goto('http://localhost:3000/#work=overview');await page.locator('.resource-card').waitFor();
  if(mode==='partial-project'){await page.locator('[data-action="load-metro-catalog"]').click();}
  await page.locator('nav [data-page="resources"]').click();await page.locator('[data-filter="metro"]').click();assert.match(await page.locator('.list-count').textContent(),/861/);assert.equal(await page.locator('.resource-card tbody tr').count(),10);assert.ok(await page.locator('.resource-card tbody').textContent());
  await page.locator('#resource-search').fill('上海南站');assert.ok(await page.locator('.resource-card tbody [data-detail]').count());await page.locator('#resource-search').fill('');
  await page.locator('[data-action="save"]').click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));assert.equal(saved.records.filter(r=>r.media==='metro').length,861);assert.equal(saved.records.filter(r=>r.media==='metro').reduce((sum,r)=>sum+r.available,0),742);assert.equal(saved.records.length,mode==='partial-project'?862:1292);
  if(mode!=='fresh'){assert.equal(saved.records[0].id,realInventory[0].id);assert.equal(saved.records[0].unitPrice,12345);assert.equal(saved.records[0].production,0);assert.equal(saved.brief.brand,'保留的客户');}else assert.equal(saved.records[0].id,sourceInventory[0].id);
  if(mode==='fresh')await page.screenshot({path:resolve('test-results/metro-catalog-loaded.png'),fullPage:false});
  await page.reload();await page.locator('.resource-card').waitFor();const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));assert.equal(restored.records.filter(r=>r.media==='metro').length,861);await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS fresh catalog and old bus drafts display 861 real metro entrances, preserve existing prices, support station search, and remain correct after reload');
}finally{await browser.close();}
