import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBrief,briefCandidatesFromRows,reviewBrief,prepareBriefDraft,BRIEF_TEMPLATE_HEADERS} from '../lib/brief-import.mjs';
const current={brand:'已有客户',industry:'食品饮料',budget:2000000,media:['bus'],start:'',end:'',goal:'已有目标',discount:1};
test('explicit brief fields include evidence and full campaign dates',()=>{
  const text='客户品牌：客户甲\n客户行业：银行保险\n含税总预算（万元）：125.5\n投放媒体：公交车身 + 地铁出入口\n投放档期：2027年3月1日至2027年3月28日\n投放目标：覆盖线下网点\n目标人群：家庭客群\n重点区域：浦东新区\n门店清单：客户提供门店\n补充要求：按合同监测';
  const d=extractBrief(text,'客户邮件');assert.equal(d.values.budget,1255000);assert.deepEqual(d.values.media,['bus','metro']);assert.equal(d.values.start,'2027-03-01');assert.equal(d.values.end,'2027-03-28');assert.equal(d.values.industry,'银行保险');assert.equal(d.values.goal,'覆盖线下网点');assert.equal(d.values.areas,'浦东新区');assert.equal(d.text,text);assert.match(d.snippets.budget,/125.5/);assert.deepEqual(d.warnings,[]);
});
test('budget parsing respects units and never treats a bare amount as yuan',()=>{
  for(const text of ['预算：200万元','预算（万元）：200','预算（元）：2,000,000','预算：两百万元','预算：人民币2000000','预算：200万元（含税）'])assert.equal(extractBrief(text).values.budget,2000000,text);
  for(const text of ['预算：200','预算：100–200万','预算：200万元或500万元','预算：USD 2000000'])assert.equal(extractBrief(text).values.budget,undefined,text);
});
test('conflicting repeated budgets require manual review and preserve source snippets',()=>{
  const d=extractBrief('预算：100万\n预算：500万');assert.equal(d.values.budget,undefined);assert.match(d.warnings.join(''),/冲突/);assert.match(d.snippets.budget,/100万/);assert.match(d.snippets.budget,/500万/);
  assert.equal(extractBrief('预算：200万\n预算：200万元').values.budget,2000000);
});
test('empty fields do not swallow the following label or inherit unrelated values',()=>{
  const d=extractBrief('客户品牌：\n行业：食品饮料\n预算：\n投放目标：增加认知');assert.equal(d.values.brand,undefined);assert.equal(d.values.budget,undefined);assert.equal(d.values.industry,'食品饮料');assert.equal(d.values.goal,'增加认知');
  assert.deepEqual(extractBrief('请尽快出一版方案').values,{});
});
test('media choices honor exclusions while alternatives remain undecided',()=>{
  assert.deepEqual(extractBrief('投放媒体：只投公交，不要地铁').values.media,['bus']);
  assert.deepEqual(extractBrief('投放媒体：不要公交，仅投地铁出入口').values.media,['metro']);
  assert.equal(extractBrief('投放媒体：公交或地铁').values.media,undefined);
});
test('incomplete dates and impossible dates are not invented',()=>{
  const d=extractBrief('投放档期：2027年3月');assert.equal(d.values.start,undefined);assert.equal(d.values.end,undefined);assert.ok(d.warnings.length);
  assert.equal(extractBrief('开始日期：2027-02-30').values.start,undefined);
  assert.equal(extractBrief('档期：2027-03-01 至 03-28').values.end,undefined);
});
test('plain email sentences can extract explicit amounts and media conservatively',()=>{
  const d=extractBrief('我们是食品饮料行业。预算200万元，计划投放公交车身和地铁出入口。档期为2027-05-01至2027-05-28。');assert.equal(d.values.industry,'食品饮料');assert.equal(d.values.budget,2000000);assert.deepEqual(d.values.media,['bus','metro']);assert.equal(d.values.start,'2027-05-01');
});
test('vertical templates preserve the declared budget unit',()=>{
  const rows=[['字段','填写内容','填写说明'],...BRIEF_TEMPLATE_HEADERS.map(h=>[h,'','填写说明'])];rows[1][1]='客户乙';rows[3][1]='200';const ds=briefCandidatesFromRows(rows,'需求.csv');assert.equal(ds.length,1);assert.equal(ds[0].values.brand,'客户乙');assert.equal(ds[0].values.budget,2000000);assert.equal(ds[0].values.industry,undefined);
});
test('horizontal sheets keep clients separate and retain unknown columns in original text',()=>{
  const ds=briefCandidatesFromRows([['客户品牌','预算（万元）','联系人'],['客户甲',100,'联系人甲'],['客户乙',500,'联系人乙']],'需求.xlsx');assert.equal(ds.length,2);assert.equal(ds[0].values.budget,1000000);assert.equal(ds[1].values.budget,5000000);assert.match(ds[1].text,/联系人乙/);
});
test('date serials in explicitly named date columns convert without guessing other numbers',()=>{
  const serial=(Date.UTC(2027,0,1)-Date.UTC(1899,11,30))/86400000;
  const [d]=briefCandidatesFromRows([['客户品牌','投放开始日期','预算（元）'],['客户甲',serial,2000000]],'日期.xlsx');assert.equal(d.values.start,'2027-01-01');assert.equal(d.values.budget,2000000);
});
test('unmapped vertical fields remain in the original without becoming a previous field value',()=>{
  const [d]=briefCandidatesFromRows([['客户品牌','客户甲'],['投放目标','关注线下门店'],['额外附件说明','随表提供门店清单']],'需求.csv');
  assert.match(d.text,/额外附件说明/);assert.equal(d.values.goal,'关注线下门店');
});
test('review applies only allowed selected fields and never alters inventory or price coefficient',()=>{
  const r=reviewBrief(current,{brand:'新客户',records:[],discount:0.1});assert.deepEqual(r.patch,{brand:'新客户'});assert.equal(r.merged.budget,current.budget);assert.equal(r.merged.goal,current.goal);assert.equal(r.merged.discount,1);assert.equal(current.brand,'已有客户');assert.ok(r.pending.length);
});
test('review blocks invalid bounds, invalid media and reversed dates',()=>{
  for(const patch of [{budget:NaN},{budget:999999},{budget:5000001},{industry:'其他'},{media:[]},{media:['other']},{start:'2026-01-01'},{start:'2027-03-30',end:'2027-03-01'},{brand:''},{}])assert.ok(reviewBrief(current,patch).errors.length,JSON.stringify(patch));
  assert.deepEqual(reviewBrief(current,{start:'2027-03-01',end:'2027-03-28',budget:1255000}).errors,[]);
});
test('empty or oversized sources are rejected rather than silently truncated',()=>{
  assert.throws(()=>extractBrief('   '));assert.throws(()=>extractBrief('字'.repeat(50001)));assert.throws(()=>briefCandidatesFromRows([['无字段','文字']],'无法识别.csv'));
});
test('inline drafts fill all recognized fields at once and retain missing values',()=>{
  const draft=prepareBriefDraft(current,extractBrief('品牌：直接填入客户\n预算：150万元\n投放媒体：公交车身和地铁出入口'));
  assert.equal(draft.brief.brand,'直接填入客户');assert.equal(draft.brief.budget,1500000);assert.deepEqual(draft.brief.media,['bus','metro']);assert.equal(draft.brief.goal,current.goal);assert.equal(current.brand,'已有客户');
});
test('inline filling never clamps invalid budgets or rejects a new valid date range against old dates',()=>{
  const prior={...current,start:'2027-01-01',end:'2027-01-28'};
  const draft=prepareBriefDraft(prior,extractBrief('品牌：新客户\n预算：600万元\n档期：2027-05-01 至 2027-05-28'));
  assert.equal(draft.brief.budget,current.budget);assert.equal(draft.brief.start,'2027-05-01');assert.equal(draft.brief.end,'2027-05-28');assert.ok(draft.warnings.some(w=>w.includes('预算')));
});
