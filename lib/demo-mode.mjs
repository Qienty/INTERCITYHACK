// Demo estimate mode: fills only the quote conditions that are still missing, using
// assumptions derived from the published rate ranges. It never rewrites verified values
// and never touches the inventory records themselves - callers receive a derived copy.
//
// Every value produced here is an explicit assumption, not a confirmed enterprise price.
// Exports and the UI must label it as 刊例测算 (rate-based estimate), never as a final quote.
import {validDate} from './engine.mjs';
import {campaignRanges} from './campaign.mjs';

export const DEMO_LABEL = '刊例测算';
export const DEMO_SOURCE = '测算假设：刊例区间与接口等级推算，非成交价';
// The snapshot only proves the 2027 Q1 window; the demo deliberately widens availability so
// any 2027 schedule can be demonstrated. The note below travels with every assumption.
export const DEMO_WINDOW = {start: '2027-01-01', end: '2027-12-31'};
export const DEMO_METRO_PRODUCTION = 20000;
export const PRICE_BASES = [
  {id: 'low', label: '区间下限'},
  {id: 'mid', label: '区间中位'},
  {id: 'high', label: '区间上限'},
];

function basisValue(low, high, basis) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (basis === 'low') return low;
  if (basis === 'high') return high;
  return (low + high) / 2;
}

function rateNamed(rates, media, name) {
  return rates.find((rate) => rate && rate.media === media && rate.name === name && Number.isFinite(rate.priceLow));
}

// Bus grades come from the source table; metro grades come from the Hongdou interface
// (L1/L2/L3). The demo maps the interface ranks onto the published A++/A+ ranges.
export function demoPriceFor(media, grade, rates, basis = 'mid') {
  const bus = {S: 'S', 'A++': 'A++', 'A+': 'A+'};
  const key = String(grade ?? '').trim();
  if (media === 'bus') {
    const rate = rateNamed(rates, 'bus', bus[key] || 'A+');
    return rate ? basisValue(rate.priceLow, rate.priceHigh, basis) : 40000;
  }
  if (media === 'metro') {
    const high = rateNamed(rates, 'metro', 'A++');
    const lowRate = rateNamed(rates, 'metro', 'A+');
    if (!high || !lowRate) return 200000;
    if (key === 'L1' || key === 'A++') return basisValue(high.priceLow, high.priceHigh, basis);
    if (key === 'L2' || key === 'A+') return basisValue(lowRate.priceLow, lowRate.priceHigh, basis);
    if (key === 'L3') return basis === 'high' ? basisValue(lowRate.priceLow, lowRate.priceHigh, 'mid') : lowRate.priceLow;
    return basisValue(lowRate.priceLow, lowRate.priceHigh, basis);
  }
  return null;
}

export function demoProductionFor(media, grade, rates, {basis = 'mid', metroProduction = DEMO_METRO_PRODUCTION} = {}) {
  if (media === 'metro') return metroProduction;
  const key = String(grade ?? '').trim();
  const name = {S: 'S', 'A++': 'A++', 'A+': 'A+'}[key] || 'A+';
  const rate = rateNamed(rates, 'bus', name);
  const value = rate ? basisValue(rate.productionLow, rate.productionHigh, basis) : null;
  return Number.isFinite(value) ? value : 7500;
}

function covers(row, ranges) {
  if (!ranges.length) return false;
  if (!validDate(row.availableStart) || !validDate(row.availableEnd) || row.availableStart > row.availableEnd) return false;
  return ranges.every((range) => validDate(range.start) && validDate(range.end) && row.availableStart <= range.start && row.availableEnd >= range.end);
}

export function demoBasisLabel(basis = 'mid') {
  return (PRICE_BASES.find((item) => item.id === basis) || PRICE_BASES[1]).label;
}

/**
 * Derived inventory with demo assumptions for missing conditions only.
 * Verified prices, dates, fees or tax flags on a record are always preserved.
 */
