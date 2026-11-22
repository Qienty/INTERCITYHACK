import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {calculatePlan,validateBrief,normalizeRows,mergeRates,toCSV,parseCSV} from '../lib/engine.mjs';
import {extractBrief,reviewBrief} from '../lib/brief-import.mjs';
import {withSchedule} from '../lib/campaign.mjs';
import {normalizePlaces,validateStoredBrief,normalizeProjectRecords,conditionPatch} from '../lib/state-validation.mjs';
import {quoteSheets,exportHTML} from '../lib/export.mjs';
import {reviewSheets,reviewCSV,reviewHTML} from '../lib/review-export.mjs';
import {readXlsx,writeXlsx,unzip} from '../lib/xlsx.mjs';
import {allowsOrigin} from '../server.mjs';
import {realInventory} from '../data/real-data.mjs';
const brief={industry:'食品饮料',brand:'回归测试专用',budget:2000000,media:['bus'],start:'2027-03-01',end:'2027-03-28',discount:1,goal:''};
const resource={id:'regression',name:'测试资源',media:'bus',grade:'S',district:'',available:1,unitPrice:1000,production:100,periodDays:28,priceIncludesTax:true,availableStart:'2027-01-01',availableEnd:'2027-12-31',tags:['商圈'],priceSource:'测试核价'};
const state=(records=[resource])=>({brief,records,places:[],evidence:[],strategyText:''});

