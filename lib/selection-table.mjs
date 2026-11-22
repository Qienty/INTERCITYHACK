// Proposal-page renderers for the resource selection sheet and the three-tier
// purchase packages. The markup helpers are pure: (state, plan, esc) -> HTML
// string and never touch the DOM. packagePlanTiers is the pure data helper.
//
// Money rules: the engine keeps amounts in 元 built from integer cents. Tier
// totals are accumulated in integer 分 here and converted back to 元 rounded to
// the cent, so no floating-point drift. Markup shows totals in 万元 with two
// decimals (e.g. ¥138.00 万) and unit prices in 元 with thousands separators
// (e.g. ¥60,000.00).
//
// Only the bus and metro-station channels exist; no other channel is invented.

const TIER_SPECS = [
  {media: 'bus', label: '公交', unit: '辆', avgLabel: '单台', tableTitle: '公交车辆 · 线路甄选表', targets: [100, 150, 200]},
  {media: 'metro', label: '地铁', unit: '口', avgLabel: '单口', tableTitle: '地铁站口 · 点位甄选表', targets: [10, 20, 30]},
];

// A channel table with more than 24 rows is cut to the first 20 rows; the total
// row still covers every line and points at the export sheet for the rest.
const ROW_LIMIT = 20;
const ROW_TRUNCATE_ABOVE = 24;

const DEFAULT_ESCAPE = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const toCents = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0);
const toQuantity = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);
const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
/** null for missing/blank values instead of Number(null) === 0. */
const numberOr = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const yuan = (value) => {
  const number = toNumber(value);
  return number === null ? '—' : '¥' + number.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
};
const wanYuan = (value) => '¥' + (Number(value || 0) / 10000).toFixed(2) + ' 万';

/** Per-unit media cost in 分, preferring the engine's integer cent field. */
function mediaUnitCents(line) {
  if (Number.isSafeInteger(line?.mediaUnitCents)) return line.mediaUnitCents;
  return toCents(line?.mediaUnit ?? line?.unitPrice);
}

/** Per-unit production cost in 分, preferring the engine's integer cent field. */
function productionUnitCents(line) {
  if (Number.isSafeInteger(line?.productionUnitCents)) return line.productionUnitCents;
  return toCents(line?.productionUnit ?? line?.production);
}

/** Sort key requested by the spec: unit total (media + production + execution). */
function unitTotalCents(line) {
  if (Number.isSafeInteger(line?.unitTotalCents)) return line.unitTotalCents;
  const execution = Number.isSafeInteger(line?.executionUnitCents) ? line.executionUnitCents : 0;
  return mediaUnitCents(line) + productionUnitCents(line) + execution;
}

/** Sellable units left after the current plan already allocated a quantity. */
function remainingUnits(line) {
  const available = Number(line?.available);
  const quantity = Number(line?.quantity);
  if (!Number.isFinite(available) || !Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.floor(available - quantity));
}

/** Row-level amounts in 分, recomputed from integer cents when possible. */
function lineAmountCents(line) {
  const quantity = toQuantity(line?.quantity);
  return {
    media: Number.isSafeInteger(line?.mediaUnitCents) ? quantity * line.mediaUnitCents : toCents(line?.mediaAmount),
    production: Number.isSafeInteger(line?.productionUnitCents) ? quantity * line.productionUnitCents : toCents(line?.productionAmount),
    total: Number.isSafeInteger(line?.unitTotalCents) ? quantity * line.unitTotalCents : toCents(line?.amount),
  };
}

function sheetTotals(lines) {
  const totals = {units: 0, media: 0, production: 0, total: 0};
  for (const line of lines) {
    totals.units += toQuantity(line?.quantity);
    const amounts = lineAmountCents(line);
    totals.media += amounts.media;
    totals.production += amounts.production;
    totals.total += amounts.total;
  }
  return totals;
}

/**
 * Deterministic three-tier purchase package estimate.
 *
 * For each selected channel (bus 100/150/200 辆, metro 10/20/30 口) it walks the
 * channel's current plan.lines ordered by unitTotalCents ascending (ties by id)
 * and takes min(remaining sellable, still needed) until the target is reached or
 * stock runs out. This is an estimate against the already selected resources,
 * not a re-allocation, and it locks nothing.
 *
 * @param {{lines?: Array<object>}} plan result of calculatePlan
 * @param {{media?: string[], budget?: number}} brief current brief (budget in 元)
 * @returns {{tiers: Array<object>, notes: string[]}}
 */