export function demoInventory(records, rates, brief, {basis = 'mid', metroProduction = DEMO_METRO_PRODUCTION} = {}) {
  const ranges = campaignRanges(brief || {});
  const changes = {priced: 0, dated: 0, production: 0, billing: 0};
  const derived = (records || []).map((row) => {
    const next = {...row};
    const assumed = [];
    const needsDates = !covers(row, ranges);
    if (needsDates) {
      // Only broaden an existing window; never narrow one that already covers the schedule.
      next.availableStart = validDate(row.availableStart) ? row.availableStart : DEMO_WINDOW.start;
      next.availableEnd = validDate(row.availableEnd) ? row.availableEnd : DEMO_WINDOW.end;
      if (next.availableStart > next.availableEnd) { next.availableStart = DEMO_WINDOW.start; next.availableEnd = DEMO_WINDOW.end; }
      if (!covers(next, ranges)) { next.availableStart = DEMO_WINDOW.start; next.availableEnd = DEMO_WINDOW.end; }
      changes.dated++;
      assumed.push('可售期');
    }
    const needsPrice = !Number.isFinite(row.unitPrice) || row.unitPrice <= 0;
    if (needsPrice) {
      const price = demoPriceFor(row.media, row.grade, rates, basis);
      if (Number.isFinite(price) && price > 0) {
        next.unitPrice = price;
        next.priceIncludesTax = true;
        next.priceSource = DEMO_SOURCE + '（' + demoBasisLabel(basis) + '）';
        next.periodDays = null;
        next.billingUnit = 'calendarMonth';
        next.billingSource = '测算假设：刊例「1 月」按自然月计费，跨月计 1 个月';
        next.quoteReconfirmationRequired = false;
        next.inventoryReconfirmationRequired = false;
        changes.priced++;
        assumed.push('价格');
      }
    }
    const needsProduction = !Number.isFinite(next.production) || next.production < 0;
    if (needsProduction) {
      next.production = demoProductionFor(row.media, row.grade, rates, {basis, metroProduction});
      changes.production++;
      assumed.push('制作费');
    }
    if (needsPrice && (!next.billingUnit)) {
      next.billingUnit = 'calendarMonth';
      next.billingSource = '测算假设：刊例「1 月」按自然月计费，跨月计 1 个月';
      changes.billing++;
    }
    if (assumed.length) next.demoAssumed = assumed;
    return next;
  });
  return {
    records: derived,
    changes,
    assumptions: [
      '价格：' + demoBasisLabel(basis) + '，按原表等级匹配已公开的刊例区间；地铁接口 L1/L2/L3 依次对应 A++/A+/A+ 区间。',
      '计费：刊例给的是「1 月」，测算按自然月计费，跨月计 1 个月；没有换算成 28 天单价。',
      '可售期：测算按 2027 全年（原始快照只证明 Q1 窗口），不当作合同锁档。',
      '制作费：公交取原表制作费区间；地铁原表按 100 元/㎡ 计，无法换算，测算按 ' + demoProductionText(metroProduction) + ' 假设。',
      '含税：测算价按含税口径处理，未叠加税率；正式报价必须重新核税。',
      '必投渠道：测算载入时每个所选渠道至少投放 1 个资源（写入组合约束，可在空间与规则里取消）。',
      '只补充缺失条件：已人工核实的价格、档期、制作费和税口径保持原值。',
    ],
  };
}

function demoProductionText(value) {
  return '¥' + Number(value || 0).toLocaleString('zh-CN') + '/口';
}

/** Counts used by the empty state so users can see why no combination exists yet. */
export function demoCoverage(records, rates, basis = 'mid') {
  let priced = 0, dated = 0, producible = 0;
  for (const row of records || []) {
    if (Number.isFinite(row.unitPrice) && row.unitPrice > 0) priced++;
    if (validDate(row.availableStart) && validDate(row.availableEnd)) dated++;
    if (Number.isFinite(row.production)) producible++;
  }
  return {total: (records || []).length, priced, dated, producible, basis};
}