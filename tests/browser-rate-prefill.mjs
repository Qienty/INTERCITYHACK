import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {server} from '../server.mjs';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('nav [data-page="resources"]').click();
  await page.locator('.data-table tbody tr').first().waitFor();
  await page.locator('.data-table tbody tr').first().locator('[data-detail]').first().click();
  await page.locator('#modal [data-condition-resource]').click();
  await page.locator('#resource-conditions').waitFor();

  // 07 刊例区间可一键填入价格与计费口径，但不会自动确认日期/含税
  assert.equal(await page.locator('.rate-prefill').count(),1,'rate prefill block is shown when a rate matches');
  const hint=await page.locator('.rate-prefill').innerText();
  assert.match(hint,/07-媒体刊例价\.xlsx/);
  assert.match(hint,/区间中位/);
  await page.locator('[data-rate-fill]').click();
  assert.equal(await page.locator('#condition-price').inputValue(),'50000','A++ rate midpoint 4–6万 is filled');
  assert.equal(await page.locator('#condition-production').inputValue(),'7500','production range 5–10千 midpoint is filled');
  assert.equal(await page.locator('#condition-period').inputValue(),'calendarMonth','month-based rate selects the natural-month billing basis');
  assert.match(await page.locator('#condition-source').inputValue(),/07-媒体刊例价\.xlsx/);
  assert.match(await page.locator('#condition-source').inputValue(),/测算值待核实/);

  // 下限/上限也可选，且不会自动保存或改写库存
  await page.locator('#condition-rate-basis').selectOption('low');
  await page.locator('[data-rate-fill]').click();
  assert.equal(await page.locator('#condition-price').inputValue(),'40000');
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')||'{}').records||[])).filter((row)=>row.unitPrice).length,0,'prefill never writes inventory before saving');

  assert.deepEqual(errors,[]);
  console.log('PASS browser rate prefill: 07 刊例区间可一键填入价格/制作费/计费口径，标注来源且不自动确认或改写库存');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}