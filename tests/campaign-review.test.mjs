import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import http from 'node:http';
import {calculatePlan,inventoryMatrix} from '../lib/engine.mjs';
import {quoteFees} from '../lib/fees.mjs';
import {normalizeHypothesis,normalizeDelivery,hypothesisStatus,hypothesisFingerprint,PROVIDED_CAMPAIGN,providedSourceAudit,publicProposalState} from '../lib/hypothesis.mjs';
import {campaignReview,campaignPlan,campaignSheets,allocationDiff} from '../lib/campaign-review.mjs';
import {campaignDocument} from '../lib/campaign-render.mjs';
import {normalizeInventoryPatch,upsertInventory} from '../lib/inventory-update.mjs';
import {safeBriefReviewInput,parseBriefReview,requestBriefReview} from '../lib/ai-review.mjs';
import {exportHTML,quoteSheets} from '../lib/export.mjs';
import {reviewSheets} from '../lib/review-export.mjs';
import {readXlsx,writeXlsx} from '../lib/xlsx.mjs';
import {realInventory} from '../data/real-data.mjs';
import {validateStoredBrief} from '../lib/state-validation.mjs';
const brief={industry:'银行保险',brand:'内部研究对象',budget:2000000,media:['bus','metro'],start:'2027-03-01',end:'2027-03-28',discount:1,goal:'回归验证'};
const row={id:'test',name:'隔离测试资源',media:'bus',available:100,unitPrice:10000,production:1000,periodDays:28,priceIncludesTax:true,availableStart:'2027-01-01',availableEnd:'2027-12-31',tags:[],grade:'S',district:'',source:'测试数据不进入应用'};
const h=()=>normalizeHypothesis({...PROVIDED_CAMPAIGN.hypothesis,brandScale:'测试用规模依据',campaignGoal:'认知',researchBrand:'内部研究对象'});
const state=(b=brief)=>({brief:structuredClone(b),records:[{...row}],places:[],evidence:[],hypothesis:h(),delivery:normalizeDelivery(PROVIDED_CAMPAIGN.delivery)});

