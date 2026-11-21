import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
const out=resolve('.taste-skill/after');await mkdir(out,{recursive:true});
const browser=await pw.chromium.launch({channel:'msedge',headless:true});
const errors=[],report=[];
try{
 for(const width of [1440,768,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000');
  for(const view of ['studio','resources','coverage','proposal','data']){
   await page.locator('nav [data-page="'+view+'"]').click();await page.evaluate(()=>scrollTo(0,0));
   const audit=await page.evaluate(()=>{
    const visible=el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden]');};
    const small=[...document.querySelectorAll('h1,h2,h3,p,small,label,button,th,td,summary')].filter(visible).filter(el=>parseFloat(getComputedStyle(el).fontSize)<11).map(el=>el.tagName+':'+el.textContent.slice(0,30));
    return {page:document.body.dataset.page,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,small,activeNav:document.querySelector('nav [aria-current="page"]')?.dataset.page,skipVisible:document.querySelector('.skip-link').getBoundingClientRect().bottom>0};
   });
   report.push(audit);assert.ok(audit.scrollWidth<=width,view+' overflow '+width);assert.deepEqual(audit.small,[]);assert.equal(audit.activeNav,view);assert.equal(audit.skipVisible,false);
   await page.screenshot({path:resolve(out,view+'-'+width+'.png'),fullPage:true});
  }
  await page.locator('#materials-query').fill('1002');assert.ok(await page.locator('.material-result').count());
  const searchBounds=await page.locator('.materials-results-panel').boundingBox();assert.ok(searchBounds.x>=0&&searchBounds.x+searchBounds.width<=width,'Search popup fits '+width);
  await page.locator('#materials-query').press('Escape');assert.equal(await page.locator('.materials-results-panel').isVisible(),false);await page.locator('#materials-query').press('Enter');assert.equal(await page.locator('.materials-results-panel').isVisible(),true);await page.locator('[data-action="clear-materials"]').click();
  await page.locator('nav [data-page="coverage"]').click();await page.locator('.report-directory summary').click();assert.equal(await page.locator('.report-directory table').isVisible(),false);await page.locator('.report-directory summary').click();assert.equal(await page.locator('.report-directory table').isVisible(),true);
  await page.locator('nav [data-page="data"]').click();await page.locator('.source-directory summary').click();assert.equal(await page.locator('.source-directory table').isVisible(),false);await page.locator('.source-directory summary').click();assert.equal(await page.locator('.source-directory table').isVisible(),true);
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'layout-audit.json'),JSON.stringify({report,errors},null,2));console.log('PASS: five views at 1440/768/390; no page overflow, no text under 11px, active navigation, material-search keyboard dismissal, reversible report/source disclosure and no runtime errors.');
}finally{await browser.close();}
