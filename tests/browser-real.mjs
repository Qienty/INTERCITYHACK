import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseCSV} from '../lib/engine.mjs';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
const dir=resolve('test-results');await mkdir(dir,{recursive:true});
const browser=await pw.chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await context.addInitScript(()=>{if(!sessionStorage.getItem('legacy-seeded')){localStorage.setItem('xinyun-studio-v1',JSON.stringify({records:[{id:'DEMO-LEGACY',demo:true,name:'旧缓存'}],brief:{brand:'旧缓存品牌'}}));sessionStorage.setItem('legacy-seeded','1');}});
  await page.goto('http://localhost:3000');await page.locator('.strategy').waitFor();
  assert.equal(await page.locator('#brand').inputValue(),'');assert.equal(await page.locator('[data-brief="start"]').inputValue(),'');
  assert.match(await page.locator('.stats').textContent(),/431/);assert.match(await page.locator('.stats').textContent(),/888/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('xinyun-studio-v1')),null);
  assert.equal(await page.locator('.map-area svg').count(),0);console.log('PASS real dashboard, blank unknown inputs, removed legacy cache and empty coordinates');
  await page.screenshot({path:resolve(dir,'real-desktop.png'),fullPage:true});
  await page.locator('nav [data-page="resources"]').click();assert.equal(await page.locator('.data-table tbody tr').count(),10);assert.match(await page.locator('.list-count').textContent(),/共 431 项/);
  await page.locator('#resource-search').fill('955');assert.equal(await page.locator('.data-table tbody tr').count(),2);
  await page.locator('#resource-search').fill('1002');await page.locator('[data-resource-insights]').first().click();assert.match(await page.locator('#modal').textContent(),/1002/);
  await page.locator('#modal [data-insight]').first().click();assert.match(await page.locator('#modal').textContent(),/年龄画像/);await page.locator('[data-action="close"]').first().click();console.log('PASS original inventory fields, duplicate route forms and linked audience details');
  await page.locator('nav [data-page="coverage"]').click();assert.equal(await page.locator('.data-table tbody tr').count(),26);await page.locator('[data-insight]').first().click();assert.match(await page.locator('#modal').textContent(),/206.66万人/);await page.locator('[data-action="close"]').first().click();
  await page.screenshot({path:resolve(dir,'real-insights.png'),fullPage:true});console.log('PASS all 26 source reports and raw audience display');
  await page.locator('nav [data-page="proposal"]').click();assert.match(await page.locator('.content').textContent(),/当前尚未形成报价方案/);assert.equal(await page.locator('[data-action="export-html"]').count(),0);console.log('PASS no zero-price or fictional proposal is offered');
  await page.locator('nav [data-page="data"]').click();assert.match(await page.locator('.stats').textContent(),/27/);assert.match(await page.locator('.stats').textContent(),/15/);assert.equal(await page.locator('[data-action="demo-csv"]').count(),0);
  let downloadPromise=page.waitForEvent('download');await page.locator('[data-action="inventory-export"]').click();const file=await downloadPromise;const csvPath=resolve(dir,'real-inventory.csv');await file.saveAs(csvPath);const csv=parseCSV(await readFile(csvPath,'utf8'));assert.equal(csv.length,432);assert.equal(csv[1][8],'');assert.equal(csv[1][11],'');console.log('PASS CSV exports real rows and preserves empty price/billing fields');
  downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export-project"]').click();const backup=await downloadPromise;const backupPath=resolve(dir,'real-project.json');await backup.saveAs(backupPath);
  const picker=page.waitForEvent('filechooser');await page.locator('[data-action="import-project"]').click();await(await picker).setFiles(backupPath);await page.locator('#toast.show').waitFor();assert.match(await page.locator('#toast').textContent(),/恢复/);assert.match(await page.locator('.stats').textContent(),/431/);console.log('PASS real project backup restores with empty date inputs');
  await page.locator('nav [data-page="studio"]').click();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(dir,'real-mobile.png'),fullPage:true});console.log('PASS responsive layout');
  assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
}finally{await browser.close();}
