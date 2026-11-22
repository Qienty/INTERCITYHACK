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
  await page.locator('.mix-panel [data-demo-mode="on"]').click();
  await page.locator('#demo-mode-form').waitFor();
  await page.locator('#demo-mode-form input[name="media"][value="metro"]').check();
  await page.locator('#demo-mode-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
  await page.locator('[data-work-tab="construction"]').click();
  await page.locator('#construction-config').waitFor();

  // 引导式表单：三步标题、建议窗口已预填、一键按钮存在
  const guide=await page.evaluate(()=>({
    steps:[...document.querySelectorAll('#construction-config .work-fieldset legend')].map((el)=>el.textContent.trim()),
    windowValues:[...document.querySelectorAll('#construction-config .work-window select')].map((el)=>el.value),
    windowLabels:[...document.querySelectorAll('#construction-config .work-window select option:checked')].map((el)=>el.textContent.trim()),
    suggestionTag:[...document.querySelectorAll('#construction-config .work-window-head .tag')].map((el)=>el.textContent.trim()),
    hint:document.querySelector('#construction-config .work-step-hint')?.textContent.trim()||'',
    suggestButton:!!document.querySelector('[data-work-action="suggest-windows"]'),
    demoButton:!!document.querySelector('[data-work-action="demo-construction"]'),
  }));
  assert.deepEqual(guide.steps,['① 班组产能','② 施工时间窗口','③ 停工日与确认']);
  assert.ok(guide.windowValues.length>=4&&guide.windowValues.every((value)=>value),'suggested windows are prefilled');
  assert.ok(guide.windowLabels.every((label)=>/（周[日一二三四五六]）/.test(label)),'date options show the weekday');
  assert.ok(guide.suggestionTag.some((text)=>/建议日期/.test(text)));
  assert.match(guide.hint,/保存后系统自动拆批/);
  assert.equal(guide.suggestButton,true);
  assert.equal(guide.demoButton,true,'demo estimate shows the one-click condition button');

  // 测算一键条件后保存即可生成批次
  await page.locator('[data-work-action="demo-construction"]').click();
  await page.waitForTimeout(500);
  let state=await saved();
  assert.deepEqual(state.execution.capacities,{bus:4,metro:2});
  assert.equal(state.execution.confirmed,true);
  assert.equal(state.execution.reserveNights,1);
  assert.match(state.execution.source,/测算/);
  assert.equal(state.execution.windows[0].permitConfirmed,true);
  assert.equal(state.execution.handoff?.nightConfirmed,true);
  await page.locator('#construction-config .btn.dark').click();
  await page.waitForTimeout(700);
  state=await saved();
  assert.ok(state.execution.tasks.length>0,'saving the guided form generates batches');
  assert.ok(await page.locator('.work-view .data-table tbody tr').count()>0);
  assert.equal((await saved()).execution.generationErrors.length,0);

  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});
    await page.locator('[data-work-tab="construction"]').click();
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
    const small=await page.locator('#construction-config').evaluate((root)=>[...root.querySelectorAll('legend,label,small,p,button')].filter((el)=>el.getClientRects().length&&parseFloat(getComputedStyle(el).fontSize)<11).length);
    assert.equal(small,0,'text floor '+width);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser construction guide: three steps, suggested windows prefilled, demo one-click conditions save into batches, and 1440/768/390 stay clean');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}