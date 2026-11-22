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
  await page.locator('#client-brief').waitFor();
  await page.locator('.top-actions [data-action="save"]').click();await page.waitForTimeout(300);
  assert.equal((await saved()).quoteFile?.name,'07-媒体刊例价.xlsx','first entry defaults to the 07 rate file');
  assert.ok((await saved()).quoteFile?.rates?.length>=30);

  const csv=['媒体类型,发布线路/位置/级别/形式,刊例价（区间化口径）,媒体数量,发布期,制作费单价（区间化口径）','公交车,S,约1–2万,1,1月,约1–2千','地铁出入口,A++,约2–3万,1,1月,约1–2千'].join('\n');
  await page.locator('[data-quote-file-input]').first().setInputFiles({name:'新报价文件.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForTimeout(700);
  let state=await saved();
  assert.equal(state.quoteFile.name,'新报价文件.csv');
  assert.equal(state.quoteFile.builtin,false);
  assert.equal(state.quoteFile.rates.length,2);
  assert.equal(state.quoteFile.rates[0].priceLow,10000);
  assert.match(await page.locator('.quote-file-field').innerText(),/新报价文件\.csv/);

  // 报价直接用新文件（区间中位）生成，不再依赖旧的 07 文件
  await page.locator('[data-demo-quick]').click();
  await page.waitForTimeout(900);
  assert.ok(await page.locator('.mix-channel').count()>=1);
  assert.match(await page.locator('.mix-panel').innerText(),/新报价文件\.csv|刊例/);
  assert.match(await page.locator('.proposal-exports').first().innerText(),/提案导出/);
  assert.ok(await page.locator('.proposal-exports [data-action="export-html"]').count()>=1,'export toolbar is reachable from the workbench');

  // 恢复默认 07
  await page.locator('[data-action="quote-file-reset"]').first().click();
  await page.waitForTimeout(600);
  state=await saved();
  assert.equal(state.quoteFile.name,'07-媒体刊例价.xlsx');
  assert.equal(state.quoteFile.builtin,true);
  assert.deepEqual(errors,[]);
  console.log('PASS browser quote file: defaults to 07, replaces with an uploaded CSV, quotes from the new file, restores default, and export toolbar is visible');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}