import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePlan} from '../lib/engine.mjs';
import {packagePlanTiers, selectionTableMarkup, packagePlansMarkup} from '../lib/selection-table.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

const BRIEF = {
  brand: '测试品牌',
  industry: '食品饮料',
  budget: 2000000,
  media: ['bus'],
  start: '2027-01-01',
  end: '2027-03-31',
  goal: '测试组合',
  discount: 1,
};

/** Buyable inventory row with explicit prices (no dependence on realInventory). */
function record(id, media, unitPrice, available, extra = {}) {
  return {
    id,
    name: media === 'bus' ? '公交线路 ' + id : '地铁站点 ' + id,
    media,
    grade: 'A',
    format: media === 'bus' ? '车身' : '站口',
    district: '浦东新区',
    available,
    unitPrice,
    production: 1000,
    availableStart: '2027-01-01',
    availableEnd: '2027-03-31',
    billingUnit: 'period28',
    billingSource: '测试价目表',
    priceIncludesTax: true,
    periodDays: 28,
    source: '测试库存',
    priceSource: '测试价目表',
    snapshotDate: '2026-11-01',
    lat: null,
    lon: null,
    tags: ['商圈'],
    ...extra,
  };
}

/** Plan line carrying the engine's integer cent fields. */
function line({
  id,
  media = 'bus',
  name,
  grade = 'A',
  format,
  district = '浦东新区',
  available = 10,
  quantity = 0,
  mediaUnitCents = 1000,
  productionUnitCents = 0,
  executionUnitCents = 0,
  unitPrice,
  production,
  source = '测试库存',
  demoAssumed,
}) {
  const unitTotalCents = mediaUnitCents + productionUnitCents + executionUnitCents;
  return {
    id,
    name: name ?? (media === 'bus' ? '公交线路 ' + id : '地铁点位 ' + id),
    media,
    grade,
    format: format ?? (media === 'bus' ? '车身' : '站口'),
    district,
    available,
    quantity,
    unitPrice: unitPrice ?? mediaUnitCents / 100,
    production: production ?? productionUnitCents / 100,
    mediaUnit: mediaUnitCents / 100,
    productionUnit: productionUnitCents / 100,
    mediaUnitCents,
    productionUnitCents,
    executionUnitCents,
    unitTotalCents,
    billingLabel: '各分段28天整期',
    billingPeriods: 4,
    source,
    priceSource: '测试价目表',
    ...(demoAssumed ? {demoAssumed} : {}),
  };
}

function planFrom(lines, extra = {}) {
  const mediaCents = lines.reduce((sum, item) => sum + item.quantity * item.mediaUnitCents, 0);
  const productionCents = lines.reduce((sum, item) => sum + item.quantity * item.productionUnitCents, 0);
  const totalCents = lines.reduce((sum, item) => sum + item.quantity * item.unitTotalCents, 0);
  return {
    lines,
    units: lines.reduce((sum, item) => sum + item.quantity, 0),
    media: mediaCents / 100,
    production: productionCents / 100,
    total: totalCents / 100,
    errors: [],
    segments: [{start: '2027-01-01', end: '2027-03-31'}],
    ...extra,
  };
}

function stateWith(brief, extra = {}) {
  return {brief, demoMode: false, places: [], records: [], selection: {}, ...extra};
}

