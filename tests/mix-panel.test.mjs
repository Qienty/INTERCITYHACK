import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {realInventory,realRates} from '../data/real-data.mjs';
import {calculatePlan} from '../lib/engine.mjs';
import {demoInventory,demoPriceFor,demoProductionFor,demoCoverage,DEMO_METRO_PRODUCTION} from '../lib/demo-mode.mjs';
import {mixPanelView,mixRatioField,setMixExpanded,isMixExpanded,setMixShowAll} from '../lib/mix-panel.mjs';
import {quoteSheets,exportHTML} from '../lib/export.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const brief = {industry: '食品饮料', brand: '测试品牌', budget: 2000000, media: ['bus'], start: '2027-01-01', end: '2027-03-31', discount: 1, goal: '测试组合'};
const metroRow = {id: 'METRO-TEST-1', name: '测试站口', media: 'metro', grade: 'L2', format: '出入口', available: 5, capacity: 5, maintenance: 0, contracted: 0, reserved: 0, renewal: 0, unitPrice: null, production: null, priceIncludesTax: null, periodDays: null, availableStart: '', availableEnd: '', lat: null, lon: null, tags: [], source: '测试输入', priceSource: '', insightIds: [], rateIds: [], coverageIds: []};
const withMetro = () => [...realInventory.slice(0, 40), metroRow];
const demoState = (records, extra = {}) => {
  const derived = demoInventory(records, realRates, {...brief, ...extra});
  const state = {brief: {...brief, ...extra}, records, demoMode: true, places: [], evidence: [], selection: {}};
  return {state, derived, plan: calculatePlan(derived.records, state.brief, [])};
};

test('demo prices follow the published bus grades and the interface metro ranks', () => {
  assert.equal(demoPriceFor('bus', 'S', realRates, 'mid'), 60000);
  assert.equal(demoPriceFor('bus', 'A++', realRates, 'mid'), 50000);
  assert.equal(demoPriceFor('bus', 'A+', realRates, 'mid'), 40000);
  assert.equal(demoPriceFor('bus', 'A+', realRates, 'low'), 30000);
  assert.equal(demoPriceFor('bus', 'A+', realRates, 'high'), 50000);
  assert.equal(demoPriceFor('metro', 'A++', realRates, 'mid'), 300000);
  assert.equal(demoPriceFor('metro', 'A+', realRates, 'mid'), 200000);
  assert.equal(demoPriceFor('metro', 'L1', realRates, 'mid'), 300000);
  assert.equal(demoPriceFor('metro', 'L2', realRates, 'mid'), 200000);
  assert.equal(demoPriceFor('metro', 'L3', realRates, 'mid'), 150000);
  assert.equal(demoProductionFor('bus', 'S', realRates, {}), 7500);
  assert.equal(demoProductionFor('metro', 'L2', realRates, {}), DEMO_METRO_PRODUCTION);
});

test('demo estimates fill only missing conditions and never mutate the source records', () => {
  const verified = {...realInventory[0], unitPrice: 123456, production: 0, priceIncludesTax: true, periodDays: 28, billingUnit: 'period28', availableStart: '2027-01-01', availableEnd: '2027-03-31', priceSource: '已核实记录'};
  const missing = {...realInventory[1]};
  const before = JSON.stringify([verified, missing]);
  const {records, changes} = demoInventory([verified, missing], realRates, brief);
  assert.equal(JSON.stringify([verified, missing]), before, 'input records stay untouched');
  assert.equal(records[0].unitPrice, 123456);
  assert.equal(records[0].priceSource, '已核实记录');
  assert.equal(records[1].unitPrice, demoPriceFor('bus', missing.grade, realRates, 'mid'));
  assert.equal(records[1].billingUnit, 'calendarMonth');
  assert.equal(records[1].priceIncludesTax, true);
  assert.ok(records[1].production >= 0);
  assert.equal(records[1].availableStart, '2027-01-01');
  assert.equal(records[1].availableEnd, '2027-12-31');
  assert.ok(changes.priced >= 1);
  assert.ok(changes.dated >= 1);
});

test('demo quotes are feasible inside the budget and keep the real availability counts', () => {
  const {plan, derived} = demoState(realInventory.slice(0, 80));
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.lines.length > 0);
  assert.ok(plan.total > 0 && plan.total <= brief.budget);
  assert.ok(plan.lines.every((line) => line.quantity <= line.available));
  assert.ok(derived.records.every((row) => row.priceIncludesTax === true));
  assert.equal(plan.lines.reduce((sum, line) => sum + line.quantity, 0), plan.units);
});

test('demo coverage reports the real gap counts', () => {
  const coverage = demoCoverage(realInventory, realRates);
  assert.equal(coverage.total, realInventory.length);
  assert.equal(coverage.priced, 0);
  assert.equal(coverage.dated, 0);
});