export function packagePlanTiers(plan, brief) {
  const lines = Array.isArray(plan?.lines) ? plan.lines : [];
  const media = Array.isArray(brief?.media) ? brief.media : [];
  const budgetCents = Number.isFinite(Number(brief?.budget)) ? Math.round(Number(brief.budget) * 100) : 0;
  const tiers = [];
  const notes = [];
  if (!lines.length) notes.push('当前方案尚未形成可报价的媒体组合，档位数量均按 0 测算。');
  if (!budgetCents) notes.push('需求未填写有效预算，档位合计与预算的对比仅供参考。');
  const specs = TIER_SPECS.filter((spec) => media.includes(spec.media));
  if (!specs.length) notes.push('需求未勾选公交或地铁渠道，没有可测算的档位。');
  for (const spec of specs) {
    const channelLines = lines.filter((line) => line && line.media === spec.media);
    if (!channelLines.length) notes.push(spec.label + '渠道当前没有已选资源，档位数量无法测算。');
    const stock = channelLines
      .map((line) => ({
        id: String(line.id ?? ''),
        cents: unitTotalCents(line),
        mediaCents: mediaUnitCents(line),
        productionCents: productionUnitCents(line),
        remaining: remainingUnits(line),
      }))
      .sort((a, b) => a.cents - b.cents || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const target of spec.targets) {
      let need = target;
      let units = 0;
      let mediaCents = 0;
      let productionCents = 0;
      for (const item of stock) {
        if (need <= 0) break;
        const take = Math.min(item.remaining, need);
        if (take <= 0) continue;
        need -= take;
        units += take;
        mediaCents += take * item.mediaCents;
        productionCents += take * item.productionCents;
      }
      const amountCents = mediaCents + productionCents;
      const label = spec.label + ' ' + target + ' ' + spec.unit;
      tiers.push({
        id: spec.media + '-' + target,
        media: spec.media,
        label,
        target,
        unitLabel: spec.unit,
        avgLabel: spec.avgLabel,
        units,
        mediaAmount: mediaCents / 100,
        productionAmount: productionCents / 100,
        amount: amountCents / 100,
        avgUnit: units ? Math.round(amountCents / units) / 100 : 0,
        shortfall: target - units,
        // Positive means the tier total is over the brief budget (both in 元).
        // Without a valid budget there is nothing to compare, so keep it neutral.
        budgetGap: budgetCents ? (amountCents - budgetCents) / 100 : 0,
      });
      if (channelLines.length && target - units > 0) {
        notes.push(label + '：当前可售余量仅够 ' + units + ' ' + spec.unit + '，缺 ' + (target - units) + ' ' + spec.unit + '，不足部分需另找资源补充。');
      }
    }
  }
  return {tiers, notes};
}

function totalRowMarkup(totals, count) {
  return '<tr class="sheet-total"><th colspan="4">合计（' + count + ' 条 · 全部行）</th>'
    + '<td class="num"></td>'
    + '<td class="num">' + totals.units + '</td>'
    + '<td class="num"></td>'
    + '<td class="num">' + yuan(totals.production / 100) + '</td>'
    + '<td class="num">' + yuan(totals.media / 100) + '</td>'
    + '<td class="num">' + yuan(totals.total / 100) + '</td>'
    + '<td></td></tr>';
}