/** Independent implementation of the tier rule for cross-checking a real plan. */
function expectedTier(plan, media, target) {
  const stock = plan.lines
    .filter((item) => item.media === media)
    .map((item) => ({
      id: String(item.id),
      cents: item.unitTotalCents,
      mediaCents: item.mediaUnitCents,
      productionCents: item.productionUnitCents,
      remaining: Math.max(0, item.available - item.quantity),
    }))
    .filter((item) => item.remaining > 0)
    .sort((a, b) => a.cents - b.cents || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let need = target;
  let units = 0;
  let mediaCents = 0;
  let productionCents = 0;
  for (const item of stock) {
    const take = Math.min(item.remaining, need);
    if (take <= 0) continue;
    need -= take;
    units += take;
    mediaCents += take * item.mediaCents;
    productionCents += take * item.productionCents;
    if (!need) break;
  }
  const totalCents = mediaCents + productionCents;
  return {
    units,
    mediaAmount: mediaCents / 100,
    productionAmount: productionCents / 100,
    amount: totalCents / 100,
    avgUnit: units ? Math.round(totalCents / units) / 100 : 0,
    shortfall: target - units,
  };
}

const twoBusLines = () => [
  // 50 remaining at ¥11.00 per unit (media ¥10.00 + production ¥1.00)
  line({id: 'BUS-A', available: 50, quantity: 0, mediaUnitCents: 1000, productionUnitCents: 100}),
  // 70 remaining at ¥22.00 per unit (media ¥20.00 + production ¥2.00)
  line({id: 'BUS-B', available: 90, quantity: 20, mediaUnitCents: 2000, productionUnitCents: 200}),
];

test('tiers are monotonic, bounded by remaining stock, and report the shortfall', () => {
  const plan = planFrom(twoBusLines());
  const before = plan.lines.map((item) => item.id);
  const {tiers} = packagePlanTiers(plan, {...BRIEF, budget: 2000});
  assert.deepEqual(tiers.map((tier) => tier.id), ['bus-100', 'bus-150', 'bus-200']);
  assert.deepEqual(tiers.map((tier) => tier.units), [100, 120, 120]);
  assert.deepEqual(tiers.map((tier) => tier.shortfall), [0, 30, 80]);
  assert.deepEqual(tiers.map((tier) => tier.amount), [1650, 2090, 2090]);
  assert.deepEqual(tiers.map((tier) => tier.budgetGap), [-350, 90, 90]);
  // 50 x 11.00 + 50 x 22.00 = 1650.00; 120 units is the whole remaining stock.
  assert.equal(tiers[0].mediaAmount, 1500);
  assert.equal(tiers[0].productionAmount, 150);
  assert.equal(tiers[1].mediaAmount, 1900);
  assert.equal(tiers[1].productionAmount, 190);
  assert.equal(tiers[2].units, 120);
  assert.ok(tiers.every((tier) => tier.units <= 120));
  for (let index = 1; index < tiers.length; index++) {
    assert.ok(tiers[index].units >= tiers[index - 1].units);
    assert.ok(tiers[index].amount >= tiers[index - 1].amount);
    assert.ok(tiers[index].shortfall >= tiers[index - 1].shortfall);
  }
  assert.deepEqual(plan.lines.map((item) => item.id), before, 'tier estimation must not reorder plan.lines');
});

test('only the channels selected by the brief get tier rows', () => {
  const plan = planFrom([
    ...twoBusLines(),
    line({id: 'METRO-A', media: 'metro', available: 40, quantity: 0, mediaUnitCents: 5000, productionUnitCents: 500}),
  ]);
  const busOnly = packagePlanTiers(plan, {...BRIEF, media: ['bus']});
  assert.deepEqual(busOnly.tiers.map((tier) => tier.id), ['bus-100', 'bus-150', 'bus-200']);
  const metroOnly = packagePlanTiers(plan, {...BRIEF, media: ['metro']});
  assert.deepEqual(metroOnly.tiers.map((tier) => tier.id), ['metro-10', 'metro-20', 'metro-30']);
  const both = packagePlanTiers(plan, {...BRIEF, media: ['bus', 'metro']});
  assert.deepEqual(both.tiers.map((tier) => tier.id), ['bus-100', 'bus-150', 'bus-200', 'metro-10', 'metro-20', 'metro-30']);
  // A metro tier only spends metro stock/prices, never the bus lines.
  assert.equal(metroOnly.tiers[0].units, 10);
  assert.equal(metroOnly.tiers[0].amount, 550);
  const noChannel = packagePlanTiers(plan, {...BRIEF, media: []});
  assert.deepEqual(noChannel.tiers, []);
  assert.ok(noChannel.notes.some((note) => note.includes('未勾选公交或地铁渠道')));
});

test('tiers accumulate integer cents and derive the average unit price from them', () => {
  const plan = planFrom([
    line({id: 'B-2', available: 4, mediaUnitCents: 20, productionUnitCents: 10}),
    line({id: 'B-1', available: 6, mediaUnitCents: 10, productionUnitCents: 10}),
  ]);
  const tier = packagePlanTiers(plan, {...BRIEF, budget: 2}).tiers[0];
  assert.equal(tier.units, 10);
  assert.equal(tier.mediaAmount, 1.4); // 140 cents
  assert.equal(tier.productionAmount, 1); // 100 cents
  assert.equal(tier.amount, 2.4); // 240 cents, not 2.4000000000000004
  assert.equal(tier.mediaAmount + tier.productionAmount, 2.4);
  assert.equal(tier.avgUnit, 0.24); // 24 cents
  assert.equal(tier.budgetGap, 0.4); // 2.40 - 2.00
});

test('equal unit totals are ordered by id so the media/production split is deterministic', () => {
  const plan = planFrom([
    line({id: 'M-Z', media: 'metro', available: 10, mediaUnitCents: 200, productionUnitCents: 800}),
    line({id: 'M-A', media: 'metro', available: 10, mediaUnitCents: 800, productionUnitCents: 200}),
  ]);
  const tier = packagePlanTiers(plan, {...BRIEF, media: ['metro']}).tiers[0];
  assert.equal(tier.units, 10);
  assert.equal(tier.mediaAmount, 80); // M-A is taken first: 10 x 800 cents
  assert.equal(tier.productionAmount, 20);
});

test('an empty plan still returns the selected channels with explicit notes', () => {
  const empty = packagePlanTiers({lines: []}, {...BRIEF, media: ['bus', 'metro']});
  assert.deepEqual(empty.tiers.map((tier) => tier.id), ['bus-100', 'bus-150', 'bus-200', 'metro-10', 'metro-20', 'metro-30']);
  assert.ok(empty.tiers.every((tier) => tier.units === 0 && tier.amount === 0));
  assert.deepEqual(empty.tiers.map((tier) => tier.shortfall), [100, 150, 200, 10, 20, 30]);
  assert.ok(empty.notes.some((note) => note.includes('尚未形成可报价的媒体组合')));
  // A channel without any selected line is called out in the notes.
  const plan = planFrom(twoBusLines());
  const metro = packagePlanTiers(plan, {...BRIEF, media: ['bus', 'metro']});
  assert.ok(metro.notes.some((note) => note.includes('地铁渠道当前没有已选资源')));
  assert.ok(metro.notes.some((note) => note.includes('缺 30 辆')));
});

test('selection table escapes resource names and sources and keeps the mode tag', () => {
  const plan = planFrom([
    line({
      id: 'XSS-1',
      name: '<img src=x onerror=alert(1)>',
      available: 10,
      quantity: 1,
      mediaUnitCents: 1000,
      productionUnitCents: 100,
      unitPrice: 60000,
      source: '<script>alert(1)</script>',
    }),
  ]);
  const html = selectionTableMarkup(stateWith({...BRIEF, selection: {'XSS-1': {mode: 'required'}}}), plan, esc);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /必投/);
  assert.doesNotMatch(html, /<div class="sheet-empty">/);
});

