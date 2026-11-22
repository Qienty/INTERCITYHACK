import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sourceInventory as realInventory} from '../lib/source-catalog.mjs';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await mkdir(resolve('test-results'),{recursive:true});
const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));
try{
 await page.goto('http://localhost:3000');await page.locator('#schedule-unit').waitFor();
 assert.equal(await page.locator('[data-media]').count(),2);assert.equal(await page.locator('[data-brief="start"]').inputValue(),'');
 await page.locator('[data-media="metro"]').check();assert.equal(await page.locator('.channel-hint').count(),0);assert.equal(realInventory.filter(r=>r.media==='metro').length,861);assert.ok((await saved()).brief.media.includes('metro'));
 await page.locator('#schedule-unit').selectOption('year');assert.equal((await saved()).brief.start,'2027-01-01');assert.equal((await saved()).brief.end,'2027-12-31');assert.match(await page.locator('.schedule-summary').textContent(),/365 天投放.*14 个/);
 await page.locator('#schedule-unit').selectOption('quarter');await page.locator('[data-period-index="0"]').selectOption('2');assert.equal((await saved()).brief.start,'2027-04-01');assert.equal((await saved()).brief.end,'2027-06-30');
 await page.locator('#schedule-unit').selectOption('month');await page.locator('[data-period-index="0"]').selectOption('2');assert.equal((await saved()).brief.end,'2027-02-28');
 await page.locator('[data-schedule-mode="segments"]').click();await page.locator('[data-add-segment]').click();await page.locator('[data-period-index="1"]').selectOption('4');assert.equal((await saved()).brief.schedule.ranges.length,2);assert.match(await page.locator('.schedule-summary').textContent(),/2 段.*58 天投放.*3 个/);
 await page.reload();assert.equal(await page.locator('#schedule-unit').inputValue(),'month');assert.equal(await page.locator('.schedule-segment').count(),2);
 await page.locator('[data-period-index="1"]').selectOption('2');assert.match(await page.locator('.schedule-error').textContent(),/不能重叠/);
 await page.locator('[data-period-index="1"]').selectOption('4');await page.locator('#schedule-unit').selectOption('custom');
 await page.locator('[data-range-index="1"][data-range-edge="start"]').fill('2027-04-10');await page.locator('[data-range-index="1"][data-range-edge="start"]').press('Tab');assert.equal((await saved()).brief.schedule.ranges[1].start,'2027-04-10');
 await page.locator('[data-schedule-mode="continuous"]').click();assert.equal((await saved()).brief.start,'2027-02-01');assert.equal((await saved()).brief.end,'2027-04-30');assert.equal(await page.locator('#schedule-unit').inputValue(),'custom');
 console.log('PASS two supported channels, calendar ranges, segment gaps, overlap feedback, persistence and continuous-range conversion');
 await page.locator('[data-intake-action="open"]').click();await page.locator('#brief-source-text').fill('客户品牌：排期流程测试\n客户行业：食品饮料\n预算：200万元\n投放渠道：公交车辆、地铁站站口\n投放日期：月度 2027年3月、5月\n投放目标：使用已确认资源进行投放');await page.locator('[data-intake-action="parse"]').click();
 assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);assert.equal(await page.locator('[data-media]:checked').count(),2);assert.equal(await page.locator('.schedule-segment').count(),2);assert.equal(await page.locator('#schedule-unit').inputValue(),'month');assert.equal(await page.locator('[data-review-apply]').count(),0);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve('test-results','campaign-'+width+'.png'),fullPage:true});}
 await page.locator('[data-action="generate"]').click();assert.equal((await saved()).briefDraft,undefined);assert.equal((await saved()).briefImport.applied.schedule.ranges.length,2);assert.deepEqual((await saved()).records,realInventory);assert.match(await page.locator('.schedule-summary').textContent(),/62 天投放.*4 个/);
 await page.locator('[data-intake-action="receipt"]').click();assert.match(await page.locator('#modal').textContent(),/2027-05-31/);assert.match(await page.locator('#modal').textContent(),/地铁站站口/);await page.locator('#modal [data-action="close"]').click();
 assert.deepEqual(errors,[]);console.log('PASS automatic schedule/channel import, optional editing, one confirmation, source data unchanged, confirmation receipt and responsive layouts');
 await page.evaluate(()=>{const key='xinyun-studio-v2-real',state=JSON.parse(localStorage.getItem(key));state.brief.media=['retail','metroTrain','metro','bus','office','residential'];localStorage.setItem(key,JSON.stringify(state));});
 await page.reload();assert.equal(await page.locator('[data-media]').count(),2);assert.equal(await page.locator('[data-media]:checked').count(),2);assert.deepEqual(new Set((await saved()).brief.media),new Set(['bus','metro']));assert.deepEqual((await saved()).records,realInventory);
 assert.deepEqual(await page.locator('.channels-field .media-option').allTextContents(),['公交车辆','地铁站站口']);console.log('PASS legacy saved channel selections migrate to the two visible options without altering source data');
}finally{await context.close();await browser.close();}
