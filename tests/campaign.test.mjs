import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CHANNELS,channelName,channelKey,periodRange,withSchedule,campaignRanges,scheduleSummary} from '../lib/campaign.mjs';
import {calculatePlan,validateBrief,normalizeRows,inventoryMatrix} from '../lib/engine.mjs';
import {extractBrief,prepareBriefDraft} from '../lib/brief-import.mjs';
import {exportHTML,quoteSheets} from '../lib/export.mjs';
import {searchMaterials} from '../lib/listing.mjs';
const brief={industry:'食品饮料',brand:'测试客户',budget:2000000,media:['bus'],start:'2027-03-01',end:'2027-03-28',discount:1,goal:''};
const record={id:'test-bus',name:'测试资源',media:'bus',district:'',grade:'',available:1,availableStart:'2027-01-01',availableEnd:'2027-12-31',unitPrice:1000,production:100,periodDays:28,priceIncludesTax:true,tags:[],source:'测试专用',priceSource:'测试专用'};
const scheduled=(unit,ranges,mode='continuous')=>withSchedule(brief,{unit,mode,ranges});
test('only bus vehicles and metro station entrances are selectable; train vehicles are rejected',()=>{
  assert.deepEqual(CHANNELS.map(c=>c.label),['公交车辆','地铁站站口']);
  for(const c of CHANNELS){assert.equal(channelKey(c.label),c.id);assert.equal(channelName(c.id),c.label);}
  assert.equal(channelKey('BUS_VEHICLE'),'bus');assert.equal(channelKey('METRO_VEHICLE'),'');assert.equal(channelKey('地铁出入口'),'metro');
  const normalized=normalizeRows([['媒体名称','媒体类型','空车数'],...CHANNELS.map(c=>[c.label,c.label,1])],'测试');assert.deepEqual(normalized.errors,[]);assert.deepEqual(normalized.data.map(r=>r.media),CHANNELS.map(c=>c.id));
  assert.deepEqual(normalizeRows(inventoryMatrix(normalized.data),'往返').data.map(r=>r.media),CHANNELS.map(c=>c.id));
  for(const c of CHANNELS){const hits=searchMaterials({records:CHANNELS.map((entry,i)=>({...record,id:entry.id,name:'资源'+i,media:entry.id})),insights:[],files:[],imports:[],evidence:[]},c.label);assert.deepEqual(hits.map(r=>r.id),[c.id]);}
});
test('calendar selectors resolve full year, quarter and month boundaries without altering the rate unit',()=>{
  assert.deepEqual(periodRange('year',2027),{start:'2027-01-01',end:'2027-12-31'});
  assert.deepEqual(periodRange('quarter',2027,1),{start:'2027-01-01',end:'2027-03-31'});
  assert.deepEqual(periodRange('quarter',2027,4),{start:'2027-10-01',end:'2027-12-31'});
  assert.deepEqual(periodRange('month',2027,2),{start:'2027-02-01',end:'2027-02-28'});
  assert.equal(calculatePlan([record],scheduled('year',[periodRange('year',2027)])).periods,14);
  assert.equal(calculatePlan([record],scheduled('quarter',[periodRange('quarter',2027,1)])).days,90);
  assert.equal(calculatePlan([record],scheduled('month',[periodRange('month',2027,2)])).periods,1);
});
test('discontinuous bookings exclude gap days and round each booking separately',()=>{
  const b=scheduled('custom',[{start:'2027-01-01',end:'2027-01-07'},{start:'2027-03-01',end:'2027-03-07'}],'segments');
  const plan=calculatePlan([record],b);assert.deepEqual(plan.errors,[]);assert.equal(plan.days,14);assert.equal(plan.periods,2);assert.equal(plan.total,2100);assert.equal(plan.production,100);
  assert.equal(b.start,'2027-01-01');assert.equal(b.end,'2027-03-07');assert.equal(plan.segments.length,2);
  assert.equal(calculatePlan([{...record,availableEnd:'2027-02-28'}],b).lines.length,0);
});
test('empty, overlapping, reversed, out-of-year and excessive segments block a quote',()=>{
  for(const ranges of [[],[{start:'2027-02-30',end:'2027-03-01'}],[{start:'2027-03-02',end:'2027-03-01'}],[{start:'2026-01-01',end:'2027-01-01'}],[{start:'2027-01-01',end:'2027-02-01'},{start:'2027-02-01',end:'2027-03-01'}],Array(25).fill({start:'2027-01-01',end:'2027-01-01'})])assert.ok(validateBrief(scheduled('custom',ranges,'segments')).length);
  assert.ok(validateBrief({...brief,media:['unknown']}).length);
});
test('all supported channels can be quoted when verified inventory is supplied, and absent channels stay unquoted',()=>{
  const records=CHANNELS.map(c=>({...record,id:c.id,media:c.id})),plan=calculatePlan(records,{...brief,media:CHANNELS.map(c=>c.id)});
  assert.equal(plan.lines.length,2);assert.equal(plan.total,2200);assert.equal(calculatePlan([record],{...brief,media:['office']}).lines.length,0);
});
test('brief import recognizes the two supported channels, calendar periods and disjoint dates with one draft',()=>{
  const channels=extractBrief('投放渠道：'+CHANNELS.map(c=>c.label).join('、'));assert.deepEqual(new Set(channels.values.media),new Set(CHANNELS.map(c=>c.id)));
  assert.deepEqual(extractBrief('投放渠道：不投地铁车辆，仅投地铁站').values.media,['metro']);assert.equal(extractBrief('投放渠道：地铁车辆').values.media,undefined);assert.equal(extractBrief('投放渠道：商圈、商业楼宇、住宅').values.media,undefined);
  for(const [text,unit,count]of [['年度 2027全年','year',1],['季度 2027年第一季度、第三季度','quarter',2],['月度 2027年3月、5月','month',2],['分段 2027-03-01 至 2027-03-07；2027-05-01 至 2027-05-07','custom',2]]){
    const extracted=extractBrief('投放日期：'+text),result=prepareBriefDraft(brief,extracted);assert.equal(result.brief.schedule.unit,unit,text);assert.equal(campaignRanges(result.brief).length,count,text);assert.deepEqual(validateBrief(result.brief),[],text);
  }
  assert.equal(extractBrief('投放日期：2027年3月').values.schedule,undefined);
  const old=scheduled('custom',[{start:'2027-01-01',end:'2027-01-07'},{start:'2027-03-01',end:'2027-03-07'}],'segments');
  const next=prepareBriefDraft(old,extractBrief('投放开始日期：2027-06-01\n投放结束日期：2027-06-28'));assert.equal(next.brief.schedule,undefined);assert.equal(next.brief.start,'2027-06-01');
  const conflict=prepareBriefDraft(old,extractBrief('投放日期：月度 2027年3月、5月\n开始日期：2027-06-01\n结束日期：2027-06-28'));assert.deepEqual(conflict.brief.schedule,old.schedule);assert.equal(conflict.brief.start,old.start);assert.ok(conflict.warnings.some(w=>w.includes('冲突')));
});
test('Excel/CSV rows and offline HTML retain actual segments and channel names after budget changes',()=>{
  const b=scheduled('custom',[{start:'2027-01-01',end:'2027-01-07'},{start:'2027-03-01',end:'2027-03-07'}],'segments');b.media=['metro'];
  const state={brief:b,records:[{...record,media:'metro'}],places:[],evidence:[],strategyText:'',strategySource:''},plan=calculatePlan(state.records,b),sheets=quoteSheets(state,plan);
  assert.equal(sheets[0].rows[1][2],'地铁站站口');assert.equal(sheets[0].rows[1][19],scheduleSummary(b));assert.equal(sheets.at(-1).rows.length,4);assert.deepEqual(sheets.at(-1).rows.at(-1).slice(3,5),[14,2]);
  const html=exportHTML(state),script=html.match(/<script>([\s\S]*)<\/script>/)[1],node={innerHTML:''},ctx=vm.createContext({document:{getElementById:()=>node},console});vm.runInContext(script,ctx);vm.runInContext('update(500)',ctx);
  assert.match(node.innerHTML,/地铁站站口/);assert.match(node.innerHTML,/2027-01-07/);assert.match(node.innerHTML,/2027-03-07/);assert.match(node.innerHTML,/合计 · 14 天/);assert.match(node.innerHTML,/2 个 28 天/);
});
