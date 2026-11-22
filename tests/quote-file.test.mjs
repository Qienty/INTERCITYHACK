import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmountRange, parseQuoteRows, DEFAULT_QUOTE_FILE} from '../lib/quote-file.mjs';

const HEADER = ['媒体类型', '发布线路/位置/级别/形式', '刊例价（区间化口径）', '媒体数量', '发布期', '制作费单价（区间化口径）'];
const rows = [
  ['媒体刊例'],
  [],
  HEADER,
  ['公交车', 'S', '约5–7万', 1, '1月', '约5–10千'],
  ['地铁出入口', 'A++', '约25–35万', 1, '1月', '100元/㎡（以实际点位面积计算）'],
  ['LED', '人民广场来福士', '约30–45万', 1, '1周（15秒/60次/日）', '/'],
];

test('price ranges parse Chinese 万/千 units and single values', () => {
  assert.deepEqual(parseAmountRange('约5–7万'), {low: 50000, high: 70000, unit: '万'});
  assert.deepEqual(parseAmountRange('约5–10千'), {low: 5000, high: 10000, unit: '千'});
  assert.deepEqual(parseAmountRange('约30万'), {low: 300000, high: 300000, unit: '万'});
  assert.equal(parseAmountRange('/').low, null);
  assert.equal(parseAmountRange('100元/㎡').low, 100);
});

test('07-style workbook with title rows parses grades, media and production ranges', () => {
  const file = parseQuoteRows(rows, DEFAULT_QUOTE_FILE);
  assert.equal(file.name, DEFAULT_QUOTE_FILE);
  assert.equal(file.rates.length, 3);
  const bus = file.rates[0];
  assert.equal(bus.media, 'bus');
  assert.equal(bus.name, 'S');
  assert.equal(bus.priceLow, 50000);
  assert.equal(bus.priceHigh, 70000);
  assert.equal(bus.periodText, '1月');
  assert.equal(bus.productionLow, 5000);
  assert.equal(bus.productionHigh, 10000);
  const metro = file.rates[1];
  assert.equal(metro.media, 'metro');
  assert.equal(metro.name, 'A++');
  assert.equal(metro.priceLow, 250000);
  assert.equal(file.rates[2].media, null, 'non bus/metro rows stay unsupported but readable');
});

test('files without a price column or with no prices are rejected clearly', () => {
  assert.throws(() => parseQuoteRows([['媒体类型', '线路'], ['公交车', 'S']], 'x.xlsx'), /缺少“刊例价”列/);
  assert.throws(() => parseQuoteRows([HEADER, ['公交车', 'S', '', 1, '1月', '']], 'x.xlsx'), /没有可识别的区间价格行/);
});