function rowMarkup(line, selection, escape, demo) {
  const mode = selection?.[line.id]?.mode;
  const modeLabel = mode === 'required' ? '必投' : mode === 'fixed' ? '锁定' : '自动';
  const amounts = lineAmountCents(line);
  const productionUnit = Number.isSafeInteger(line?.productionUnitCents)
    ? line.productionUnitCents / 100
    : (line?.productionUnit ?? line?.production);
  const productionNumber = numberOr(productionUnit, null);
  const available = numberOr(line?.available, '—');
  const periods = numberOr(line?.billingPeriods, null);
  const billing = line?.billingLabel
    ? '<small>' + escape(line.billingLabel) + (periods === null ? '' : ' · ' + periods + ' 期') + '</small>'
    : '';
  const unitPrice = numberOr(line?.unitPrice, null);
  const price = unitPrice === null ? '—' : yuan(unitPrice) + billing;
  const id = line?.id === undefined || line?.id === null ? '' : '<small>' + escape(line.id) + '</small>';
  const source = line?.source ? '<small>' + escape(line.source) + '</small>' : '';
  const demoMark = demo && Array.isArray(line?.demoAssumed) && line.demoAssumed.length ? '<span class="sheet-tag">测算</span>' : '';
  return '<tr>'
    + '<td><strong>' + escape(line?.name) + '</strong>' + id + source + '</td>'
    + '<td>' + (line?.grade ? escape(line.grade) : '—') + '</td>'
    + '<td>' + (line?.format ? escape(line.format) : '—') + '</td>'
    + '<td>' + (line?.district ? escape(line.district) : '—') + '</td>'
    + '<td class="num">' + available + '</td>'
    + '<td class="num">' + toQuantity(line?.quantity) + '</td>'
    + '<td class="num">' + price + '</td>'
    + '<td class="num">' + (productionNumber === null ? '—' : yuan(productionNumber)) + '</td>'
    + '<td class="num">' + yuan(amounts.media / 100) + '</td>'
    + '<td class="num">' + yuan(amounts.total / 100) + '</td>'
    + '<td>' + modeLabel + demoMark + '</td>'
    + '</tr>';
}

function channelSheetMarkup(spec, lines, {demo, selection, escape}) {
  const totals = sheetTotals(lines);
  const truncated = lines.length > ROW_TRUNCATE_ABOVE;
  const visible = truncated ? lines.slice(0, ROW_LIMIT) : lines;
  const rows = visible.map((line) => rowMarkup(line, selection, escape, demo)).join('');
  const head = '<header class="sheet-head">'
    + '<h3 class="sheet-title">' + spec.tableTitle + '</h3>'
    + '<span class="sheet-tag">' + lines.length + ' 条 · ' + totals.units + ' ' + spec.unit + ' · 媒介费 ' + wanYuan(totals.media / 100) + '</span>'
    + (demo ? '<span class="sheet-tag">刊例测算 · 非成交价</span>' : '')
    + '</header>';
  const table = '<div class="table-scroll"><table class="data-table selection-sheet-table">'
    + '<thead><tr><th>线路 / 点位</th><th>等级</th><th>形式</th><th>区域</th>'
    + '<th class="num">可售</th><th class="num">配量</th><th class="num">刊例单价</th>'
    + '<th class="num">制作费 / 单位</th><th class="num">媒介费</th><th class="num">含税金额</th><th>来源</th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '<tfoot>' + totalRowMarkup(totals, lines.length) + '</tfoot>'
    + '</table></div>';
  const more = truncated
    ? '<p class="sheet-more">其余 ' + (lines.length - ROW_LIMIT) + ' 条见导出清单（本表最多显示 ' + ROW_LIMIT + ' 行，合计含全部 ' + lines.length + ' 条）</p>'
    : '';
  return '<section class="selection-sheet" data-sheet-media="' + spec.media + '">' + head + table + more + '</section>';
}

/**
 * Proposal-page resource selection tables, one table per booked channel.
 *
 * @param {object} state workbench state (uses brief.selection and demoMode)
 * @param {{lines?: Array<object>}} plan result of calculatePlan
 * @param {(value: unknown) => string} esc HTML escape helper
 * @returns {string}
 */
export function selectionTableMarkup(state, plan, esc) {
  const escape = typeof esc === 'function' ? esc : DEFAULT_ESCAPE;
  const lines = Array.isArray(plan?.lines) ? plan.lines : [];
  if (!lines.length) return '<div class="sheet-empty">尚未形成可报价的媒体组合</div>';
  const demo = state?.demoMode === true;
  const selection = state?.brief?.selection && typeof state.brief.selection === 'object' ? state.brief.selection : {};
  const sheets = TIER_SPECS
    .map((spec) => {
      const channelLines = lines.filter((line) => line && line.media === spec.media);
      return channelLines.length ? channelSheetMarkup(spec, channelLines, {demo, selection, escape}) : '';
    })
    .filter(Boolean);
  return sheets.length ? sheets.join('') : '<div class="sheet-empty">尚未形成可报价的媒体组合</div>';
}

