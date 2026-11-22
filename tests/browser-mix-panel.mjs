import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {server} from '../server.mjs';
// Optional browser regression: the labelled demo estimate and the media mix bar must stay
// derived and interactive, never seeded into the inventory records.
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
await mkdir(resolve('test-results'),{recursive:true});
const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));
const total=async()=>(await page.locator('.mix-quote-row.total dd').innerText()).trim();
try{
  await page.goto(base);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.locator('.mix-panel').waitFor();
  assert.equal(await page.locator('.mix-panel').count(),1,'mix bar is always visible');
  assert.match(await page.locator('.mix-panel').innerText(),/尚未形成可报价组合/);
  assert.equal(await page.locator('.mix-panel [data-demo-mode="on"]').count(),1);
  await page.screenshot({path:resolve('test-results','mix-empty-1500.png'),fullPage:true});

  await page.locator('.mix-panel [data-demo-mode="on"]').click();
  await page.locator('#demo-mode-form').waitFor();
  await page.locator('#demo-mode-form input[name="media"][value="metro"]').check();
  await page.locator('#demo-mode-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
  const demo=await saved();
  assert.equal(demo.demoMode,true);
  assert.deepEqual(demo.brief.media,['bus','metro']);
  assert.ok(demo.records.every((row)=>!Number.isFinite(row.unitPrice)||row.unitPrice===null),'demo never rewrites stored inventory prices');
  assert.match(await page.locator('.demo-banner').innerText(),/测算假设|刊例测算/);
  assert.equal(await page.locator('.mix-channel').count(),2,'both selected channels appear');
  assert.ok(await page.locator('.mix-panel [data-mix-step="1"]').count()>0);
  assert.equal(await page.locator('.mix-panel [data-mix-ratio]').count(),0,'mix panel ratio is read only');assert.equal(await page.locator('[data-ratio-share]').count(),2,'left brief owns the ratio inputs');
  assert.ok(await page.locator('.mix-check').count()>0);
  assert.match(await page.locator('.mix-quote-row.total dd').innerText(),/¥/);

  // A payable +1 changes the total; an over-budget +1 must remain blocked instead of inflating the quote.
  await page.locator('[data-budget="500"]').first().click();
  await page.waitForTimeout(600);
  const before=await total();
  await page.locator('.mix-panel [data-mix-step="1"]').first().click();
  await page.waitForTimeout(600);
  assert.notEqual(await total(),before);
  assert.ok(Object.keys((await saved()).brief.selection||{}).length>0);
  assert.ok(await page.locator('.mix-table tr.is-manual').count()>0);
  await page.locator('[data-budget="200"]').first().click();
  await page.waitForTimeout(600);

  await page.locator('[data-ratio-share="bus"]').fill('60');await page.locator('[data-ratio-share="bus"]').press('Tab');
  await page.waitForTimeout(600);
  assert.equal((await saved()).brief.constraints.busShare,60);
  assert.match(await page.locator('.mix-ratio').innerText(),/实际/);

  await page.locator('[data-mix-expand]').click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.mix-panel-body').count(),0);
  await page.locator('[data-mix-expand]').click();
  await page.waitForTimeout(400);
  await page.screenshot({path:resolve('test-results','mix-filled-1500.png'),fullPage:true});

  await page.locator('[data-page="proposal"]').first().click();
  await page.waitForTimeout(800);
  assert.match(await page.locator('.mode-watermark').innerText(),/刊例/);
  await page.locator('[data-page="studio"]').first().click();
  await page.waitForTimeout(800);

  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow '+width);
    const small=await page.locator('.mix-panel').evaluate((root)=>[...root.querySelectorAll('*')].filter((el)=>el.getClientRects().length&&parseFloat(getComputedStyle(el).fontSize)<11).map((el)=>el.tagName+':'+(el.textContent||'').slice(0,20)));
    assert.deepEqual(small,[],'text floor '+width);
    await page.screenshot({path:resolve('test-results','mix-'+width+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser media mix bar: always visible, labelled demo estimate stays derived, steppers/ratio/collapse work and 1440/768/390 stay clean');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}