test('provided PDF is traced as unconfirmed hypothesis and never creates inventory or exact rates',()=>{
 assert.equal(PROVIDED_CAMPAIGN.brief.budget,2000000);assert.equal(PROVIDED_CAMPAIGN.brief.brand,'某银行上海分行');assert.equal(PROVIDED_CAMPAIGN.hypothesis.campaignGoal,'');assert.equal(PROVIDED_CAMPAIGN.hypothesis.brandScale,'');assert.equal(realInventory.length,431);assert.ok(realInventory.every(r=>r.unitPrice===null&&r.availableStart===''));assert.equal(realInventory.filter(r=>r.media==='metro').length,0);
});
test('seven elements require one primary goal and scale evidence; date changes invalidate confirmation',()=>{
 const s=state(),a=hypothesisStatus(s.brief,s.hypothesis);assert.equal(a.complete,7);assert.equal(a.confirmed,false);
 s.hypothesis.confirmedFingerprint=hypothesisFingerprint(s.brief,s.hypothesis);assert.equal(hypothesisStatus(s.brief,s.hypothesis).confirmed,true);
 s.brief.budget=5000000;assert.equal(hypothesisStatus(s.brief,s.hypothesis).stale,true);s.hypothesis.campaignGoal='';assert.equal(hypothesisStatus(s.brief,s.hypothesis).complete,6);
 assert.throws(()=>normalizeHypothesis({campaignGoal:'toString'}));assert.throws(()=>normalizeHypothesis({kpi:'随意承诺转化'}));
});
test('source assumptions reproduce 1026 not 1054 and distinguish CPM numerators and buffers',()=>{
 const a=providedSourceAudit();assert.equal(a.visits,10260000);assert.equal(a.visitDifference,280000);assert.equal(a.budgetRemaining,99900);assert.equal(a.limitRemaining,59900);assert.equal(a.reserved,40000);assert.equal(a.days,90);assert.equal(a.periods,4);assert.equal(a.mediaCPM.toFixed(2),'169.01');assert.equal(a.projectCPM.toFixed(2),'185.19');
});
test('unknown fees remain warnings, included execution does not double-charge, explicit zero is confirmed',()=>{
 const s=state(),base=calculatePlan(s.records,s.brief);assert.equal(base.fees.pending.length,2);
 s.brief.fees={execution:{status:'included',source:'已含制作费'},monitoring:{status:'separate',amount:0,source:'确认免费'}};const p=calculatePlan(s.records,s.brief);assert.equal(p.total,base.total);assert.equal(p.execution,0);assert.equal(p.monitoring,0);assert.deepEqual(p.fees.pending,[]);
});
test('separate fees are inside the integer-cent budget, fixed monitoring only charged for a nonempty plan',()=>{
 const s=state();s.records[0].available=10000;s.brief.fees={execution:{status:'separate',amount:123.45,source:'统一每资源含税'},monitoring:{status:'separate',amount:10000,source:'项目固定含税'}};const p=calculatePlan(s.records,s.brief);
 assert.ok(p.total<=s.brief.budget);assert.equal(Math.round(p.total*100),Math.round(p.media*100)+Math.round(p.production*100)+Math.round(p.execution*100)+Math.round(p.monitoring*100));assert.equal(p.monitoring,10000);assert.ok(p.remaining<11123.45);
 const empty=calculatePlan([],s.brief);assert.equal(empty.monitoring,0);assert.equal(empty.total,0);assert.equal(empty.remaining,s.brief.budget);
});
test('unknown is distinct from missing amount or missing fee source; invalid fees block quoting',()=>{
 for(const fees of [{execution:{status:'separate',amount:null,source:'来源'}},{execution:{status:'separate',amount:-1,source:'来源'}},{monitoring:{status:'separate',amount:3000000,source:'来源'}},{execution:{status:'included',source:''}}]){const b={...brief,fees};assert.ok(quoteFees(b).errors.length);assert.equal(calculatePlan([row],b).lines.length,0);}
});
test('upsert sparse coordinates retains all 431 records and unrelated fields; explicit zero survives',()=>{
 const source=realInventory[0],matrix=[['媒体编号','经度','纬度','行政区','空车数'],[source.id,121.5,31.2,'测试核验区',0]],result=normalizeInventoryPatch(realInventory,matrix,'核实坐标.csv');assert.deepEqual(result.errors,[]);
 const merged=upsertInventory(realInventory,result,matrix);assert.deepEqual(merged.errors,[]);assert.equal(merged.data.length,431);assert.equal(merged.data[0].available,0);assert.equal(merged.data[0].lon,121.5);assert.equal(merged.data[0].operator,source.operator);assert.equal(merged.data[0].format,source.format);assert.equal(merged.data[0].sourceRow,source.sourceRow);assert.deepEqual(merged.data[1],realInventory[1]);assert.equal(realInventory[0].lon,null);
});
test('upsert refuses ambiguous identifiers, conflicting media, and duplicate IDs',()=>{
 assert.throws(()=>normalizeInventoryPatch(realInventory,[['经度'],[121]],'无编号.csv'));
 const matrix=[['媒体编号','媒体类型'],[realInventory[0].id,'地铁站站口']];const result=normalizeInventoryPatch(realInventory,matrix,'冲突.csv');assert.ok(upsertInventory(realInventory,result,matrix).errors.length);
 const dup=[['媒体编号','经度'],[realInventory[0].id,121],[realInventory[0].id,122]];assert.ok(normalizeInventoryPatch(realInventory,dup,'重复.csv').errors.length);
});
test('source materials, hypothesis, responses and checks export within workbook sheet limits',()=>{
 const s=state(),p=calculatePlan(s.records,s.brief),sheets=quoteSheets(s,p);assert.ok(sheets.length<=24);for(const name of ['campaign假设书','假设回应','监测与风险','提交自检','原始假设复算'])assert.ok(sheets.some(x=>x.name===name));assert.deepEqual(readXlsx(writeXlsx(sheets)),sheets);assert.ok(reviewSheets(s).some(x=>x.name==='假设回应'));
 const detail=sheets.find(x=>x.name==='campaign假设书');assert.equal(detail.rows.filter(r=>/^[①-⑦]/.test(r[0])).length,7);
});
test('public proposal payload strips internal client, import original and model text while preserving anonymous confirmation',()=>{
 const s=state();s.strategyText='内部研究对象的内部策略';s.briefImport={rawText:'内部研究对象的原始需求'};s.hypothesis.confirmedFingerprint=hypothesisFingerprint(s.brief,s.hypothesis);
 const clean=publicProposalState(s);assert.equal(clean.brief.brand,'某银行上海分行');assert.equal(hypothesisStatus(clean.brief,clean.hypothesis).confirmed,true);assert.doesNotMatch(JSON.stringify(clean),/内部研究对象/);assert.doesNotMatch(exportHTML(s),/内部研究对象|招商银行/);assert.equal(s.brief.brand,'内部研究对象');
});
test('offline HTML executes after budget changes with separate fees and campaign responses',()=>{
 const s=state();s.brief.fees={execution:{status:'included',source:'含在制作'},monitoring:{status:'separate',amount:1000,source:'已核实'}};const html=exportHTML(s),node={innerHTML:''},ctx=vm.createContext({document:{getElementById:()=>node}});vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);vm.runInContext('update(500)',ctx);assert.match(node.innerHTML,/假设书与方案回应/);assert.match(node.innerHTML,/500 万/);assert.match(node.innerHTML,/监测费/);assert.match(node.innerHTML,/1026/);assert.ok(vm.runInContext('calculatePlan(state.records,state.brief,state.places).total<=state.brief.budget',ctx));
});
test('pending import never produces allocations or all-green checks',()=>{
 const s=state();s.briefDraft={source:'隔离回归'};const p=campaignPlan(s);assert.equal(p.total,0);assert.equal(p.lines.length,0);const m=campaignReview(s,p);assert.ok(m.checks.some(c=>c.status!=='pass'));assert.match(campaignDocument(s,p,{singlePage:true}),/核对修订稿/);
});
test('budget differences account for removed, added and unchanged rows',()=>{
 const a={total:100,lines:[{id:'a',name:'a',quantity:1,amount:50},{id:'b',name:'b',quantity:1,amount:50}]},b={total:200,lines:[{id:'a',name:'a',quantity:1,amount:50},{id:'c',name:'c',quantity:3,amount:150}]},d=allocationDiff(a,b);assert.equal(d.added[0].id,'c');assert.equal(d.reduced[0].id,'b');assert.equal(d.retained[0].id,'a');assert.equal(d.totalDelta,100);
});
test('AI input is a strict summary whitelist; model output is validated as data',()=>{
 const safe=safeBriefReviewInput({industry:'银行保险',records:[{unitPrice:1}],brand:'真实名称',AI_API_KEY:'secret',businessGoal:'test'});assert.equal(safe.industry,'银行保险');assert.ok(!('records'in safe));assert.ok(!('brand'in safe));assert.ok(!('AI_API_KEY'in safe));assert.throws(()=>parseBriefReview('不完整文本'));assert.throws(()=>parseBriefReview('{"summary":"x"}'));assert.equal(parseBriefReview('{"summary":"x","missing":[],"conflicts":[],"questions":[]}').summary,'x');
});
test('AI review uses configured Chat Completions and never sends inventory or precise prices',async()=>{
 let captured;const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;captured=JSON.parse(raw);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'隔离模拟响应，不是业务事实',missing:['规模依据'],conflicts:[],questions:['请确认主目标']})}}]}));});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 try{const out=await requestBriefReview({industry:'银行保险',records:[{unitPrice:12345}],price:12345},{AI_BASE_URL:'http://127.0.0.1:'+mock.address().port,AI_API_KEY:'test-only',AI_MODEL:'test'});assert.equal(out.missing[0],'规模依据');assert.doesNotMatch(captured.messages[1].content,/unitPrice|12345|records/);assert.match(captured.messages[0].content,/不得生成库存/);}finally{await new Promise(r=>mock.close(r));}
 await assert.rejects(requestBriefReview({},{}),/尚未配置/);
});

