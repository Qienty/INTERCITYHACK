import test from 'node:test';
import assert from 'node:assert/strict';
import {realInventory,realRates} from '../data/real-data.mjs';
import {calculatePlan} from '../lib/engine.mjs';
import {demoInventory} from '../lib/demo-mode.mjs';
import {closingReportPresentation} from '../lib/closing-report.mjs';
import {writePptx} from '../lib/pptx.mjs';
import {unzip} from '../lib/xlsx.mjs';

const brief={industry:'食品饮料',brand:'测试品牌',budget:2000000,media:['bus','metro'],start:'2027-01-01',end:'2027-03-31',discount:1,goal:'测试投放'};
const metroRow={id:'METRO-TEST-1',name:'测试站口',media:'metro',grade:'L2',format:'出入口',available:5,capacity:5,maintenance:0,contracted:0,reserved:0,renewal:0,unitPrice:null,production:null,priceIncludesTax:null,periodDays:null,availableStart:'',availableEnd:'',lat:null,lon:null,tags:[],source:'测试输入',priceSource:'',insightIds:[],rateIds:[],coverageIds:[]};
const records=[...realInventory.slice(0,40),metroRow];

function makeState(overrides={}) {
  const derived=demoInventory(records,realRates,brief,{basis:'mid'});
  const state={brief,demoMode:true,records,places:[],evidence:[],selection:{},monitoring:{nodes:[
    {id:'0|posting',segment:0,type:'posting',title:'第1段上刊凭证',date:'2027-01-02',deliverable:'上刊照片',owner:'施工监理',acceptance:'客户24小时确认',status:'已验收',evidence:[{id:'e1',name:'上刊.jpg'}],source:'合同附件'},
    {id:'0|removal',segment:0,type:'removal',title:'第1段下刊凭证',date:'2027-04-01',deliverable:'下刊照片',owner:'施工监理',acceptance:'照片齐全',status:'待执行',evidence:[],source:'合同附件'},
  ]},execution:{tasks:[
    {id:'t1',segment:0,phase:'install',resourceId:'X',name:'测试',quantity:4,date:'2027-01-01',owner:'施工组',manual:false},
    {id:'t2',segment:0,phase:'remove',resourceId:'X',name:'测试',quantity:4,date:'2027-03-31',owner:'施工组',manual:false},
  ],risks:[{id:'r1',category:'客户端',item:'定稿审批滞后',mitigation:'提前催稿',owner:'客户经理',status:'待确认'}],handoff:{workWindow:'22:00–06:00',nightConfirmed:true,prePressDays:3,prePressSource:'客户排期',photoDelayDays:1,source:'流程约定'},windows:{0:{permitConfirmed:true}},capacities:{bus:4,metro:2},confirmed:true,reserveNights:1,closedDates:[],source:'班组确认'}};
  Object.assign(state,overrides);
  const plan=calculatePlan(derived.records,state.brief,[]);
  return {state,plan,derived};
}

test('closing report follows the M5 structure and never fabricates reach or CPM', () => {
  const {state,plan}=makeState();
  const deck=closingReportPresentation(state,plan);
  assert.ok(deck.slides.length>=8);
  const titles=deck.slides.map((slide)=>slide.title);
  assert.deepEqual(titles.slice(0,4),['项目概览','项目内容概况','分周期执行情况','执行资源清单']);
  assert.ok(titles.includes('监测与验收'));
  assert.ok(titles.includes('效果与口径说明'));
  assert.ok(titles.includes('后续投放建议'));
  const text=JSON.stringify(deck);
  assert.match(text,/不展示触达、CPM/);
  assert.doesNotMatch(text,/日均人流量|月均曝光|CPM\s*[:：]\s*\d/);
  assert.match(text,/刊例测算/);
  const table=deck.slides[1].blocks.find((block)=>block.type==='table');
  assert.ok(table.rows.some((row)=>row[0]==='合计'&&row[2]===String(plan.units)));
});

test('monitoring status, evidence and open risks are reported honestly', () => {
  const {state,plan}=makeState();
  const deck=closingReportPresentation(state,plan);
  const text=JSON.stringify(deck);
  assert.match(text,/已验收 1 个/);
  assert.match(text,/1 项上下刊风险仍在处理中/);
  assert.match(text,/定稿审批滞后/);
  const monitoring=deck.slides.find((slide)=>slide.title==='监测与验收').blocks[0];
  assert.equal(monitoring.type,'table');
  assert.equal(monitoring.rows[0][3],'1');
});

test('suggestions derive from the real budget and constraints', () => {
  const {state,plan}=makeState({brief:{...brief,budget:5000000,constraints:{busShare:65,shareTolerance:5}}});
  const deck=closingReportPresentation(state,plan);
  const text=JSON.stringify(deck);
  assert.match(text,/本期渠道配比/);
  const withRemaining=closingReportPresentation(state,{...plan,remaining:123456});
  assert.match(JSON.stringify(withRemaining),/预算余量/);
});

test('an empty or blocked plan refuses to produce a closing report', () => {
  const {plan}=makeState();
  assert.throws(()=>closingReportPresentation({brief}, {...plan,lines:[],errors:[]}),/尚未形成可报价/);
  assert.throws(()=>closingReportPresentation({brief}, {...plan,errors:['存在阻断项']}),/尚未形成可报价/);
});

test('the presentation converts into a real PPTX with every slide', () => {
  const {state,plan}=makeState();
  const deck=closingReportPresentation(state,plan);
  const bytes=writePptx(deck);
  const parts=unzip(bytes);
  assert.ok(parts['ppt/presentation.xml']);
  for(let i=1;i<=deck.slides.length;i++)assert.ok(parts['ppt/slides/slide'+i+'.xml'],'slide '+i);
  assert.match(parts['ppt/slides/slide1.xml'],/项目概览/);
  assert.match(parts['ppt/slides/slide1.xml'],/测试品牌/);
});