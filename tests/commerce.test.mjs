import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePlan,validateBrief} from '../lib/engine.mjs';
import {quoteSheets} from '../lib/export.mjs';

const base={industry:'食品饮料',brand:'测试品牌',budget:2000000,media:['bus'],start:'2027-01-01',end:'2027-03-31',discount:1,goal:''};
const record=(id,name,unitPrice,media='bus')=>({id,name,media,grade:'A+',format:'大三侧',operator:'测试',district:'',available:4,capacity:4,maintenance:0,contracted:0,reserved:0,renewal:0,unitPrice,production:5000,priceIncludesTax:true,periodDays:28,availableStart:'2027-01-01',availableEnd:'2027-03-31',lat:null,lon:null,tags:[],source:'测试库存',priceSource:'测试核价',insightIds:[],rateIds:[],coverageIds:[]});
const records=[record('B1','线路一',40000),record('B2','线路二',50000)];
const mapping=(resourceId)=>({id:'map-'+resourceId,resourceId,area:'核实区域',landmark:'核实途经地标',relation:'途经',lon:121.5,lat:31.2,coordinateSystem:'WGS84',source:'人工核实关系',verifiedAt:'2026-11-21',verified:true});

test('no invoice terms keeps the previous behaviour and no tax split', () => {
  const plan=calculatePlan(records,base,[]);
  assert.deepEqual(plan.errors,[]);
  assert.equal(plan.tax,null);
  assert.ok(plan.lines.length>0);
});

test('invoice type, tax rate and source are validated; 不开票 requires neither rate nor source', () => {
  assert.deepEqual(validateBrief({...base,invoice:{type:'special',taxRate:6,source:'客户确认专票 6%'}}),[]);
  const missingSource=validateBrief({...base,invoice:{type:'special',taxRate:6,source:''}});
  assert.deepEqual(missingSource,[],'missing invoice source must not block the quote');
  const badRate=validateBrief({...base,invoice:{type:'general',taxRate:0,source:'合同'}});
  assert.deepEqual(badRate,[],'invalid tax rate is a pending term, not a blocker');
  const pending=calculatePlan(records,{...base,invoice:{type:'special',taxRate:6,source:''}},[]);
  assert.ok(pending.lines.length>0,'quote remains when invoice source is pending');
  assert.ok(pending.warnings.some((warning)=>/发票条款待补/.test(warning)));
  const badType=validateBrief({...base,invoice:{type:'vat',taxRate:6,source:'合同'}});
  assert.ok(badType.some((error)=>/发票类型/.test(error)));
  assert.deepEqual(validateBrief({...base,invoice:{type:'none',taxRate:0,source:''}}),[]);
});

test('tax rate only splits the tax-inclusive total and never changes the payable amount', () => {
  const plain=calculatePlan(records,base,[]);
  const plan=calculatePlan(records,{...base,invoice:{type:'special',taxRate:6,source:'客户确认专票 6%'}},[]);
  assert.equal(plan.total,plain.total);
  assert.equal(plan.tax.rate,6);
  assert.equal(plan.tax.gross,plan.total);
  assert.ok(Math.abs(plan.tax.amount-plan.total*6/106)<0.01);
  assert.ok(Math.abs(plan.tax.net+plan.tax.amount-plan.total)<0.01);
  assert.match(plan.tax.basis,/不重复加税/);
});

test('client discount scales media fees only, production stays per resource', () => {
  const full=calculatePlan(records,base,[]);
  const discounted=calculatePlan(records,{...base,discount:0.85},[]);
  assert.ok(Math.abs(discounted.media-full.media*0.85)<0.02,'media fee follows the discount');
  assert.equal(discounted.production,full.production);
  assert.ok(discounted.total<full.total);
});

test('must-pass address excludes resources without a verified same-coordinate relation', () => {
  const brief={...base,spatial:{mappings:[mapping('B1')],radius:{enabled:true,name:'客户指定地址',lon:121.5,lat:31.2,meters:1000,coordinateSystem:'WGS84',source:'客户地址核实'}}};
  const plan=calculatePlan(records,brief,[]);
  assert.deepEqual(plan.errors,[]);
  assert.deepEqual(plan.lines.map((line)=>line.id),['B1']);
  assert.ok(plan.excluded.some((row)=>row.id==='B2'));
  const check=plan.constraintAudit.checks.find((entry)=>entry.label==='必须经过地址');
  assert.ok(check);
  assert.equal(check.status,'pass');
  assert.match(check.detail,/客户指定地址/);
  assert.match(check.detail,/1000 米/);
  assert.match(check.detail,/1 条资源/);
});

test('address radius rejects invalid coordinates and blocks when nothing can be verified', () => {
  const invalid=validateBrief({...base,spatial:{radius:{enabled:true,lon:121.5,lat:31.2,meters:0,coordinateSystem:''}}});
  assert.ok(invalid.some((error)=>/半径/.test(error)));
  assert.ok(invalid.some((error)=>/经度|纬度|坐标系/.test(error)));
  const blocked=calculatePlan(records,{...base,spatial:{mappings:[],radius:{enabled:true,name:'空地址',lon:121.5,lat:31.2,meters:500,coordinateSystem:'GCJ-02'}}},[]);
  assert.equal(blocked.lines.length,0);
  assert.ok(blocked.errors.some((error)=>/必须经过地址/.test(error)));
});

test('quote sheets export the discount, invoice, tax split and address basis', () => {
  const brief={...base,discount:0.85,invoice:{type:'special',taxRate:6,source:'客户确认专票 6%'},spatial:{mappings:[mapping('B1')],radius:{enabled:true,name:'客户指定地址',lon:121.5,lat:31.2,meters:2000,coordinateSystem:'WGS84',source:'客户地址核实'}}};
  const plan=calculatePlan(records,brief,[]);
  const sheets=quoteSheets({brief,records,places:[],evidence:[],strategyText:'',strategySource:''},plan);
  const text=JSON.stringify(sheets);
  assert.match(text,/8\.5 折/);
  assert.match(text,/增值税专票/);
  assert.match(text,/价税拆分/);
  assert.match(text,/客户指定地址/);
  assert.match(text,/不重复加税/);
  const quoteSheet=sheets.find((sheet)=>sheet.name==='报价口径');
  assert.ok(quoteSheet.rows.some((row)=>row[0]==='客户折扣'));
  assert.ok(quoteSheet.rows.some((row)=>row[0]==='结算发票'));
  assert.ok(quoteSheet.rows.some((row)=>row[0]==='必须经过地址'));
});