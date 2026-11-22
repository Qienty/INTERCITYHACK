// The media mix bar: one always-visible place for the current combination, its channel
// ratio target, per-resource quantities, the quote composition and the constraint audit.
// Rendering is pure (state + plan -> markup); interactions are wired in app.js.
import {CHANNELS} from './campaign.mjs';
import {quoteConditionIssues} from './engine.mjs';
import {realRates} from '../data/real-data.mjs';

let expanded = true;
let showAll = false;
const ROW_LIMIT = 10;

export function setMixExpanded(value) { expanded = !!value; }
export function isMixExpanded() { return expanded; }
export function setMixShowAll(value) { showAll = !!value; }
export function isMixShowAll() { return showAll; }

const money = (value) => Number(value || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const wan = (value) => (Number(value || 0) / 10000).toFixed(2);
const pct = (part, total) => total ? Math.round(part / total * 1000) / 10 : 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const INVOICE_LABELS = {special: '增值税专票', general: '增值税普票', none: '不开票'};
function invoiceLabel(invoice) {
  if (!invoice || !invoice.type) return '未设置';
  return (INVOICE_LABELS[invoice.type] || '未设置') + (invoice.type !== 'none' && invoice.taxRate ? ' · 税率 ' + invoice.taxRate + '%' : '');
}

function channelStats(state, plan) {
  const media = (state.brief.media || []).filter((id) => CHANNELS.some((c) => c.id === id));
  const lines = plan.lines || [];
  const records = state.records || [];
  return media.map((id) => {
    const channel = CHANNELS.find((c) => c.id === id);
    const own = lines.filter((line) => line.media === id);
    const inventory = records.filter((row) => row.media === id);
    // The gap count is only needed while no combination exists; skip it once a plan is built.
    const missing = lines.length ? 0 : inventory.filter((row) => quoteConditionIssues(row, plan.segments || []).length).length;
    return {
      id,
      label: channel.label,
      lines: own.length,
      units: own.reduce((sum, line) => sum + line.quantity, 0),
      mediaAmount: own.reduce((sum, line) => sum + (line.mediaAmount || 0), 0),
      amount: own.reduce((sum, line) => sum + (line.amount || 0), 0),
      inventory: inventory.length,
      missing,
    };
  });
}

function modeTag(mode) {
  return mode === 'required' ? '必投' : mode === 'fixed' ? '锁定' : '自动';
}

function statusTag(line, mode) {
  if (mode !== 'auto') return '<span class="tag warm">' + modeTag(mode) + '</span>';
  return '<span class="tag gray">自动</span>';
}

function stepper(line, current, max) {
  const id = String(line.id);
  return '<div class="qty-stepper" role="group" aria-label="' + String(line.name).replace(/[&<>"']/g, '') + ' 配量">'
    + '<button type="button" class="qty-btn" data-mix-step="-1" data-mix-id="' + id + '" data-mix-qty="' + current + '" aria-label="减少配量"' + (current <= 0 ? ' disabled' : '') + '>−</button>'
    + '<output class="qty-value" aria-live="polite">' + current + '</output>'
    + '<button type="button" class="qty-btn" data-mix-step="1" data-mix-id="' + id + '" data-mix-qty="' + current + '" aria-label="增加配量"' + (current >= max ? ' disabled' : '') + '>+</button>'
    + '</div>';
}

function ratioMarkup(state, plan, esc, {compact = false} = {}) {
  const media = state.brief.media || [];
  if (!media.includes('bus') || !media.includes('metro')) return '';
  const c = state.brief.constraints || {};
  const hasTarget = c.busShare !== null && c.busShare !== undefined && c.busShare !== '';
  const target = hasTarget ? Number(c.busShare) : null;
  const tolerance = Number(c.shareTolerance) || 0;
  const busUnits = (plan.lines || []).filter((line) => line.media === 'bus').reduce((sum, line) => sum + line.quantity, 0);
  const totalUnits = plan.units || 0;
  const actual = pct(busUnits, totalUnits);
  const slider = target === null ? clamp(Math.round(actual) || 50, 0, 100) : clamp(target, 0, 100);
  const deviation = target === null ? null : Math.abs(actual - target);
  const state_ = target === null ? '仅参考' : deviation <= tolerance ? '达成目标' : c.shareHard ? '硬约束未达成' : '偏差 ' + deviation.toFixed(1) + ' pp';
  const readout = target === null ? '未设目标' : '公交 ' + slider + '% · 地铁 ' + (100 - slider) + '%';
  if (compact) {
    return '<div class="field mix-ratio-field"><div class="field-label">双媒体配比 <small>数量口径 · 可留空</small></div>'
      + '<div class="mix-ratio-line"><input class="mix-ratio-range" type="range" min="0" max="100" step="5" value="' + slider + '" data-mix-ratio aria-label="公交目标数量占比">'
      + '<span class="mix-ratio-readout" data-mix-readout>' + esc(target === null ? '未设目标 · 当前实际 ' + actual + '%' : readout) + '</span></div>'
      + '<p class="field-hint">' + (target === null ? '拖动滑块即设为目标配比；当前实际 ' + actual + '%（仅参考）。' : '目标 ' + target + '% · 当前实际 ' + actual + '%' + (plan.units ? '' : '（尚未形成组合）') + '。') + '</p></div>';
  }
  return '<section class="mix-ratio" aria-label="双媒体配比">'
    + '<div class="mix-ratio-head"><strong>双媒体配比</strong><span class="mix-ratio-readout" data-mix-readout>' + esc(readout) + '</span>'
    + '<span class="mix-ratio-state ' + (deviation === null ? 'idle' : deviation <= tolerance ? 'pass' : c.shareHard ? 'block' : 'deviation') + '">实际 ' + actual + '% · ' + state_ + '</span></div>'
    + '<div class="mix-ratio-track" role="img" aria-label="公交占已选资源数量 ' + actual + '%">'
    + '<span class="mix-ratio-bus" style="width:' + actual + '%"></span><span class="mix-ratio-metro"></span>'
    + (target === null ? '' : '<i class="mix-ratio-marker" style="left:' + target + '%" title="目标 ' + target + '%"></i>')
    + '</div>'
    + '<p class="mix-ratio-note">配比目标与容差只在左侧“客户需求 → 媒体配比”修改，这里只读显示实际占比与达成情况；按资源<b>数量</b>口径，不是媒介费占比。' + (state.demoMode ? '刊例测算同样遵守该目标。' : '') + '</p>'
    + '</section>';
}

function channelMarkup(state, plan, esc, channel) {
  const lines = (plan.lines || []).filter((line) => line.media === channel.id);
  if (!lines.length) return '';
  const selection = state.brief.selection || {};
  const visible = showAll ? lines : lines.slice(0, ROW_LIMIT);
  const totalMedia = plan.media || 0;
  const rows = visible.map((line) => {
    const rule = selection[line.id] || {mode: 'auto'};
    const billing = line.billingLabel ? '<small>' + esc(line.billingLabel) + ' · ' + line.billingPeriods + ' 期</small>' : '';
    return '<tr class="' + (rule.mode !== 'auto' ? 'is-manual' : '') + '">'
      + '<td><strong>' + esc(line.name) + '</strong><small>' + esc([line.grade, line.format].filter(Boolean).join(' · ')) + '</small></td>'
      + '<td class="num">' + (line.available ?? '—') + '</td>'
      + '<td class="qty-cell">' + stepper(line, line.quantity, line.available ?? line.quantity) + '</td>'
      + '<td class="num">¥' + money(line.unitPrice) + billing + '</td>'
      + '<td class="num">¥' + money(line.amount) + '</td>'
      + '<td>' + statusTag(line, rule.mode) + '</td></tr>';
  }).join('');
  return '<article class="mix-channel" aria-label="' + esc(channel.label) + '组合">'
    + '<header class="mix-channel-head"><span class="mix-channel-badge ' + channel.id + '" aria-hidden="true"></span>'
    + '<strong>' + esc(channel.label) + '</strong>'
    + '<span>' + channel.lines + ' 条 · ' + channel.units + (channel.id === 'bus' ? ' 台' : ' 口') + '</span>'
    + '<span class="mix-channel-amount">媒介费 ¥' + wan(channel.mediaAmount) + ' 万</span>'
    + '<span class="mix-channel-share">占媒体费 ' + pct(channel.mediaAmount, totalMedia) + '%</span>'
    + '<button class="btn small subtle" type="button" data-mix-goto="selection">逐项调整</button></header>'
    + '<div class="table-scroll mix-table-scroll"><table class="data-table mix-table"><thead><tr>'
    + '<th>线路 / 点位</th><th class="num">可售</th><th>配量</th><th class="num">单价</th><th class="num">金额</th><th>来源</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    + (!showAll && lines.length > ROW_LIMIT ? '<button class="btn small subtle mix-more" type="button" data-mix-show-all>展开其余 ' + (lines.length - ROW_LIMIT) + ' 条</button>' : '')
    + '</article>';
}

function quoteMarkup(state, plan, esc) {
  const budget = state.brief.budget;
  const fees = plan.fees?.details || {};
  const feeLabel = (key) => {
    const item = fees[key];
    if (!item || item.status === 'unknown') return '<span class="mix-pending">待确认</span>';
    if (item.status === 'included') return '已含<span class="mix-fee-source">' + esc(item.source || '') + '</span>';
    return '¥' + money(item.amount) + '<span class="mix-fee-source">单列 · ' + esc(item.source || '') + '</span>';
  };
  const rows = [
    ['媒介费', '¥' + money(plan.media), '按各资源计价口径'],
    ['制作费', '¥' + money(plan.production), '每资源一次'],
    ['客户折扣', (Number(state.brief.discount) * 10).toFixed(1) + ' 折', '仅作用于媒介费'],
    ['结算发票', invoiceLabel(state.brief.invoice), plan.tax ? '其中税额约 ¥' + money(plan.tax.amount) + '（按条款税率拆分，信息项）' : '未设置税率，不重复加税'],
    ['执行费', feeLabel('execution'), ''],
    ['监测费', feeLabel('monitoring'), ''],
  ].map(([label, value, note]) => '<div class="mix-quote-row"><dt>' + label + '</dt><dd>' + value + (note ? '<small>' + note + '</small>' : '') + '</dd></div>').join('');
  return '<section class="mix-quote" aria-label="报价构成"><div class="mix-quote-head"><h3>报价构成</h3>'
    + '<span class="tag gray">' + (plan.fees?.pending?.length ? plan.fees.pending.length + ' 项费用待确认' : '费用口径已列') + '</span></div>'
    + '<dl class="mix-quote-list">' + rows
    + '<div class="mix-quote-row total"><dt>含税合计</dt><dd>¥' + money(plan.total) + '</dd></div>'
    + '<div class="mix-quote-row"><dt>预算</dt><dd>¥' + money(budget) + '</dd></div>'
    + '<div class="mix-quote-row"><dt>预算占用</dt><dd>' + (budget ? pct(plan.total, budget) + '%' : '—') + '</dd></div>'
    + '<div class="mix-quote-row"><dt>预算余量</dt><dd>¥' + money(plan.remaining) + '</dd></div>'
    + '</dl></section>';
}

function checksMarkup(state, plan, esc) {
  const checks = plan.constraintAudit?.checks || [];
  if (!checks.length) return '';
  const icon = {pass: '✓', deviation: '!', block: '×', pending: '·'};
  return '<section class="mix-checks" aria-label="组合约束校验"><div class="mix-checks-head"><h3>约束校验</h3>'
    + '<button class="btn small subtle" type="button" data-mix-goto="rules">设置约束</button></div>'
    + '<div class="mix-check-list">' + checks.map((check) => '<span class="mix-check ' + check.status + '" title="' + esc(check.detail) + '">' + icon[check.status] + ' ' + esc(check.label) + '</span>').join('') + '</div>'
    + (checks.some((check) => check.status !== 'pass') ? '<p class="mix-check-note">' + esc(checks.filter((check) => check.status !== 'pass').slice(0, 2).map((check) => check.label + '：' + check.detail).join('；')) + '</p>' : '')
    + '</section>';
}

function unresolvedMarkup(state, plan, esc) {
  const list = (plan.unresolved || []).filter((item) => item && item.reason);
  if (!list.length) return '';
  return '<section class="mix-unresolved" aria-label="指定但当前不可满足"><h3>指定但当前不可满足</h3><ul>'
    + list.slice(0, 6).map((item) => '<li><code>' + esc(item.id) + '</code><span>' + esc(item.reason) + '</span>'
      + (String(item.id).startsWith('budget') || String(item.id).includes('share') || item.id === 'allocation' ? '' : '<button class="btn small subtle" type="button" data-mix-release="' + esc(item.id) + '">解除指定</button>')
      + '</li>').join('')
    + '</ul><p>指定意向保留，但不会硬塞进有效报价；解除后可回到自动推荐。</p></section>';
}

function gapStats(state, plan) {
  const media = state.brief.media || [], ranges = plan.segments || [];
  const rows = (state.records || []).filter((row) => media.includes(row.media));
  const stats = {price: 0, dates: 0, fee: 0, tax: 0, billing: 0, stock: 0};
  for (const row of rows) {
    for (const issue of quoteConditionIssues(row, ranges)) {
      if (/无可售库存/.test(issue)) stats.stock++;
      else if (/刊例价/.test(issue)) stats.price++;
      else if (/可售起止|档期未完整/.test(issue)) stats.dates++;
      else if (/制作费/.test(issue)) stats.fee++;
      else if (/计价周期/.test(issue)) stats.billing++;
      else if (/税费/.test(issue)) stats.tax++;
    }
  }
  return stats;
}

function emptyMarkup(state, plan, esc, channels) {
  const errors = (plan.errors || []).slice(0, 4);
  const stats = gapStats(state, plan);
  const rows = channels.map((channel) => '<div class="mix-empty-channel"><span class="mix-channel-badge ' + channel.id + '" aria-hidden="true"></span>'
    + '<strong>' + esc(channel.label) + '</strong><span>' + channel.inventory + ' 条库存</span>'
    + '<span class="' + (channel.inventory - channel.missing > 0 ? 'ok' : '') + '">' + (channel.missing ? channel.missing + ' 条待补核价条件' : '全部已有核价条件') + '</span></div>').join('');
  const title = stats.price ? '报价条件待确认' : errors.length ? '投放需求待完善' : '当前条件下没有可报价资源';
  return '<div class="mix-empty">'
    + '<div class="mix-empty-copy"><strong>' + title + '</strong>'
    + '<p>只有区间刊例，精确成交价与可售条件仍待核实。当前报价文件：' + esc((state.quoteFile?.name) || '07-媒体刊例价.xlsx') + ' · ' + ((state.quoteFile?.rates?.length) || realRates.length) + ' 条参考。</p>'
    + '<div class="mix-empty-gaps">' + [
      ['缺精确价', stats.price], ['缺可售期', stats.dates], ['缺制作费', stats.fee], ['缺税口径', stats.tax], ['缺计价周期', stats.billing], ['库存不足', stats.stock],
    ].filter(([, count]) => count > 0).map(([label, count]) => '<span><b>' + count + '</b><small>' + label + ' · 条</small></span>').join('') + '</div>'
    + '<details class="mix-price-note"><summary>报价口径与来源</summary><p class="mix-empty-formal">来源：07-媒体刊例价.xlsx。正式报价须核实精确价、可售期、税费及制作费。区间刊例测算标注“非成交价”。</p></details>'
    + '<div class="mix-empty-channels">' + rows + '</div>'
    + (errors.length ? '<ul class="mix-empty-errors">' + errors.map((error) => '<li>' + esc(error) + '</li>').join('') + '</ul>' : '')
    + '</div><div class="mix-empty-actions">'
    + (state.demoMode
      ? '<button class="btn" type="button" data-demo-mode="off">退出刊例测算</button>'
      : '<button class="btn dark" type="button" data-demo-quick>生成刊例测算稿</button><button class="btn" type="button" data-demo-mode="on">调整测算假设</button>')
    + '<button class="btn" type="button" data-page="resources">核实报价条件</button>'
    + '<button class="btn subtle" type="button" data-mix-gap>逐资源缺口</button>'
    + '</div></div>';
}

export function mixPanelView(state, plan, esc) {
  const channels = channelStats(state, plan);
  const lines = plan.lines || [];
  const summary = lines.length
    ? channels.filter((channel) => channel.lines).map((channel) => channel.label + ' ' + channel.lines + ' 条 · ' + channel.units + (channel.id === 'bus' ? ' 台' : ' 口')).join(' · ')
      + ' · 合计 ¥' + wan(plan.total) + ' 万 · 余量 ¥' + wan(plan.remaining) + ' 万'
    : '当前渠道 ' + (channels.reduce((sum, channel) => sum + channel.inventory, 0)).toLocaleString('zh-CN') + ' 条库存 · 尚未形成可报价组合';
  const targetCheck = plan.constraintAudit?.checks?.find((check) => check.label === '公交数量占比');
  const head = '<header class="mix-panel-head"><div class="mix-panel-title">'
    + '<h2>媒体组合栏</h2>'
    + (state.demoMode ? '<span class="tag warm">刊例测算 · 非成交价</span>' : '<span class="tag gray">按已核实条件</span>')
    + (plan.manualChanges?.length ? '<span class="tag gray">已人工调整 ' + plan.manualChanges.length + ' 项</span>' : '')
    + '<p>' + esc(summary) + '</p></div>'
    + '<div class="mix-panel-actions">'
    + (lines.length ? '<button class="btn small subtle" type="button" data-mix-gap>报价缺口</button><button class="btn small dark" type="button" data-page="proposal">查看提案</button>' : '')
    + '<button class="btn small" type="button" data-mix-expand aria-expanded="' + expanded + '">' + (expanded ? '收起明细' : '展开明细') + '</button>'
    + '</div></header>';
  if (!expanded) return '<section class="mix-panel' + (state.demoMode ? ' demo' : '') + '" aria-label="媒体组合栏">' + head + '</section>';

  if (!lines.length) return '<section class="mix-panel' + (state.demoMode ? ' demo' : '') + '" aria-label="媒体组合栏">' + head
    + '<div class="mix-panel-body">' + emptyMarkup(state, plan, esc, channels) + '</div></section>';

  const kpis = [
    ['含税组合金额', '¥' + wan(plan.total), '万元'],
    ['预算余量', '¥' + wan(plan.remaining), '万元'],
    ['资源数量', String(plan.units), '条 ' + lines.length + ' 项资源'],
    ['公交数量占比', (targetCheck ? (targetCheck.detail.match(/实际 ([\d.]+)%/) || [])[1] : null) || pct((plan.mediaCounts?.bus || 0), plan.units) + '%', targetCheck ? ({pass: '达成目标', deviation: '目标偏差', block: '未达成硬约束', pending: '未设目标'})[targetCheck.status] : '未设目标'],
  ].map(([label, value, note]) => '<div class="mix-kpi"><small>' + label + '</small><strong>' + esc(value) + '</strong><span>' + esc(note) + '</span></div>').join('');

  const body = '<div class="mix-panel-body">'
    + '<div class="mix-kpis">' + kpis + '</div>'
    + ratioMarkup(state, plan, esc)
    + '<div class="mix-channels">' + channels.map((channel) => channelMarkup(state, plan, esc, channel)).join('') + '</div>'
    + '<div class="mix-panel-grid">' + quoteMarkup(state, plan, esc) + checksMarkup(state, plan, esc) + '</div>'
    + unresolvedMarkup(state, plan, esc)
    + (state.demoMode ? '<details class="mix-assumptions"><summary>刊例测算用了哪些假设</summary><ul>'
      + (plan.demoAssumptions || []).map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>'
      + '<p>退出刊例测算后，原始库存记录、已核实条件和正式报价口径都不受影响。</p></details>' : '')
    + '<p class="mix-panel-note">' + (state.demoMode
      ? '刊例测算：价格、可售期和制作费是测算假设，只能用于看流程与配比；对外报价前必须重新核价核档。'
      : '数量调整按稳定编号保存，不会修改原表空位；预算变化只调整其余自动项。') + (state.brief.spatial?.radius?.enabled ? ' 必须经过地址：' + esc([state.brief.spatial.radius.name, state.brief.spatial.radius.coordinateSystem, state.brief.spatial.radius.meters + ' m'].filter(Boolean).join(' · ')) + '（按已核实参考点）。' : '') + '</p>'
    + '</div>';
  return '<section class="mix-panel' + (state.demoMode ? ' demo' : '') + '" aria-label="媒体组合栏">' + head + body + '</section>';
}

/** Compact target-ratio field for the brief form (shown only when both channels are selected). */
export function mixRatioField(state, plan, esc) {
  return ratioMarkup(state, plan, esc, {compact: true});
}