function packageCardMarkup(tier, {active, budgetCents, demo, escape}) {
  const unit = tier.unitLabel;
  const actual = tier.shortfall > 0
    ? tier.units + ' ' + unit + ' · 缺 ' + tier.shortfall + ' ' + unit
    : tier.units + ' ' + unit;
  const compare = !budgetCents
    ? '预算未填写，无法对比'
    : tier.budgetGap > 0
      ? '超预算 ' + wanYuan(tier.budgetGap) + '（档位合计 − 预算）'
      : tier.budgetGap < 0
        ? '低于预算 ' + wanYuan(-tier.budgetGap) + '（档位合计 − 预算）'
        : '与预算持平';
  const warnings = [];
  if (tier.shortfall > 0) warnings.push('库存仅够 ' + tier.units + ' ' + unit + '，缺 ' + tier.shortfall + ' ' + unit + '，档位数量未凑齐');
  if (budgetCents && tier.budgetGap > 0) warnings.push('超预算 ' + wanYuan(tier.budgetGap) + '，需压缩数量或更换低价资源');
  return '<article class="package-card' + (active ? ' active' : '') + '">'
    + '<h4>' + escape(tier.label) + (demo ? ' <span class="package-meta">测算价</span>' : '') + '</h4>'
    + '<dl>'
    + '<dt>目标数量</dt><dd>' + tier.target + ' ' + unit + '</dd>'
    + '<dt>实际可凑数量</dt><dd>' + actual + '</dd>'
    + '<dt>估算媒介费</dt><dd>' + wanYuan(tier.mediaAmount) + '</dd>'
    + '<dt>制作费</dt><dd>' + wanYuan(tier.productionAmount) + '</dd>'
    + '<dt>合计</dt><dd>' + wanYuan(tier.amount) + '</dd>'
    + '<dt>折合' + tier.avgLabel + '价</dt><dd>' + (tier.units ? yuan(tier.avgUnit) : '—') + '</dd>'
    + '<dt>与预算对比</dt><dd>' + compare + '</dd>'
    + '</dl>'
    + warnings.map((warning) => '<p class="package-warn">' + escape(warning) + '</p>').join('')
    + '</article>';
}

/**
 * Purchase-package tier cards (bus 100/150/200 辆, metro 10/20/30 口).
 *
 * @param {object} state workbench state (uses brief.budget and demoMode)
 * @param {{lines?: Array<object>}} plan result of calculatePlan
 * @param {(value: unknown) => string} esc HTML escape helper
 * @returns {string}
 */
export function packagePlansMarkup(state, plan, esc) {
  const escape = typeof esc === 'function' ? esc : DEFAULT_ESCAPE;
  const brief = state?.brief || {};
  const demo = state?.demoMode === true;
  const {tiers, notes} = packagePlanTiers(plan, brief);
  const budgetCents = Number.isFinite(Number(brief.budget)) ? Math.round(Number(brief.budget) * 100) : 0;
  let activeId = '';
  if (budgetCents) {
    let best = null;
    for (const tier of tiers) {
      if (tier.units <= 0) continue;
      const gap = Math.abs(Math.round(tier.amount * 100) - budgetCents);
      if (!best || gap < best.gap) best = {id: tier.id, gap};
    }
    activeId = best ? best.id : '';
  }
  const budgetLine = budgetCents ? '预算 ' + wanYuan(budgetCents / 100) : '预算未填写';
  const meta = '<p class="package-meta">' + escape(budgetLine)
    + ' · 合计仅含媒介费与制作费（含已确认税费口径），不含执行费与监测费'
    + (demo ? ' · <strong>测算价 · 刊例测算假设，非成交价</strong>' : '')
    + '</p>';
  const noteList = notes.map((note) => '<p class="package-meta">' + escape(note) + '</p>').join('');
  const cards = tiers.map((tier) => packageCardMarkup(tier, {active: tier.id === activeId, budgetCents, demo, escape})).join('');
  return '<section class="package-plans" aria-label="采购方案档位">'
    + '<h3>采购方案档位</h3>'
    + '<p>按当前已选资源单价与可售量顺序测算，不是已锁定资源或最终报价。</p>'
    + meta + noteList + cards
    + '</section>';
}