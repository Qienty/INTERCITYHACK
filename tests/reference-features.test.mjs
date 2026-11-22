import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {calculatePlan,normalizeRows,inventoryMatrix} from '../lib/engine.mjs';
import {quoteSheets,exportHTML} from '../lib/export.mjs';
import {projectDelta,restoreProjectRecords,projectCopy,similarProjects} from '../lib/project-library.mjs';
import {spatialMappings,SPATIAL_HEADERS} from '../lib/spatial-import.mjs';
import {operationBasis,generateConstruction,constructionReview,generateMonitoring,monitoringReview} from '../lib/operations.mjs';
import {conditionPatch,normalizeProjectRecords} from '../lib/state-validation.mjs';
import {realInventorySnapshots} from '../data/real-data.mjs';
const brief={industry:'食品饮料',brand:'测试需求',budget:1000000,media:['bus','metro'],start:'2027-03-01',end:'2027-03-28',discount:1,goal:''};
const resource=(id,media='bus',price=100000)=>({id,name:id,media,grade:'A++',operator:'测试主体',format:'测试规格',available:100,unitPrice:price,production:0,periodDays:28,priceIncludesTax:true,availableStart:'2027-01-01',availableEnd:'2027-12-31',source:'测试输入',priceSource:'测试核价',tags:[],lat:null,lon:null,district:''});
const records=[resource('A'),resource('B','metro')];
const state=(b=brief,rows=records)=>({brief:structuredClone(b),records:structuredClone(rows),places:[],evidence:[],hypothesis:{},delivery:{}});
test('fixed quantities survive budget changes, exclusions and reserve without changing inventory',()=>{
 const b={...brief,selection:{A:{mode:'fixed',quantity:3}},constraints:{reserve:50000}};
 for(const budget of [1000000,2000000,5000000]){const p=calculatePlan(records,{...b,budget});assert.equal(p.lines.find(r=>r.id==='A').quantity,3);assert.ok(p.total<=budget-50000);assert.equal(p.remaining,budget-p.total);}
 assert.equal(records[0].available,100);const p=calculatePlan(records,{...brief,selection:{A:{mode:'excluded',quantity:0}}});assert.ok(p.lines.every(r=>r.id!=='A'));
});
test('unavailable, unpriced, overstock and overbudget must-have intentions remain explicit blockers',()=>{
 for(const rows of [[{...records[0],available:0}],[{...records[0],unitPrice:null}],records]){
  const b={...brief,selection:{A:{mode:'fixed',quantity:101}}},p=calculatePlan(rows,b);assert.ok(p.errors.length);assert.ok(p.unresolved.some(r=>r.id==='A'));assert.equal(b.selection.A.quantity,101);assert.ok(!p.lines.some(r=>r.id==='A'));
 }
 const p=calculatePlan(records,{...brief,selection:{A:{mode:'fixed',quantity:11}}});assert.ok(p.errors.some(e=>e.includes('预算')));
});
test('hard channel targets allocate integer channel quotas and soft targets disclose deviations',()=>{
 const rows=[resource('A','bus',10000),resource('B','metro',10000)];
 const exact=calculatePlan(rows,{...brief,constraints:{busShare:65,shareTolerance:0,shareHard:true,requiredMedia:['bus','metro']}});
 assert.deepEqual(exact.errors,[]);assert.equal(exact.mediaCounts.bus,65);assert.equal(exact.mediaCounts.metro,35);
 const zero=calculatePlan(rows,{...brief,constraints:{busShare:0,shareTolerance:0,shareHard:true}});assert.equal(zero.mediaCounts.bus||0,0);
 const soft=calculatePlan([rows[0]],{...brief,constraints:{busShare:65,shareTolerance:5}});assert.equal(soft.constraintAudit.checks.find(c=>c.label==='公交数量占比').status,'deviation');
 const missing=calculatePlan([rows[0]],{...brief,constraints:{requiredMedia:['metro']}});assert.ok(missing.errors.some(e=>e.includes('必投渠道')));
});
test('large hard-ratio allocations use integer batches and invalid reserve never produces an overbudget quote',()=>{
 const large=[{...resource('LARGE-BUS','bus',.01),available:100000},{...resource('LARGE-METRO','metro',.01),available:100000}];const p=calculatePlan(large,{...brief,constraints:{busShare:65,shareTolerance:0,shareHard:true}});assert.deepEqual(p.errors,[]);assert.equal(p.mediaCounts.bus/(p.mediaCounts.bus+p.mediaCounts.metro),.65);
 for(const reserve of [-1,NaN,2000000]){const invalid=calculatePlan(records,{...brief,constraints:{reserve}});assert.ok(invalid.errors.length);assert.equal(invalid.lines.length,0);}
});
test('density, source-backed spatial filters, concentration and discount approval affect validity',()=>{
 const mapping={resourceId:'A',area:'核实商圈',landmark:'实际地标',relation:'途经',lon:121.5,lat:31.2,coordinateSystem:'WGS84',source:'核实文件',verifiedAt:'2026-11-21',verified:true};
 const b={...brief,spatial:{mappings:[mapping],areas:['核实商圈'],requiredLandmarks:['实际地标'],radius:{enabled:true,lon:121.5,lat:31.2,meters:100,coordinateSystem:'WGS84'}},constraints:{minAreas:1,minPerArea:2}};
 const p=calculatePlan(records,b);assert.deepEqual(p.errors,[]);assert.ok(p.lines.every(r=>r.id==='A'));assert.equal(p.constraintAudit.areas.length,1);
 assert.equal(calculatePlan(records,{...b,spatial:{...b.spatial,radius:{...b.spatial.radius,coordinateSystem:'GCJ-02'}}}).lines.length,0);
 assert.ok(calculatePlan([records[0]],{...brief,constraints:{maxConcentration:50}}).errors.some(e=>e.includes('集中度')));
 assert.ok(calculatePlan(records,{...brief,discount:.5,constraints:{discountFloor:.8,discountSource:'实际审批制度'}}).errors.some(e=>e.includes('审批')));
});
test('daily and confirmed calendar-month prices retain independent units and exact VAT pennies',()=>{
 const b={...brief,start:'2027-01-31',end:'2027-02-01',discount:.8};
 const row={...resource('DAY','bus',123.45),available:1,billingUnit:'day',billingSource:'已核实日价与税额规则',periodDays:null,priceIncludesTax:false,taxRate:6};
 const p=calculatePlan([row],b);assert.deepEqual(p.errors,[]);assert.equal(p.lines[0].billingPeriods,2);assert.equal(p.lines[0].mediaBaseCents,19752);assert.equal(p.lines[0].mediaTaxCents,1185);assert.equal(p.total,209.37);
 const month=calculatePlan([{...row,billingUnit:'calendarMonth',priceIncludesTax:true}],b);assert.equal(month.lines[0].billingPeriods,2);assert.equal(month.total,197.52);
 assert.ok(conditionPatch({unitPrice:100,production:0,periodDays:'calendarMonth',priceIncludesTax:'true',availableStart:b.start,availableEnd:b.end,priceSource:'来源'}).errors.length);
 const normalized=normalizeProjectRecords([row])[0];assert.equal(normalized.billingUnit,'day');assert.equal(normalized.taxRate,6);
});
test('local library stores sparse deltas, restores frozen stock, copies only intentions and uses real cases',()=>{
 const base=structuredClone(records),s=state();s.records[0].unitPrice=12345;s.records[0].production=0;const delta=projectDelta(base,s.records);assert.equal(delta.patches.length,1);assert.deepEqual(restoreProjectRecords(base,delta),s.records);
 const current=structuredClone(base);current[0].unitPrice=99999;assert.equal(restoreProjectRecords(base,delta)[0].unitPrice,12345);
 s.monitoring={nodes:[{status:'已验收',evidence:[{name:'真实证据'}]}]};const copy=projectCopy(s);assert.equal(copy.monitoring.nodes.length,0);assert.ok(copy.records.every(r=>r.quoteReconfirmationRequired));assert.equal(calculatePlan(copy.records,copy.brief).lines.length,0);
 const cases=[{id:'b',industry:'银行保险',budget:1000000,status:'draft',updatedAt:'2026-11-21'},{id:'a',industry:'食品饮料',budget:1000000,status:'draft',updatedAt:'2026-11-20'}];assert.equal(similarProjects(cases,brief)[0].id,'a');assert.deepEqual(similarProjects([],brief),[]);
});
test('construction uses confirmed capacity, explicit shutdowns and reserved nights; later quantities invalidate manual work',()=>{
 const b={...brief,selection:{A:{mode:'fixed',quantity:8},B:{mode:'excluded',quantity:0}}},p=calculatePlan(records,b);
 const config={confirmed:true,source:'实际班组与窗口确认',capacities:{bus:4},closedDates:['2027-02-26'],reserveNights:1,windows:{0:{installStart:'2027-02-25',installEnd:'2027-03-01',removeStart:'2027-03-28',removeEnd:'2027-03-31',permitConfirmed:true}}};
 const generated=generateConstruction(p,b,config);assert.deepEqual(generated.errors,[]);assert.ok(generated.tasks.every(t=>t.date!=='2027-02-26'));const execution={...config,...generated};assert.equal(constructionReview(p,b,execution).complete,true);
 execution.tasks[0]={...execution.tasks[0],manual:true,quantity:99};assert.ok(constructionReview(p,b,execution).errors.some(e=>e.includes('排了')||e.includes('产能')));
 const next=calculatePlan(records,{...b,selection:{...b.selection,A:{mode:'fixed',quantity:9}}});const regenerated=generateConstruction(next,{...b,selection:{...b.selection,A:{mode:'fixed',quantity:9}}},execution);assert.equal(regenerated.tasks.find(t=>t.id===execution.tasks[0].id).quantity,99);assert.equal(regenerated.tasks.find(t=>t.id===execution.tasks[0].id).requiresReview,true);
 assert.ok(generateConstruction(p,b,{}).errors.length);
});
test('monitoring derives only confirmed intervals, preserves edits, and requires actual evidence for acceptance',()=>{
 const p=calculatePlan(records,brief),delivery={posting:'上刊材料',removal:'下刊材料',inspection:'巡检清单',closing:'结案记录',source:'已核实服务约定'};
 const result=generateMonitoring(p,brief,delivery,{},{});assert.equal(result.nodes.length,2);assert.ok(result.nodes.every(n=>n.status==='待执行'&&n.evidence.length===0));
 const withFrequency=generateMonitoring(p,brief,delivery,{}, {config:{confirmed:true,inspectionDays:7,reportDays:3,source:'频率约定'}});assert.equal(withFrequency.nodes.length,6);
 const complete={...withFrequency,nodes:withFrequency.nodes.map(n=>({...n,owner:'服务团队',acceptance:'清单核对'}))};assert.equal(monitoringReview(p,brief,complete).complete,true);complete.nodes[0].status='已验收';assert.ok(monitoringReview(p,brief,complete).errors.some(e=>e.includes('证据')));assert.ok(monitoringReview(p,brief,complete).errors.some(e=>e.includes('验收人')));
});
test('verified spatial imports reject unknown IDs, guessed coordinate systems and unverified claims',()=>{
 const row=['A','核实区域','真实地标','途经',121.5,31.2,'WGS84','核实来源','2026-11-21','已核实'];assert.equal(spatialMappings([SPATIAL_HEADERS,row],records).mappings.length,1);
 for(const [index,value]of [[0,'UNKNOWN'],[6,'未注明'],[9,'待核实']]){const changed=[...row];changed[index]=value;assert.ok(spatialMappings([SPATIAL_HEADERS,changed],records).errors.length);}
});
test('all three real dated exports are selectable snapshots and never additive baseline stock',()=>{
 assert.equal(realInventorySnapshots.length,3);const both=realInventorySnapshots.find(s=>s.source.includes('_both_'));assert.equal(both.rows.length,1293);const parsed=normalizeRows(both.rows,both.source);assert.deepEqual(parsed.errors,[]);assert.equal(parsed.data.filter(r=>r.media==='metro').length,861);assert.ok(parsed.data.every(r=>r.availableStart==='2027-01-01'&&r.availableEnd==='2027-03-31'&&r.unitPrice===null));
});
test('CSV/XLSX selection and standalone HTML use the same locks, prices, and budget blockers',()=>{
 const s=state({...brief,selection:{A:{mode:'fixed',quantity:3}},selectionBaseline:{A:2}}),p=calculatePlan(s.records,s.brief);const sheets=quoteSheets(s,p);assert.ok(sheets.some(s=>s.name==='人工选择与差分'));assert.ok(sheets.some(s=>s.name==='施工任务'));
 const html=exportHTML(s),code=html.match(/<script>([\s\S]*)<\/script>/)[1],node={innerHTML:''},context=vm.createContext({document:{getElementById:()=>node},console});vm.runInContext(code,context);vm.runInContext('update(500)',context);assert.equal(vm.runInContext("calculatePlan(state.records,state.brief).lines.find(r=>r.id==='A').quantity",context),3);
 vm.runInContext('state.brief.selection.A.quantity=100;update(100)',context);assert.match(node.innerHTML,/无法报价/);assert.equal(vm.runInContext('state.brief.selection.A.quantity',context),100);
});
