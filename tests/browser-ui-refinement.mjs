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

  // 1. 预算可直接填写，滑杆/快捷档同步
  await page.locator('#budget-input').fill('250.5');
  await page.locator('#budget-input').press('Tab');
  await page.waitForTimeout(500);
  let state=await saved();
  assert.equal(state.brief.budget,2505000,'typed budget is kept exactly');
  assert.equal(await page.locator('#budget').inputValue(),'250.5');
  assert.equal(await page.locator('#budget-output').textContent(),'250.5');
  await page.locator('[data-budget="300"]').click();
  await page.waitForTimeout(400);
  state=await saved();
  assert.equal(state.brief.budget,3000000);
  assert.equal(await page.locator('#budget-input').inputValue(),'300');
  await page.locator('#budget').evaluate((el)=>{el.value='420';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForTimeout(500);
  assert.equal((await saved()).brief.budget,4200000);
  assert.equal(await page.locator('#budget-input').inputValue(),'420');

  // 2. 行业 chips 与隐藏 select 同步
  await page.locator('[data-industry="银行保险"]').click();
  await page.waitForTimeout(400);
  assert.equal((await saved()).brief.industry,'银行保险');
  assert.equal(await page.locator('#industry').inputValue(),'银行保险');
  assert.equal(await page.locator('[data-industry="银行保险"]').getAttribute('aria-pressed'),'true');

  // 3. 分段标题有色区分，标题有颜色
  const design=await page.evaluate(()=>{
    const sections=[...document.querySelectorAll('.brief-section')].map((el)=>getComputedStyle(el.querySelector('.brief-section-head strong')).color);
    return {
      sections,
      numbers:document.querySelectorAll('.brief-section-num').length,
      h1:getComputedStyle(document.querySelector('h1')).color,
      activeTab:getComputedStyle(document.querySelector('.work-tabs button.active')).color,
      spinner:getComputedStyle(document.querySelector('#budget-input')).appearance,
    };
  });
  assert.ok(design.numbers>=4,'brief is split into labelled sections');
  assert.equal(new Set(design.sections).size,design.sections.length,'section headings use distinct accent colours');
  assert.notEqual(design.h1,'rgb(26, 28, 32)');
  assert.ok(design.spinner==='textfield'||design.spinner==='none','number spinners are removed');

  // 4. 切换标签后主体内容紧跟标签，而不是被组合栏压到下方
  for(const tab of ['selection','construction','monitoring','rules']){
    await page.locator('[data-work-tab="'+tab+'"]').click();
    await page.waitForTimeout(400);
    const order=await page.evaluate(()=>{
      const tabs=document.querySelector('.work-tabs').getBoundingClientRect();
      const view=document.querySelector('.work-view').getBoundingClientRect();
      const mix=document.querySelector('.mix-panel')?.getBoundingClientRect();
      return {tabsBottom:tabs.bottom,viewTop:view.top,mixTop:mix?mix.top:null};
    });
    assert.ok(order.viewTop-order.tabsBottom<40,tab+' content starts under the tabs');
    if(order.mixTop!==null)assert.ok(order.mixTop>order.viewTop,tab+' mix panel sits after the content');
  }
  await page.locator('[data-work-tab="overview"]').click();
  await page.waitForTimeout(300);

  // 5. 移动端抽屉仍可用，页面不横向溢出
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-ui-brief]').click();
  assert.equal(await page.locator('#client-brief').isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.locator('#budget-input').isVisible());
  await page.screenshot({path:resolve('test-results','ui-brief-390.png'),fullPage:false});
  assert.deepEqual(errors,[]);
  console.log('PASS UI refinement: direct budget input with slider/preset sync, coloured brief sections, industry chips, content-first tab switching and mobile brief drawer');
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}