test('provided execution inclusion remains pending contract verification instead of a zero fee fact',()=>{
 const s=state();s.brief.fees={execution:{status:'included',assumed:true,source:'用户假设书拟定，待核实合同'},monitoring:{status:'included',source:'已核实服务包'}};const p=calculatePlan(s.records,s.brief);assert.equal(p.execution,0);assert.deepEqual(p.fees.pending,['执行费']);
});
test('H1 to H5 have explicit responses and impossible dates do not count as complete',()=>{
 const s=state(),m=campaignReview(s,calculatePlan(s.records,s.brief));for(const id of ['H1','H2','H3','H4','H5'])assert.ok(m.responses.some(r=>r.id===id&&r.answer));assert.match(m.responses.find(r=>r.id==='H4').answer,/未自动用于分资源/);assert.equal(hypothesisStatus({...s.brief,start:'2027-02-30'},s.hypothesis).complete,6);
});
test('fee-specific source provenance follows sparse price updates and explicit false is retained',()=>{
 const rows=[{...row,priceSource:'旧核价'}],matrix=[['媒体编号','单价','制作费','含税'],['test',12000,0,'否']],parsed=normalizeInventoryPatch(rows,matrix,'新核价.csv');assert.deepEqual(parsed.errors,[]);const merged=upsertInventory(rows,parsed,matrix);assert.equal(merged.data[0].priceIncludesTax,false);assert.equal(merged.data[0].production,0);assert.match(merged.data[0].priceSource,/新核价.csv/);
});
test('malformed or boolean-valued fee amounts cannot be treated as confirmed free',()=>{assert.ok(quoteFees({...brief,fees:'bad'}).errors.length);assert.ok(quoteFees({...brief,fees:{monitoring:{status:'separate',amount:false,source:'错误类型'}}}).errors.length);});
test('unfinished fee edits survive draft restoration while remaining blocked from quotes',()=>{const b={...brief,fees:{monitoring:{status:'separate',amount:null,source:''}}};assert.doesNotThrow(()=>validateStoredBrief(b,{allowDraft:true}));assert.throws(()=>validateStoredBrief(b));assert.equal(calculatePlan([row],b).lines.length,0);});