test('empty plans show the empty state and table totals equal the hand-computed cents', () => {
  const emptyHtml = selectionTableMarkup(stateWith(BRIEF), {lines: [], errors: ['组合无效']}, esc);
  assert.equal(emptyHtml, '<div class="sheet-empty">尚未形成可报价的媒体组合</div>');

  const plan = planFrom([
    line({id: 'BUS-1', name: '线路一', available: 10, quantity: 3, mediaUnitCents: 12345, productionUnitCents: 250, unitPrice: 60000}),
    line({id: 'BUS-2', name: '线路二', available: 5, quantity: 2, mediaUnitCents: 9999, productionUnitCents: 100, unitPrice: 30000}),
  ]);
  const html = selectionTableMarkup(stateWith(BRIEF), plan, esc);
  assert.match(html, /class="selection-sheet"/);
  assert.match(html, /class="data-table selection-sheet-table"/);
  assert.match(html, /公交车辆 · 线路甄选表/);
  assert.match(html, /¥60,000\.00/);
  assert.match(html, /¥30,000\.00/);
  assert.match(html, /¥370\.35/); // 3 x 123.45
  assert.match(html, /¥199\.98/); // 2 x 99.99
  // 合计行：数量 5、制作费 9.50、媒介费 570.33、含税合计 579.83
  const totalRow = html.split('class="sheet-total"')[1].split('</tr>')[0];
  assert.match(totalRow, />5</);
  assert.match(totalRow, /¥9\.50/);
  assert.match(totalRow, /¥570\.33/);
  assert.match(totalRow, /¥579\.83/);
});

test('long channel tables show the first 20 rows plus an export pointer', () => {
  const lines = Array.from({length: 30}, (_, index) => {
    const id = 'B-' + String(index + 1).padStart(2, '0');
    return line({id, available: 5, quantity: 1, mediaUnitCents: 100000, productionUnitCents: 0, unitPrice: 60000});
  });
  const html = selectionTableMarkup(stateWith(BRIEF), planFrom(lines), esc);
  assert.match(html, /其余 10 条见导出清单/);
  assert.match(html, /公交线路 B-20/);
  assert.doesNotMatch(html, /公交线路 B-21/);
  assert.match(html, /class="sheet-more"/);
  // The total row still covers all 30 lines, not only the visible 20.
  const totalRow = html.split('class="sheet-total"')[1].split('</tr>')[0];
  assert.match(totalRow, />30</);
});

test('each booked channel gets its own table', () => {
  const plan = planFrom([
    line({id: 'BUS-1', available: 10, quantity: 2, mediaUnitCents: 1000, productionUnitCents: 100}),
    line({id: 'METRO-1', media: 'metro', available: 10, quantity: 3, mediaUnitCents: 5000, productionUnitCents: 500}),
  ]);
  const html = selectionTableMarkup(stateWith({...BRIEF, media: ['bus', 'metro']}), plan, esc);
  assert.match(html, /公交车辆 · 线路甄选表/);
  assert.match(html, /地铁站口 · 点位甄选表/);
  assert.equal((html.match(/<section class="selection-sheet"/g) || []).length, 2);
  assert.equal((html.match(/<tfoot>/g) || []).length, 2);
});

