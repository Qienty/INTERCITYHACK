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
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));
try{
  await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('.mix-panel').waitFor();
  await page.locator('[data-demo-quick]').click();
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#modal').evaluate((el)=>el.open),false,'one-click quote opens no modal');
  const state=await saved();
  assert.equal(state.demoMode,true);
  assert.equal(state.demoBasis,'mid');
  assert.equal(state.brief.start,'2027-01-01');
  assert.equal(state.brief.end,'2027-03-31');
  assert.match(await page.locator('.mix-panel').innerText(),/刊例|合计/);
  assert.ok(await page.locator('.mix-channel').count()>=1,'combination appears immediately');
  const total=await page.locator('.mix-quote-row.total dd').innerText();
  assert.match(total,/¥/);
  assert.match(await page.locator('.demo-banner').innerText(),/刊例/);
  assert.match(await page.locator('.mix-quote').innerText(),/客户折扣|结算发票/);
  await page.screenshot({path:resolve('test-results','quick-quote-1440.png'),fullPage:true});

  await page.locator('[data-page="proposal"]').first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.proposal-cover').count(),1,'proposal renders from the rate quote');
  assert.match(await page.locator('.mode-watermark').innerText(),/刊例/);
  assert.deepEqual(errors,[]);
  console.log('PASS browser quick quote: 一步用 07 刊例价（区间中位）生成报价，默认 2027Q1 档期，无弹窗直出组合与提案');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}