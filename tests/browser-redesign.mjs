import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {server} from '../server.mjs';
const out='.taste-skill/redesign/verified';await mkdir(out,{recursive:true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
const errors=[],report=[];
try{
 for(const width of [1440,768,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&/\.(css|ttf|js|mjs)(\?|$)/.test(r.url()))errors.push(r.status()+' '+r.url());});
  await page.goto(base);await page.locator('.proposal-workspace').waitFor();await page.evaluate(()=>document.fonts.ready);
  const navigate=async view=>{if(width<=1100)await page.locator('[data-ui-nav]').click();await page.locator('.nav [data-page="'+view+'"]').click();await page.evaluate(()=>scrollTo(0,0));};
  for(const view of ['studio','resources','coverage','proposal','data']){
   await navigate(view);
   const audit=await page.evaluate(()=>({view:document.body.dataset.page,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,fontLoaded:document.fonts.check('14px Geist'),active:document.querySelector('.nav [aria-current=page]')?.dataset.page,small:[...document.querySelectorAll('h1,h2,h3,p,small,label,button,th,td,summary')].filter(e=>e.checkVisibility()).filter(e=>parseFloat(getComputedStyle(e).fontSize)<11).map(e=>e.textContent.slice(0,50))}));
   report.push(audit);assert.equal(audit.h1,1,view+' h1');assert.ok(audit.scrollWidth<=width,view+' overflow '+width);assert.ok(audit.fontLoaded,'Local Geist loaded');assert.equal(audit.active,view);assert.deepEqual(audit.small,[],view+' small text');
   await page.screenshot({path:out+'/'+view+'-'+width+'.png'});
  }
  await navigate('studio');
  if(width<=1100){
   assert.equal(await page.locator('#client-brief').isVisible(),false);
   await page.locator('[data-ui-brief]').click();assert.equal(await page.locator('#client-brief').isVisible(),true);
   await page.locator('[data-budget="100"]').first().click();assert.equal(await page.locator('#client-brief').isVisible(),true,'Brief stays open after recalculation');
   assert.equal(await page.locator('#budget-output').textContent(),'100');
   await page.locator('[data-ui-brief]').click();
   await page.locator('[data-ui-nav]').click();assert.equal(await page.locator('.main').evaluate(e=>e.inert),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('.main').evaluate(e=>e.inert),false);assert.equal(await page.locator('[data-ui-nav]').getAttribute('aria-expanded'),'false');
   await page.locator('[data-ui-nav]').click();
  }
  await page.locator('#materials-query').fill('1002');await page.locator('.material-result').first().waitFor();
  const bounds=await page.locator('.materials-results-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'Search fits viewport');
  await page.locator('#materials-query').press('Escape');assert.equal(await page.locator('.materials-results-panel').isVisible(),false);
  if(width<=1100){assert.equal(await page.locator('.sidebar').isVisible(),true,'First Escape only dismisses search');await page.locator('[data-ui-nav-close].nav-close').click();}
  await page.locator('[data-demo-quick]').click();await page.locator('.mix-kpis').waitFor();
  assert.equal(await page.locator('.materials-results-panel').isVisible(),false,'Dismissed search stays closed after recalculation');
  assert.match(await page.locator('.mix-panel-title').innerText(),/非成交价/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Filled estimate fits viewport');
  await page.locator('#toast.show').waitFor({state:'hidden',timeout:6000});
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/filled-'+width+'.png'});
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/audit.json',JSON.stringify({report,errors},null,2));
 console.log('PASS: 5 screens × 3 widths plus filled estimates; local fonts, navigation, mobile brief, keyboard close, search, no overflow or runtime errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