test('mix panel empty state explains the gap and offers the labelled demo estimate', () => {
  const plan = calculatePlan(realInventory, {...brief, start: '', end: ''}, []);
  setMixExpanded(true);
  const html = mixPanelView({brief: {...brief, start: '', end: ''}, records: realInventory, demoMode: false, selection: {}}, plan, esc);
  assert.match(html, /媒体组合栏/);
  assert.match(html, /data-demo-mode="on"/);
  assert.match(html, /data-demo-quick/);
  assert.match(html, /条待补核价条件/);
  assert.match(html, /只有区间刊例|还差|无法生成|不能生成/);
  assert.doesNotMatch(html, /data-mix-step/);
});

test('mix panel renders channel sections, steppers, quote rows and the ratio goal', () => {
  const {state, plan} = demoState(withMetro(), {budget: 5000000, media: ['bus', 'metro'], constraints: {busShare: 65, shareTolerance: 5}});
  setMixExpanded(true);
  const html = mixPanelView(state, {...plan, demoAssumptions: ['假设 A']}, esc);
  assert.match(html, /data-mix-step="-1"/);
  assert.match(html, /data-mix-step="1"/);
  assert.doesNotMatch(html, /data-mix-ratio/);assert.match(html, /配比目标与容差只在左侧/);
  assert.doesNotMatch(html, /data-mix-tolerance/);
  assert.doesNotMatch(html, /data-mix-hard/);
  assert.match(html, /公交数量占比/);
  assert.match(html, /报价构成/);
  assert.match(html, /含税合计/);
  assert.match(html, /媒体组合栏/);
  assert.match(html, /刊例测算/);
  assert.match(html, /约束校验/);
  assert.match(html, /data-mix-show-all|data-mix-goto="selection"/);
});

test('mix panel escapes resource names and keeps ratio controls out for single-channel briefs', () => {
  const records = [{...realInventory[0], id: 'XSS-1', name: '<img src=x onerror=alert(1)>', available: 3}];
  const {state, plan} = demoState(records);
  setMixExpanded(true);
  const html = mixPanelView(state, plan, esc);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(html, /data-mix-ratio/);
});

test('collapsed mix panel shows the summary but no detail body', () => {
  const {state, plan} = demoState(realInventory.slice(0, 20));
  setMixExpanded(false);
  const html = mixPanelView(state, plan, esc);
  assert.match(html, /data-mix-expand/);
  assert.doesNotMatch(html, /mix-panel-body/);
  setMixExpanded(true);
});

test('brief ratio field appears only when both channels are selected', () => {
  const one = {...brief, media: ['bus']};
  assert.equal(mixRatioField({brief: one, records: realInventory, selection: {}}, calculatePlan(realInventory, one, []), esc), '');
  const two = {...brief, media: ['bus', 'metro'], constraints: {busShare: 65}};
  const field = mixRatioField({brief: two, records: withMetro(), selection: {}}, calculatePlan(withMetro(), two, []), esc);
  assert.match(field, /data-mix-ratio/);
  assert.match(field, /公交 65%/);
  assert.match(field, /双媒体配比/);
});

test('demo mode is labelled in exported sheets and the standalone proposal', () => {
  const {state, derived, plan} = demoState(withMetro(), {media: ['bus', 'metro']});
  const sheets = quoteSheets({...state, records: derived.records}, {...plan, demoAssumptions: ['测算假设说明']});
  const flat = JSON.stringify(sheets);
  assert.match(flat, /刊例测算/);
  assert.match(flat, /测算假设说明/);
  assert.match(flat, /非真实成交价/);
  const html = exportHTML({...state, evidence: [], strategyText: '', strategySource: '', records: derived.records});
  assert.match(html, /刊例测算/);
  assert.match(html, /非真实成交价/);
});

test('the mix panel component contains no unlabelled demo wording in normal mode', async () => {
  const source = await readFile(new URL('../lib/mix-panel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /测算价\s*[:：]/);
});

test('the standalone demo proposal runs offline with the derived records and keeps the label', () => {
  const {state, derived} = demoState(withMetro(), {media: ['bus', 'metro']});
  const html = exportHTML({...state, evidence: [], strategyText: '', strategySource: '', records: derived.records});
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const node = {innerHTML: ''};
  const context = vm.createContext({document: {getElementById: () => node}, console});
  vm.runInContext(script, context);
  vm.runInContext('update(200)', context);
  assert.match(node.innerHTML, /刊例测算/);
  assert.match(node.innerHTML, /非真实成交价/);
  assert.match(node.innerHTML, /¥/);
});

test('show-all toggle is honoured by the panel renderer', () => {
  const {state, plan} = demoState(realInventory.slice(0, 80));
  setMixExpanded(true);
  setMixShowAll(true);
  const html = mixPanelView(state, plan, esc);
  assert.doesNotMatch(html, /data-mix-show-all/);
  setMixShowAll(false);
  assert.equal(isMixExpanded(), true);
});