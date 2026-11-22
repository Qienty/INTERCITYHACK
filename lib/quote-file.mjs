// 报价文件：默认使用 07-媒体刊例价.xlsx 的区间价。用户可替换为新的报价文件，
// 解析结果只作为报价口径来源，不写入库存记录。
export const DEFAULT_QUOTE_FILE = '07-媒体刊例价.xlsx';

const HEADER_ALIASES = {
  mediaType: ['媒体类型', '媒体大类', '类型'],
  position: ['发布线路/位置/级别/形式', '线路/位置/级别/形式', '线路/位置/级别', '线路/点位', '媒体名称', '位置', '线路'],
  price: ['刊例价（区间化口径）', '刊例价', '价格', '报价'],
  quantity: ['媒体数量', '数量'],
  period: ['发布期', '发布周期', '周期'],
  production: ['制作费单价（区间化口径）', '制作费单价', '制作费'],
  tax: ['含税', '是否含税'],
  grade: ['等级', '级别', '线路级别', '线路等级'],
};

function findHeader(headers, keys) {
  for (const key of keys) {
    const index = headers.findIndex((header) => String(header ?? '').replace(/\s/g, '') === key.replace(/\s/g, ''));
    if (index >= 0) return index;
  }
  for (const key of keys) {
    const index = headers.findIndex((header) => String(header ?? '').includes(key));
    if (index >= 0) return index;
  }
  return -1;
}

export function parseAmountRange(text) {
  const raw = String(text ?? '').replace(/[,，\s]/g, '');
  if (!raw || raw === '/' || raw === '—' || raw === '-') return {low: null, high: null, unit: ''};
  const match = raw.match(/([\d.]+)\s*(?:[–\-~至到]\s*([\d.]+))?\s*(万|千|元)/);
  if (!match) return {low: null, high: null, unit: ''};
  const factor = match[3] === '万' ? 10000 : match[3] === '千' ? 1000 : 1;
  const low = Number(match[1]) * factor;
  const high = match[2] ? Number(match[2]) * factor : low;
  return Number.isFinite(low) && Number.isFinite(high) ? {low, high, unit: match[3]} : {low: null, high: null, unit: ''};
}

function mediaFrom(text) {
  const value = String(text ?? '');
  if (/公交|巴士|bus/i.test(value)) return 'bus';
  if (/地铁|metro/i.test(value)) return 'metro';
  return null;
}

/** Parse a quote workbook's first sheet into the rate shape used by the app. */
export function parseQuoteRows(rows, fileName = DEFAULT_QUOTE_FILE) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('报价文件没有可读取的表格行');
  let headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => /刊例价/.test(String(cell ?? ''))) && row.some((cell) => /媒体类型|发布期|线路|位置/.test(String(cell ?? ''))));
  if (headerIndex < 0) headerIndex = 0;
  const headers = rows[headerIndex].map((header) => String(header ?? ''));
  const columns = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findHeader(headers, aliases)]));
  if (columns.price < 0) throw new Error('报价文件缺少“刊例价”列');
  const rates = [];
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index] || [];
    const priceText = String(row[columns.price] ?? '').trim();
    if (!priceText || priceText === '/') continue;
    const price = parseAmountRange(priceText);
    if (!Number.isFinite(price.low)) continue;
    const mediaText = columns.mediaType >= 0 ? row[columns.mediaType] : '';
    const position = String((columns.position >= 0 ? row[columns.position] : '') || '').trim();
    const grade = String((columns.grade >= 0 ? row[columns.grade] : '') || '').trim();
    const productionText = String((columns.production >= 0 ? row[columns.production] : '') || '').trim();
    const production = parseAmountRange(productionText);
    const periodText = String((columns.period >= 0 ? row[columns.period] : '') || '').trim();
    const explicitMedia = mediaFrom(mediaText);
    const fallbackMedia = mediaFrom(position) || mediaFrom(fileName);
    const media = explicitMedia || fallbackMedia;
    const name = grade || position || (media === 'bus' ? '公交' : media === 'metro' ? '地铁' : '未命名');
    rates.push({
      id: 'quote-' + (rates.length + 1),
      media,
      mediaType: mediaText || name,
      name,
      grade: grade || name,
      priceText,
      priceLow: price.low,
      priceHigh: price.high,
      quantity: columns.quantity >= 0 ? Number(row[columns.quantity]) || 1 : 1,
      periodText: periodText || '未注明',
      periodDays: null,
      productionText,
      productionLow: Number.isFinite(production.low) ? production.low : null,
      productionHigh: Number.isFinite(production.high) ? production.high : null,
      priceIncludesTax: columns.tax >= 0 ? /是|含税/.test(String(row[columns.tax] ?? '')) : null,
      source: fileName,
      sourceRow: index + 1,
      builtin: false,
    });
  }
  if (!rates.length) throw new Error('报价文件没有可识别的区间价格行');
  return {name: fileName, rates, warnings: [], headers};
}

export function defaultQuoteFile(rates) {
  return {name: DEFAULT_QUOTE_FILE, rates, builtin: true, importedAt: ''};
}
