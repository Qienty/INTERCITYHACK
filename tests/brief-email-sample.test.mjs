import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBrief,prepareBriefDraft} from '../lib/brief-import.mjs';

// Structure of the supplied 4A brief e-mail sample (比赛文档/06), with the same fields
// and an anonymised client name. The competition window is 2027, so the original 2026
// dates must be reported instead of silently imported.
const SAMPLE = `客户 brief 邮件样本（脱敏版）
主题：【投放需求】某国际品牌 2026 年 5 月上海户外大牌 brief，请于 2 个工作日内回复排期与报价
客户「某国际品牌」（品类保密，下称客户）计划 5 月在上海做一波品牌形象投放，现将需求同步如下，请协助确认排期与报价：
一、投放需求
1. 媒体形式：城市核心商圈户外大牌（LED 优先，静态大牌备选）；
2. 投放区域：上海核心商圈，参考级别——陆家嘴、正大广场级客流点位；
3. 投放周期：2026 年 5 月 1 日 – 5 月 10 日，共 10 天；
4. 数量：1 块，可拆两段排期（5/1–5/7、5/8–5/10）；
5. 素材：客户 4 月下旬提供终稿，刊例口径价格基础上请给年度代理折扣。
二、监测与结算要求
1. 上刊当日提供上刊照片（带报头日期），下刊后 5 个工作日内提供下刊照片；
2. 按双方签署的年度合作协议框架执行，具体点位、金额以本排期单为准；
3. 发票与付款节奏按框架协议月度结算。
三、回复要求
请于收到本邮件 2 个工作日内回复：可售点位清单（位置/级别/刊例区间）、建议排期、折后报价。
顺祝商祺
某 4A 公司 媒介部`;

const Y2027 = SAMPLE.replaceAll('2026 年 5 月 1 日', '2027 年 5 月 1 日');

test('4A e-mail keeps the client name and requirement sections instead of only areas', () => {
  const result = extractBrief(SAMPLE, '4A brief');
  assert.equal(result.values.brand, '某国际品牌');
  assert.match(result.values.quantity, /1 块/);
  assert.match(result.values.quantity, /可拆两段/);
  assert.match(result.values.monitoring, /上刊照片/);
  assert.match(result.values.monitoring, /下刊后 5 个工作日/);
  assert.match(result.values.settlement, /发票/);
  assert.match(result.values.settlement, /月度结算/);
  assert.match(result.values.deadline, /2 个工作日内回复/);
  assert.doesNotMatch(result.values.deadline, /顺祝商祺/);
});

test('outside-2027 dates are refused with a specific reason, not a generic warning', () => {
  const result = extractBrief(SAMPLE, '4A brief');
  assert.equal(result.values.start, undefined);
  assert.equal(result.values.end, undefined);
  assert.equal(result.values.schedule, undefined);
  assert.ok(result.warnings.some((warning) => /2026-05-01/.test(warning) && /2027/.test(warning)));
  assert.equal(result.warnings.filter((warning) => /投放日期不完整/.test(warning)).length, 0);
});

test('unsupported media is named and the channel is left unselected', () => {
  const result = extractBrief(SAMPLE, '4A brief');
  assert.equal(result.values.media, undefined);
  assert.ok(result.warnings.some((warning) => /户外大牌/.test(warning) && /公交车身与地铁站口/.test(warning)));
});

test('the same brief inside 2027 imports dates and honours the two-segment request', () => {
  const result = extractBrief(Y2027, '4A brief');
  assert.equal(result.values.start, '2027-05-01');
  assert.equal(result.values.end, '2027-05-10');
  assert.ok(result.values.schedule);
  assert.equal(result.values.schedule.mode, 'segments');
  assert.deepEqual(result.values.schedule.ranges, [{start: '2027-05-01', end: '2027-05-07'}, {start: '2027-05-08', end: '2027-05-10'}]);
  assert.equal(result.warnings.filter((warning) => /2027 年内/.test(warning)).length, 0);
});

test('the draft keeps current channels and imports the new requirement fields after review', () => {
  const current = {industry: '食品饮料', brand: '', budget: 2000000, media: ['bus'], start: '', end: '', discount: 1, goal: ''};
  const extracted = extractBrief(SAMPLE, '4A brief');
  const draft = prepareBriefDraft(current, extracted);
  assert.equal(draft.brief.brand, '某国际品牌');
  assert.deepEqual(draft.brief.media, ['bus']);
  assert.equal(draft.brief.start, '');
  assert.equal(draft.brief.monitoring, extracted.values.monitoring);
  assert.equal(draft.brief.settlement, extracted.values.settlement);
  assert.equal(draft.brief.deadline, extracted.values.deadline);
  assert.ok(draft.warnings.some((warning) => /2027/.test(warning)));
});

test('section markers from DOCX/PDF extraction do not leak into imported fields', () => {
  const marked = SAMPLE.split('\n').map((line, index) => '【段落 ' + (index + 1) + '】\n' + line).join('\n');
  const result = extractBrief(marked, 'docx brief');
  assert.equal(result.values.brand, '某国际品牌');
  assert.match(result.values.monitoring, /上刊照片/);
  assert.doesNotMatch(result.values.deadline, /【段落/);
  assert.ok(result.text.startsWith('【段落 1】'), 'original text is preserved for the source receipt');
});