// 结案报告内容组装：结构参照客户提供的《M5-结案报告样本》（项目概况 / 分周期执行 /
// 效果与口径 / 后续建议），只使用本项目真正拥有的数据。没有触达、CPM、转化与播放频次
// 之类未经核实的指标，相关页面明确写"未提供/不推算"。
import {channelName,campaignRanges} from './campaign.mjs';
import {handoffReview} from './operations.mjs';

const money = (value) => Number(value || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const wan = (value) => (Number(value || 0) / 10000).toFixed(2);
const dateOnly = (value) => String(value || '').slice(0, 10);

function segmentRows(state, plan) {
  const nodes = state.monitoring?.nodes || [];
  const tasks = state.execution?.tasks || [];
  return (plan.segments || []).map((segment, index) => {
    const install = tasks.filter((task) => task.segment === index && task.phase === 'install').map((task) => task.date).filter(Boolean).sort();
    const remove = tasks.filter((task) => task.segment === index && task.phase === 'remove').map((task) => task.date).filter(Boolean).sort();
    const posting = nodes.find((node) => node.segment === index && node.type === 'posting');
    const removal = nodes.find((node) => node.segment === index && node.type === 'removal');
    return {
      index,
      start: segment.start,
      end: segment.end,
      days: segment.days,
      units: plan.units,
      install: install.length ? install[0] + (install.length > 1 ? ' 至 ' + install.at(-1) : '') : '待排',
      remove: remove.length ? remove[0] + (remove.length > 1 ? ' 至 ' + remove.at(-1) : '') : '待排',
      posting: posting ? posting.date + ' · ' + posting.status : '未生成',
      removal: removal ? removal.date + ' · ' + removal.status : '未生成',
    };
  });
}

function channelTable(plan) {
  const rows = [];
  for (const media of ['bus', 'metro']) {
    const lines = (plan.lines || []).filter((line) => line.media === media);
    if (!lines.length) continue;
    rows.push([channelName(media), String(lines.length), String(lines.reduce((sum, line) => sum + line.quantity, 0)), '¥' + money(lines.reduce((sum, line) => sum + (line.mediaAmount || 0), 0)), '¥' + money(lines.reduce((sum, line) => sum + (line.productionAmount || 0), 0)), '¥' + money(lines.reduce((sum, line) => sum + (line.amount || 0), 0))]);
  }
  rows.push(['合计', String((plan.lines || []).length), String(plan.units), '¥' + money(plan.media), '¥' + money(plan.production), '¥' + money(plan.total)]);
  return {columns: ['渠道', '资源条数', '数量', '媒介费', '制作费', '含税合计'], rows};
}

function monitoringRows(state) {
  const nodes = state.monitoring?.nodes || [];
  return nodes.slice(0, 12).map((node) => [node.title, node.date || '待定', node.status || '待执行', String((node.evidence || []).length), node.acceptance || '未填写']);
}

function suggestions(state, plan, review) {
  const list = [];
  if ((plan.remaining || 0) > 0) list.push('预算余量 ¥' + wan(plan.remaining) + ' 万，可用于补量、延长档期或增加区域，追加前须重新核库核价。');
  const share = (plan.constraintAudit?.checks || []).find((check) => check.label === '公交数量占比');
  if (share) list.push('本期渠道配比：' + share.detail.replace(/；/g, '，') + '；下一期可按目标调整配比或保持现状。');
  const concentration = (plan.constraintAudit?.checks || []).find((check) => check.label === '单资源媒介费集中度');
  if (concentration) list.push('单点集中度：' + concentration.detail.replace(/；/g, '，') + '。');
  const nodes = state.monitoring?.nodes || [];
  const open = nodes.filter((node) => node.status !== '已验收').length;
  if (nodes.length && open) list.push(open + ' 个监测节点尚未验收，结案前需补齐照片、交付物与验收记录。');
  const risks = (state.execution?.risks || []).filter((risk) => risk.status !== '已确认' && risk.status !== '已规避');
  if (risks.length) list.push(risks.length + ' 项上下刊风险仍在处理中：' + risks.slice(0, 3).map((risk) => risk.item || '未命名风险').join('、') + '。');
  if (review.deviations.length) list.push(review.deviations.length + ' 项上刊卡点需在下一期前处理，例如' + review.deviations[0].label + '。');
  if (!list.length) list.push('本期资源、费用与节点均已列齐，可据此整理下一期资源意向；新档期仍须重新核库核价。');
  list.push('本报告不含触达、CPM 与转化数据：没有可核实的去重人流模型时，上述指标不会被推算或承诺。');
  return list;
}

export function closingReportPresentation(state, plan) {
  if (!plan || plan.errors?.length || !plan.lines?.length) throw new Error('尚未形成可报价的媒体组合，无法生成结案报告');
  const brief = state.brief;
  const lines = plan.lines;
  const segments = campaignRanges(brief);
  const nodes = state.monitoring?.nodes || [];
  const tasks = state.execution?.tasks || [];
  const review = handoffReview(plan, brief, state.execution || {}, state.monitoring || {});
  const evidence = nodes.reduce((sum, node) => sum + (node.evidence?.length || 0), 0);
  const accepted = nodes.filter((node) => node.status === '已验收').length;
  const resources = lines.map((line) => line.name + '（' + (line.quantity > 1 ? line.quantity + ' 个 · ' : '') + channelName(line.media) + '）').slice(0, 24).join('、');
  const demo = state.demoMode ? '刊例测算：价格与可售期为测算假设，非真实成交价。' : '价格与档期均按当前项目已确认口径列示。';
  const period = segments.map((range) => range.start + ' 至 ' + range.end).join('；');
  const table = channelTable(plan);
  const slides = [
    {title: '项目概览', blocks: [
      {type: 'bullets', items: [
        '投放主体：' + (brief.brand || '客户品牌待确认') + ' · ' + brief.industry,
        '投放城市与区域：上海 · ' + ([...new Set(lines.map((line) => line.district).filter(Boolean))].join('、') || '按已选资源覆盖'),
        '投放媒体：' + brief.media.map((media) => channelName(media)).join(' + ') + '，共 ' + lines.length + ' 条资源 / ' + plan.units + ' 个点位',
        '投放周期：' + period + '（' + plan.days + ' 天，' + plan.periods + ' 个计费期）',
      ]},
      {type: 'note', text: '报告性质：项目工作稿，不构成资源锁定、效果保证或最终结算依据。客户折扣 ' + (Number(brief.discount) * 10).toFixed(1) + ' 折；结算发票：' + (state.brief.invoice?.type === 'special' ? '增值税专票' : state.brief.invoice?.type === 'general' ? '增值税普票' : state.brief.invoice?.type === 'none' ? '不开票' : '未设置') + (state.brief.invoice?.taxRate && state.brief.invoice?.type !== 'none' ? '（税率 ' + state.brief.invoice.taxRate + '%，按条款税率做价税拆分，不重复加税）' : '') + '。' + demo},
    ]},
    {title: '项目内容概况', blocks: [
      {type: 'text', text: '本次投放以已选资源组合覆盖上海核心出行与商圈动线，资源、数量与费用如下。'},
      {type: 'table', columns: table.columns, rows: table.rows},
      {type: 'note', text: '单价按各资源已确认计价口径；执行费与监测费口径见报价口径页。' + (state.demoMode ? '刊例测算价格不是成交价。' : '')},
    ]},
    {title: '分周期执行情况', blocks: [
      {type: 'table', columns: ['期数', '投放周期', '天数', '资源数量', '上刊完成', '下刊完成', '上刊凭证', '下刊凭证'], rows: segmentRows(state, plan).map((row) => ['第' + (row.index + 1) + '期', row.start + ' 至 ' + row.end, String(row.days), String(row.units), row.install, row.remove, row.posting, row.removal])},
      {type: 'text', text: '施工批次共 ' + tasks.length + ' 条，监测节点共 ' + nodes.length + ' 个，已验收 ' + accepted + ' 个，实际证据文件 ' + evidence + ' 份。'},
      {type: 'note', text: '施工与监测数据来自本项目"施工排期 / 监测交付"视图；未完成的节点如实显示为"待执行"，不预填完成事实。'},
    ]},
    {title: '执行资源清单', blocks: [
      {type: 'text', text: resources + (lines.length > 24 ? ' 等 ' + lines.length + ' 条（完整清单见报价 Excel）。' : '。')},
      {type: 'bullets', items: [
        '行驶类资源以线路为单位计费，地铁以站口为单位计费；同一线路不同媒体形式分别保留。',
        '素材与画面以客户最终定稿为准，本次报告不替代上下刊验收照片。',
        '如发生改档、换车或点位调整，应按监测与验收记录更新本清单。',
      ]},
    ]},
    {title: '监测与验收', blocks: [
      monitoringRows(state).length
        ? {type: 'table', columns: ['节点', '计划日期', '状态', '证据文件数', '验收方式'], rows: monitoringRows(state)}
        : {type: 'text', text: '尚未生成监测节点；请在"监测交付"中补齐巡检、上刊与下刊凭证要求。'},
      {type: 'note', text: '证据附件仅保存在本项目浏览器/方案库中；导出件不含原始照片文件，需另行交付。'},
    ]},
    {title: '效果与口径说明', blocks: [
      {type: 'bullets', items: [
        '本期可核实的数据：投放周期 ' + plan.days + ' 天、' + plan.periods + ' 个计费期、' + plan.units + ' 个资源点位、监测节点 ' + nodes.length + ' 个（已验收 ' + accepted + ' 个）。',
        '没有可靠的人流去重模型，因此不展示触达、CPM、转化率或播放频次；2023 年历史人流报告仅作参考，不推算本期曝光。',
        '施工与上下刊时间以实际执行与客户验收记录为准；天气、管制与审批延误按合同条款处理。',
        demo,
      ]},
      {type: 'note', text: '以上口径由客户提供的《上下刊流程卡点说明》与本项目数据共同约束。'},
    ]},
    {title: '后续投放建议', blocks: [
      {type: 'bullets', items: suggestions(state, plan, review)},
      {type: 'note', text: '建议仅供下一期规划参考，不构成价格或资源承诺。'},
    ]},
    {title: '数据来源与边界', blocks: [
      {type: 'bullets', items: [
        '库存与费用：项目已载入的用户文件与已确认报价条件（' + (state.records?.length || 0) + ' 条库存记录）。',
        '施工与交付：本项目"施工排期 / 监测交付"的人工确认条件与节点。',
        '上下刊卡点：客户提供的《上下刊流程卡点说明》；' + (review.complete ? '当前卡点全部已确认。' : '当前仍有 ' + review.deviations.length + ' 项待处理。'),
        '本报告不包含未经核实的曝光、转化与合同承诺。',
      ]},
      {type: 'note', text: '报告生成：' + new Date().toLocaleString('zh-CN')},
    ]},
  ];
  return {title: (brief.brand || '客户') + ' · ' + INDUSTRY_CAMPAIGN(brief.industry) + ' · 投放结案报告', subtitle: '上海新云传媒股份有限公司 · ' + new Date().toLocaleDateString('zh-CN'), slides};
}

// Local copy to avoid importing the whole industry table just for a label.
function INDUSTRY_CAMPAIGN(industry) {
  const labels = {'食品饮料': '日常饮品投放', '银行保险': '金融品牌投放', '保健品': '健康品牌投放', '私立医院': '医疗服务投放', '乐园（主题公园）': '主题乐园投放'};
  return labels[industry] || '户外媒体投放';
}