test('demo mode labels both the selection sheet and the package cards', () => {
  const plan = planFrom([line({id: 'BUS-1', available: 10, quantity: 3, mediaUnitCents: 1000, productionUnitCents: 100})]);
  const demoSheet = selectionTableMarkup(stateWith(BRIEF, {demoMode: true}), plan, esc);
  assert.match(demoSheet, /刊例测算 · 非成交价/);
  assert.doesNotMatch(selectionTableMarkup(stateWith(BRIEF), plan, esc), /刊例测算/);
  const demoCards = packagePlansMarkup(stateWith({...BRIEF, budget: 700000}, {demoMode: true}), plan, esc);
  assert.match(demoCards, /测算价/);
  assert.match(demoCards, /刊例测算/);
  assert.match(demoCards, /非成交价/);
  assert.doesNotMatch(packagePlansMarkup(stateWith({...BRIEF, budget: 700000}), plan, esc), /测算价/);
});

test('package cards show target, real availability, costs, unit price and budget gap', () => {
  const prices = {mediaUnitCents: 500000, productionUnitCents: 100000, unitPrice: 60000};
  const plan = planFrom([
    line({id: 'BUS-A', available: 40, quantity: 0, ...prices}),
    line({id: 'BUS-B', available: 40, quantity: 0, ...prices}),
    line({id: 'BUS-C', available: 40, quantity: 0, ...prices}),
  ]);
  const html = packagePlansMarkup(stateWith({...BRIEF, budget: 700000}), plan, esc);
  assert.match(html, /class="package-plans"/);
  assert.equal((html.match(/<article class="package-card/g) || []).length, 3);
  assert.equal((html.match(/package-card active/g) || []).length, 1);
  assert.match(html, /公交 100 辆/);
  assert.match(html, /公交 150 辆/);
  assert.match(html, /公交 200 辆/);
  assert.match(html, /库存仅够 120 辆/);
  assert.match(html, /超预算 ¥2\.00 万/);
  assert.match(html, /折合单台价/);
  assert.match(html, /¥6,000\.00/);
  assert.match(html, /¥60\.00 万/); // 100 units x ¥6,000
  assert.match(html, /¥72\.00 万/); // 120 units x ¥6,000
  assert.match(html, /不是已锁定资源或最终报价/);
  assert.match(html, /class="package-warn"/);
  const activeCard = html.split('<article class="package-card active">')[1].split('</article>')[0];
  assert.match(activeCard, /公交 150 辆/); // ¥72.00 万 is closest to the ¥70.00 万 budget
  // Tiers are only actionable once a plan exists.
  const emptyCards = packagePlansMarkup(stateWith({...BRIEF, budget: 700000}), {lines: []}, esc);
  assert.match(emptyCards, /尚未形成可报价的媒体组合/);
  assert.equal((emptyCards.match(/package-card active/g) || []).length, 0);
});

test('tiers computed from a real calculatePlan run match an independent walk of plan.lines', () => {
  const records = [
    record('BUS-05', 'bus', 30000, 30),
    record('BUS-06', 'bus', 60000, 40),
    record('METRO-02', 'metro', 200000, 12),
  ];
  const brief = {...BRIEF, budget: 5000000, media: ['bus', 'metro']};
  const plan = calculatePlan(records, brief, []);
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.lines.length > 0);
  assert.ok(plan.lines.every((item) => item.quantity > 0 && item.quantity <= item.available));
  assert.ok(plan.lines.every((item) => Number.isSafeInteger(item.unitTotalCents)));

  const {tiers} = packagePlanTiers(plan, brief);
  assert.deepEqual(tiers.map((tier) => tier.id), ['bus-100', 'bus-150', 'bus-200', 'metro-10', 'metro-20', 'metro-30']);
  for (const tier of tiers) {
    assert.equal(tier.shortfall, tier.target - tier.units);
    assert.ok(tier.units <= tier.target);
    if (tier.media === 'bus') assert.deepEqual(tier, {...tier, ...expectedTier(plan, 'bus', tier.target)});
    if (tier.media === 'metro') assert.deepEqual(tier, {...tier, ...expectedTier(plan, 'metro', tier.target)});
  }
  // The sheet totals equal the same integer-cent walk.
  const html = selectionTableMarkup(stateWith(brief), plan, esc);
  assert.match(html, /公交车辆 · 线路甄选表/);
  assert.match(html, /class="sheet-total"/);
});
