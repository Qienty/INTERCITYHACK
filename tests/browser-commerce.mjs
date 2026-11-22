import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {server} from '../server.mjs';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
await mkdir(resolve('test-results'),{recursive:true});
const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));
const total=()=>page.locator('.mix-quote-row.total dd').innerText();
try{
  await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('.mix-panel').waitFor();
  await page.locator('.mix-panel [data-demo-mode="on"]').click();
  await page.locator('#demo-mode-form').waitFor();
  await page.locator('#demo-mode-form input[name="media"][value="metro"]').check();
  await page.locator('#demo-mode-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#modal').open);

  // 配比：数字框互补、容差、硬约束
  await page.locator('[data-ratio-share="bus"]').fill('60');
  await page.locator('[data-ratio-share="bus"]').press('Tab');
  assert.equal(await page.locator('[data-ratio-share="metro"]').inputValue(),'40');
  assert.equal((await saved()).brief.constraints.busShare,60);
  await page.locator('[data-ratio-tolerance]').fill('5');await page.locator('[data-ratio-tolerance]').press('Tab');
  await page.locator('[data-ratio-hard]').check();
  assert.equal((await saved()).brief.constraints.shareTolerance,5);
  assert.equal((await saved()).brief.constraints.shareHard,true);
  assert.match(await page.locator('.mix-ratio').innerText(),/实际|目标/);

  // 客户折扣
  const beforeDiscount=await total();
  await page.locator('[data-commerce="discount"]').fill('8.5');await page.locator('[data-commerce="discount"]').press('Tab');
  assert.ok(Math.abs((await saved()).brief.discount-0.85)<1e-9);
  assert.notEqual(await total(),beforeDiscount);
  assert.match(await page.locator('.mix-quote').innerText(),/客户折扣[\s\S]*8\.5 折/);

  // 结算发票与税率：金额不变，价税拆分只作信息
  const beforeInvoice=await total();
  await page.locator('[data-commerce="invoiceType"]').selectOption('special');
  await page.locator('[data-commerce="taxRate"]').selectOption('6');
  await page.locator('[data-commerce="taxSource"]').fill('客户确认增值税专票 6%');
  await page.locator('[data-commerce="taxSource"]').press('Tab');
  assert.equal((await saved()).brief.invoice.type,'special');
  assert.equal((await saved()).brief.invoice.taxRate,6);
  assert.equal(await total(),beforeInvoice);
  assert.match(await page.locator('.mix-quote').innerText(),/结算发票[\s\S]*税率 6%/);
  assert.match(await page.locator('.mix-panel').innerText(),/信息项|不重复加税/);

  // 必须经过地址：无已核实关系时阻断，并给出明确原因
  await page.locator('.address-field > summary').click();
  await page.locator('[data-address="enabled"]').check();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.mix-panel').innerText(),/必须经过地址/);
  await page.locator('[data-address="name"]').fill('客户指定地址');await page.locator('[data-address="name"]').press('Tab');
  await page.locator('[data-address-radius="2000"]').click();
  await page.waitForTimeout(400);
  assert.equal((await saved()).brief.spatial.radius.name,'客户指定地址');
  assert.equal((await saved()).brief.spatial.radius.meters,2000);
  await page.locator('[data-address="enabled"]').uncheck();
  await page.waitForTimeout(500);
  assert.doesNotMatch(await page.locator('.mix-panel').innerText(),/必须经过地址/);
  await page.screenshot({path:resolve('test-results','browser-commerce-1440.png'),fullPage:true});

  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'brief overflow '+width);
    const small=await page.locator('.brief').evaluate((root)=>[...root.querySelectorAll('.commerce-block input,.commerce-block select,.commerce-block label,.commerce-block small,.commerce-block p,.commerce-block button,.ratio-field input,.ratio-field label,.ratio-field p,.ratio-field button,.address-field input,.address-field select,.address-field label,.address-field p,.address-field button')].filter((el)=>el.getClientRects().length&&parseFloat(getComputedStyle(el).fontSize)<11).length);
    assert.equal(small,0,'text floor '+width);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser commerce: ratio, client discount, invoice/tax split are informational, must-pass address blocks without verified relations and all fields stay responsive');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}