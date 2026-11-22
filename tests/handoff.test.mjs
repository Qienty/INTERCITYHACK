import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffReview,operationSheets,RISK_CATEGORIES,suggestedWindows,demoConstructionSettings,generateConstruction} from '../lib/operations.mjs';

const brief={industry:'食品饮料',brand:'测试品牌',budget:2000000,media:['bus'],start:'2027-03-01',end:'2027-03-28',discount:1,goal:''};
const plan={lines:[{id:'BUS-1',name:'927',media:'bus',quantity:2,available:8,unitPrice:60000,production:7500,periodDays:28,mediaAmount:360000,productionAmount:15000,amount:375000,unitTotal:18750}],units:2,segments:[{start:'2027-03-01',end:'2027-03-28',days:28}],media:360000,production:15000,total:375000,errors:[],constraintAudit:{checks:[]},excluded:[],fees:{pending:[],details:{}}};
const baseExecution={capacities:{bus:4},confirmed:true,source:'已确认班组与许可',reserveNights:1,closedDates:['2027-03-08'],windows:{0:{permitConfirmed:true,installStart:'2027-02-25',installEnd:'2027-03-01',removeStart:'2027-03-28',removeEnd:'2027-04-01'}},tasks:[{id:'t1',segment:0,phase:'install',resourceId:'BUS-1',name:'927',quantity:2,date:'2027-03-01',owner:'施工组',manual:false},{id:'t2',segment:0,phase:'remove',resourceId:'BUS-1',name:'927',quantity:2,date:'2027-03-28',owner:'施工组',manual:false}]};
const handoff={workWindow:'22:00–06:00',nightConfirmed:true,prePressDays:3,prePressSource:'客户定稿排期邮件',photoDelayDays:1,source:'上下刊流程与监拍时效约定'};
const monitoring={nodes:[{id:'p',type:'posting',date:'2027-03-02',title:'上刊凭证',status:'待执行'},{id:'r',type:'removal',date:'2027-03-29',title:'下刊凭证',status:'待执行'}]};

test('a fully confirmed handoff passes every automatic check', () => {
  const review=handoffReview(plan,brief,{...baseExecution,handoff},monitoring);
  assert.equal(review.checks.length,8);
  assert.deepEqual(review.checks.filter((check)=>check.status!=='pass').map((check)=>check.label),[]);
  assert.equal(review.complete,true);
});

test('night window, reserve nights, prepress and photo delay are reported as problems', () => {
  const review=handoffReview(plan,brief,{...baseExecution,handoff:{...handoff,nightConfirmed:false,photoDelayDays:2}},monitoring);
  const byId=Object.fromEntries(review.checks.map((check)=>[check.id,check]));
  assert.equal(byId.night.status,'deviation');
  assert.equal(byId.photo.status,'deviation');
  assert.match(byId.photo.detail,/隔天（2 天）/);
  const noReserve=handoffReview(plan,brief,{...baseExecution,reserveNights:0,handoff},monitoring);
  assert.equal(Object.fromEntries(noReserve.checks.map((check)=>[check.id,check])).reserve.status,'deviation');
  const noPrepress=handoffReview(plan,brief,{...baseExecution,handoff:{...handoff,prePressDays:null,prePressSource:''}},monitoring);
  assert.equal(noPrepress.checks.find((check)=>check.id==='prepress').status,'pending');
  const early=handoffReview(plan,brief,{...baseExecution,handoff}, {...monitoring,nodes:[{type:'posting',date:'2027-03-01'}]});
  assert.equal(early.checks.find((check)=>check.id==='photo').status,'deviation');
});

test('invalid night window format and missing handoff source are not accepted', () => {
  const review=handoffReview(plan,brief,{...baseExecution,handoff:{...handoff,workWindow:'晚上',source:''}},monitoring);
  assert.equal(review.checks.find((check)=>check.id==='night').status,'deviation');
  assert.equal(review.checks.find((check)=>check.id==='handoff-source').status,'deviation');
});

test('suggested windows stay inside the booking boundaries and the demo conditions can generate batches', () => {
  const windows=suggestedWindows(plan),window=windows[0],segment=plan.segments[0];
  assert.ok(window.installStart<=window.installEnd&&window.installEnd<=segment.start,'install window ends before the booking starts');
  assert.ok(segment.end<=window.removeStart&&window.removeStart<=window.removeEnd,'remove window starts after the booking ends');
  const demo=demoConstructionSettings(plan);
  assert.equal(demo.confirmed,true);
  assert.equal(demo.windows[0].permitConfirmed,true);
  assert.match(demo.source,/测算/);
  const result=generateConstruction(plan,brief,demo);
  assert.deepEqual(result.errors,[]);
  assert.ok(result.tasks.length>0);
  assert.ok(result.tasks.filter((task)=>task.phase==='install').every((task)=>task.date<=segment.start));
  assert.ok(result.tasks.filter((task)=>task.phase==='remove').every((task)=>task.date>=segment.end));
});

test('operation sheets export the handoff checks and the manual risk register', () => {
  const state={brief,execution:{...baseExecution,handoff:{...handoff,nightConfirmed:false},risks:[{id:'risk-1',category:'客户端',item:'定稿审批滞后',mitigation:'提前 5 个工作日催稿',owner:'客户经理',status:'已确认'}]},monitoring};
  const sheets=operationSheets(state,plan);
  const handoffSheet=sheets.find((sheet)=>sheet.name==='上下刊卡点');
  assert.ok(handoffSheet);
  const text=JSON.stringify(handoffSheet.rows);
  assert.match(text,/夜间作业窗口/);
  assert.match(text,/定稿审批滞后/);
  assert.match(text,/提前 5 个工作日催稿/);
  const checks=sheets.find((sheet)=>sheet.name==='组合执行检查');
  assert.ok(checks.rows.some((row)=>row[0]==='卡点'));
  assert.ok(RISK_CATEGORIES.includes('外包供应链'));
});