test('precise rate import works by ID without media and fills the billing period',()=>{
  const imported=normalizeRows([['媒体编号','28天刊例价','制作费','含税','计价天数'],['regression',1000,100,'是',28]],'核价.csv','rates');
  assert.deepEqual(imported.errors,[]);
  const merged=mergeRates([{...resource,unitPrice:null,production:null,priceIncludesTax:null,periodDays:null}],imported.data);
  assert.equal(merged.matched,1);assert.deepEqual(merged.incomplete,[]);assert.equal(merged.data[0].periodDays,28);
  assert.equal(calculatePlan(merged.data,brief).total,1100);
});
test('partial rate import retains confirmations but respects explicit zero and false',()=>{
  const partial=normalizeRows([['媒体编号','28天刊例价'],['regression',2000]],'调整.csv','rates');
  const merged=mergeRates([resource],partial.data);assert.equal(merged.data[0].production,100);assert.equal(merged.data[0].priceIncludesTax,true);assert.equal(merged.data[0].periodDays,28);assert.equal(calculatePlan(merged.data,brief).total,2100);
  const explicit=mergeRates([resource],[{id:'regression',unitPrice:2000,production:0,priceIncludesTax:false,periodDays:28}]);
  assert.equal(explicit.data[0].production,0);assert.equal(explicit.data[0].priceIncludesTax,false);assert.match(explicit.incomplete[0].issues.join(''),/税费/);
  assert.ok(normalizeRows([['媒体编号','28天刊例价'],['regression','']],'缺价.csv','rates').errors.length);
});
test('every missing quote condition is exposed together',()=>{
  const r={...resource,unitPrice:null,production:null,periodDays:null,priceIncludesTax:null,availableStart:'',availableEnd:''};
  const p=calculatePlan([r],brief);assert.equal(p.excluded[0].issues.length,5);assert.ok(p.excluded[0].issues.some(i=>i.includes('日期')));
});
test('one-line space-separated and key-tab-value briefs preserve field boundaries',()=>{
  for(const source of ['客户：回归客户 行业：食品饮料 预算：200万 投放媒体：公交车辆 档期：2027-03-01至2027-03-28','客户品牌\t回归客户\t客户行业\t食品饮料\t预算\t200万\t投放媒体\t公交车辆\t档期\t2027-03-01至2027-03-28']){
    const d=extractBrief(source);assert.equal(d.values.brand,'回归客户');assert.equal(d.values.industry,'食品饮料');assert.equal(d.values.budget,2000000);assert.equal(d.values.start,'2027-03-01');assert.equal(d.values.end,'2027-03-28');assert.deepEqual(d.values.media,['bus']);
  }
  const unknown=extractBrief('客户：回归客户 联系人：张三 行业：食品饮料');assert.equal(unknown.values.brand,'回归客户');assert.ok(unknown.warnings.length);
});
test('malformed continuous schedule is rejected in calculation and restored projects',()=>{
  const ranges=[{start:'2027-03-01',end:'2027-03-05'},{start:'2027-03-20',end:'2027-03-31'}];
  const bad=withSchedule(brief,{unit:'custom',mode:'continuous',ranges});assert.ok(validateBrief(bad).length);assert.throws(()=>validateStoredBrief(bad));assert.equal(calculatePlan([resource],bad).lines.length,0);
  const valid=withSchedule(brief,{unit:'custom',mode:'segments',ranges});const p=calculatePlan([resource],valid);assert.deepEqual(p.errors,[]);assert.equal(p.days,17);assert.equal(p.periods,2);
});
test('prototype property names never qualify as industries',()=>{
  for(const industry of ['toString','constructor','__proto__']){
    assert.ok(validateBrief({...brief,industry}).length);assert.ok(reviewBrief(brief,{industry}).errors.length);assert.throws(()=>validateStoredBrief({...brief,industry}));assert.equal(calculatePlan([resource],{...brief,industry}).lines.length,0);assert.throws(()=>exportHTML({...state(),brief:{...brief,industry}}));
  }
});
test('money is calculated in cents and exports reconcile without negative media amounts',()=>{
  for(const r of [{...resource,unitPrice:0.001,production:0.014,available:100},{...resource,unitPrice:0.1,production:0.1,available:3}]){
    const p=calculatePlan([r],brief);assert.ok(p.media>=0);assert.equal(Math.round(p.media*100)+Math.round(p.production*100),Math.round(p.total*100));assert.ok(Number.isInteger(p.production*100));
    for(const line of p.lines)assert.equal(Math.round(line.mediaAmount*100)+Math.round(line.productionAmount*100),Math.round(line.amount*100));
    const total=quoteSheets(state([r]),p)[0].rows.at(-1);assert.equal(total[12],p.media);assert.equal(total[14],p.total);
  }
});
test('allocation has no 10000-unit cap and fills all affordable stock deterministically',()=>{
  const r={...resource,unitPrice:100,production:0,available:100000};const p=calculatePlan([r],{...brief,budget:5000000});assert.equal(p.units,50000);assert.equal(p.total,5000000);assert.equal(p.remaining,0);
});
test('431 priced rows with high quantities allocate within a responsive time bound',t=>{
  const rows=realInventory.map(r=>({...r,available:100000,unitPrice:100,production:0,priceIncludesTax:true,periodDays:28,availableStart:'2027-01-01',availableEnd:'2027-12-31'}));
  const start=performance.now(),p=calculatePlan(rows,{...brief,budget:5000000}),ms=performance.now()-start;
  assert.equal(p.units,50000);assert.equal(p.remaining,0);assert.ok(ms<1000,'allocation exceeded 1 second: '+ms);assert.deepEqual(calculatePlan(rows,{...brief,budget:5000000}).lines,p.lines);t.diagnostic('431 rows / 50000 units: '+ms.toFixed(1)+' ms');
});
test('typed negative CSV numbers stay numeric and formula strings stay protected',()=>{
  const rows=parseCSV(toCSV([['名称','纬度','字符串'],['坐标',-33.8688,'-1+2'],['公式',-1,'=1+1']]));assert.equal(Number(rows[1][1]),-33.8688);assert.equal(rows[1][2],"'-1+2");assert.equal(rows[2][2],"'=1+1");
});
test('blank districts are not counted and original blank row numbers are preserved',()=>{
  assert.deepEqual(calculatePlan([{...resource,district:'  '}],brief).districts,[]);
  const rows=parseCSV('媒体名称,媒体类型,空车数\n\n有效,公交车辆,1\n\n错误,公交车辆,no',{preserveBlankRows:true});const r=normalizeRows(rows,'有空行.csv');assert.equal(r.data[0].sourceRow,3);assert.match(r.errors[0],/第 5 行/);
});
function storedZip(files){
  let offset=0;const locals=[],central=[];const checksum=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
  for(const [name,value]of Object.entries(files)){const n=Buffer.from(name),b=Buffer.from(value),crc=checksum(b),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(crc,14);l.writeUInt32LE(b.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);locals.push(l,n,b);central.push(c,n);offset+=l.length+n.length+b.length;}
  const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,dir,end]);
}
test('legal XLSX implicit cells and missing physical row numbers retain their positions',()=>{
  const files=unzip(writeXlsx([{name:'测试',rows:[['a','b','c']]}]));
  files['xl/worksheets/sheet1.xml']='<worksheet><sheetData><row r="1"><c t="inlineStr"><is><t>A</t></is></c><c t="inlineStr"><is><t>B</t></is></c><c t="inlineStr"><is><t>C</t></is></c></row><row r="3"><c r="C3"><v>3</v></c><c><v>4</v></c><c/><c><v>6</v></c></row></sheetData></worksheet>';
  assert.deepEqual(readXlsx(storedZip(files))[0].rows,[['A','B','C'],[],['','',3,4,'',6]]);
});
test('stored numeric coordinates normalize and malicious radius cannot enter HTML',()=>{
  const place={name:'<script>alert(1)</script>',lon:'121.5',lat:'31.2',radius:'1000'};assert.equal(normalizePlaces([place])[0].lon,121.5);
  assert.deepEqual(normalizePlaces([{...place,radius:'<img src=x onerror=alert(1)>'},{...place,lon:''},{...place,lon:'   '},{...place,radius:true}]),[]);
  const html=exportHTML({...state(),places:[{...place,radius:'<img src=x onerror=alert(1)>'}]});assert.doesNotMatch(html,/<img src=x/);
  const node={innerHTML:''};vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1],{document:{getElementById:()=>node}});assert.doesNotMatch(node.innerHTML,/<img src=x/);
});
test('manual confirmations require every real quote condition without filling blanks',()=>{
  assert.ok(conditionPatch({}).errors.length>=5);const result=conditionPatch({unitPrice:'1000',production:'0',periodDays:'28',priceIncludesTax:'true',availableStart:'2027-01-01',availableEnd:'2027-12-31',priceSource:'回归测试核实记录'});assert.deepEqual(result.errors,[]);assert.equal(result.patch.production,0);
  assert.deepEqual(normalizeProjectRecords(realInventory),realInventory);
});
test('review exports remain clearly nonquote and escape imported content',()=>{
  const s={...state(realInventory),brief:{...brief,brand:'<img src=x onerror=1>',start:'',end:''}};const sheets=reviewSheets(s);assert.match(sheets[0].rows[1][1],/不含推荐报价/);assert.equal(sheets[1].rows.length,432);assert.match(reviewCSV(s),/非投放报价/);const html=reviewHTML(s);assert.match(html,/不含推荐报价/);assert.match(html,/&lt;img src=x/);assert.doesNotMatch(html,/<img src=x/);
});
test('HTTPS proxy origin requires exact public origin or loopback opt-in',()=>{
  const req={headers:{host:'work.example','x-forwarded-proto':'https'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(allowsOrigin(req,'https://work.example',{publicOrigin:'https://work.example'}),true);assert.equal(allowsOrigin(req,'https://evil.example',{publicOrigin:'https://work.example'}),false);
  assert.equal(allowsOrigin(req,'https://work.example',{trustProxy:true,publicOrigin:''}),true);assert.equal(allowsOrigin(req,'https://work.example',{trustProxy:false,publicOrigin:''}),false);
  assert.equal(allowsOrigin({...req,socket:{remoteAddress:'10.0.0.2'}},'https://work.example',{trustProxy:true,publicOrigin:''}),false);assert.equal(allowsOrigin(req,'https://work.example/path',{publicOrigin:'https://work.example'}),false);
});
test('busy port startup exits with a useful message and without an exception stack',async()=>{
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  try{const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(listener.address().port)},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);const [code]=await once(child,'close');assert.equal(code,1);assert.match(output,/已被占用/);assert.doesNotMatch(output,/\n\s+at |throw er/);}finally{await new Promise(r=>listener.close(r));}
});
