import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
import {sourceManifest as dataManifest,sourceInventory as realInventory} from '../lib/source-catalog.mjs';
import {inventoryMatrix,toCSV,parseCSV} from '../lib/engine.mjs';
import {readXlsx} from '../lib/xlsx.mjs';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve(dirname(dirname(process.execPath)),'node_modules/playwright'));}
await mkdir(resolve('test-results'),{recursive:true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await pw.chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const errors=[],context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('xinyun-studio-v2-real')));
const nav=name=>page.locator('nav [data-page="'+name+'"]').click();
async function download(action,name){const pending=page.waitForEvent('download');pending.catch(()=>{});await page.locator('[data-action="'+action+'"]').first().click();const result=await pending,path=resolve('test-results',name);await result.saveAs(path);return readFile(path);}
async function importCSV(kind,rows){await nav('data');const chooser=page.waitForEvent('filechooser');await page.locator('[data-import="'+kind+'"]').first().click();await(await chooser).setFiles({name:'回归专用-'+kind+'.csv',mimeType:'text/csv',buffer:Buffer.from(toCSV(rows))});await page.locator('[data-action="confirm-import"]').waitFor();}
try{
  await page.goto(base);await page.locator('.strategy').waitFor();
  await nav('proposal');assert.equal(await page.locator('[data-action="export-html"]').count(),0);await page.locator('.review-exports summary').click();
  const html=(await download('review-html','review-draft.html')).toString('utf8');assert.match(html,/不含推荐报价/);assert.match(html,/公交车身媒体库存/);
  const excel=readXlsx(await download('review-xlsx','review-draft.xlsx'));assert.equal(excel.find(s=>s.name==='库存核对清单').rows.length,realInventory.length+1);assert.match(excel[0].rows[1][1],/不含推荐报价/);
  const csv=parseCSV((await download('review-csv','review-draft.csv')).toString('utf8'));assert.equal(csv.length,realInventory.length+1);assert.equal(csv[1][8],'');assert.match(csv[1].at(-1),/非投放报价/);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve('test-results','defects-review-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
  console.log('PASS default source-review HTML/XLSX/CSV exports stay marked nonquote with absent prices preserved');
  await nav('studio');await page.locator('#brand').fill('隔离浏览器回归客户');await page.locator('#brand').press('Tab');
  await page.locator('[data-brief="start"]').fill('2027-03-01');await page.locator('[data-brief="start"]').press('Tab');await page.locator('[data-brief="end"]').fill('2027-03-28');await page.locator('[data-brief="end"]').press('Tab');
  await page.locator('[data-action="excluded"]').click();assert.match(await page.locator('#modal').textContent(),/制作费待确认/);assert.match(await page.locator('#modal').textContent(),/计价周期未确认/);await page.locator('[data-condition-resource]').first().click();
  assert.equal(await page.locator('#condition-price').inputValue(),'');assert.equal(await page.locator('#condition-production').inputValue(),'');assert.equal(await page.locator('#condition-period').inputValue(),'');assert.equal(await page.locator('[name="priceIncludesTax"]').isChecked(),false);
  await page.locator('#condition-price').fill('100000');await page.locator('#condition-production').fill('1000');await page.locator('#condition-period').selectOption('28');await page.locator('#condition-start').fill('2027-01-01');await page.locator('#condition-end').fill('2027-12-31');await page.locator('#condition-source').fill('隔离回归专用核实输入，不写入真实源文件');await page.locator('[name="priceIncludesTax"]').check();await page.screenshot({path:resolve('test-results','defects-condition-desktop.png'),fullPage:true});await page.locator('#resource-conditions button[type="submit"]').click();
  assert.equal((await saved()).records[0].unitPrice,100000);assert.match(await page.locator('.strategy').textContent(),/已生成/);await nav('proposal');const quoted=parseCSV((await download('export-csv','defects-quote.csv')).toString('utf8'));assert.equal(Number(quoted.at(-1)[14]),101000*realInventory[0].available);console.log('PASS per-resource missing reasons and manual verified conditions unlock a consistent quote');
  await nav('studio');
  const before=await page.evaluate(()=>{window.__saved=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.__saved++;return set.apply(this,args);};window.__output=document.querySelector('#live-output');return window.__output.innerHTML;});
  await page.locator('#budget').evaluate(el=>{for(let i=0;i<100;i++){el.value=String(100+i*3);el.dispatchEvent(new Event('input',{bubbles:true}));}});
  assert.equal(await page.evaluate(()=>window.__saved),0);assert.equal(await page.locator('#live-output').innerHTML(),before);assert.equal(await page.evaluate(()=>document.querySelector('#live-output')===window.__output),true);
  await page.locator('#budget').dispatchEvent('change');assert.equal(await page.evaluate(()=>window.__saved),1);assert.equal((await saved()).brief.budget,3970000);console.log('PASS 100 budget input events perform no storage writes or output rebuild; change commits once');
  const good=await saved(),bad=structuredClone(good);bad.brief.schedule={unit:'custom',mode:'continuous',ranges:[{start:'2027-03-01',end:'2027-03-05'},{start:'2027-03-20',end:'2027-03-28'}]};
  await nav('data');let picker=page.waitForEvent('filechooser');await page.locator('[data-action="import-project"]').click();await(await picker).setFiles({name:'invalid-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:2,state:bad}))});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('恢复失败'));assert.deepEqual(await saved(),good);
  console.log('PASS malformed schedule backup is rejected without replacing the working project');
  const inventory=[{...realInventory[0],availableStart:'2027-01-01',availableEnd:'2027-12-31'}];await importCSV('inventory',inventoryMatrix(inventory));await page.locator('[data-action="confirm-import"]').click();
  await importCSV('rates',[['媒体编号','28天刊例价','制作费','含税','计价天数'],[inventory[0].id,200000,1000,'是',28]]);assert.match(await page.locator('#modal').textContent(),/匹配 1 条，其中 0 条/);await page.locator('[data-action="confirm-import"]').click();assert.equal((await saved()).records[0].periodDays,28);
  await importCSV('rates',[['媒体编号','28天刊例价'],[inventory[0].id,250000]]);assert.match(await page.locator('#modal').textContent(),/匹配 1 条，其中 0 条/);await page.locator('[data-action="confirm-import"]').click();assert.equal((await saved()).records[0].production,1000);assert.equal((await saved()).records[0].priceIncludesTax,true);await nav('proposal');assert.equal(await page.locator('[data-action="export-html"]').count(),1);
  console.log('PASS dated inventory then precise rate import generates a plan; partial price updates preserve confirmed fields');
  await page.evaluate(()=>{const key='xinyun-studio-v2-real',s=JSON.parse(localStorage.getItem(key));s.places=[{id:'numeric',name:'数值字符串坐标',lon:'121.5',lat:'31.2',radius:'1000'},{id:'bad',name:'恶意半径',lon:121.5,lat:31.2,radius:'<img src=x onerror=1>'}];localStorage.setItem(key,JSON.stringify(s));});await page.reload();await nav('coverage');assert.match(await page.locator('.evidence-list').first().textContent(),/121.5000/);assert.equal(await page.locator('.evidence-list img').count(),0);
  await page.evaluate(()=>{const key='xinyun-studio-v2-real',s=JSON.parse(localStorage.getItem(key));s.brief.industry='toString';localStorage.setItem(key,JSON.stringify(s));});await page.reload();await page.locator('#industry').waitFor();assert.equal(await page.locator('#industry').inputValue(),'食品饮料');assert.match(await page.locator('#toast').textContent(),/本地草稿格式异常/);assert.match(await page.locator('.stats').textContent(),new RegExp(String(realInventory.length)));
  assert.deepEqual(errors,[]);console.log('PASS numeric-string coordinates restore safely; malicious local data cannot white-screen or inject HTML');
}catch(error){console.error('Browser runtime errors:',errors);throw error;}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
