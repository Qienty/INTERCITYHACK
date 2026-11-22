import {campaignSheets,campaignPlan} from './campaign-review.mjs';
import {publicProposalState} from './hypothesis.mjs';
import {inventoryMatrix,validateBrief,toCSV} from './engine.mjs';
import {channelName,scheduleSummary} from './campaign.mjs';
import {operationSheets} from './operations.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reviewSheets(state,{rates=[],insights=[],pois=[],coverage=[],manifest={files:[]}}={}){
  const internalPlan=campaignPlan(state);state=publicProposalState(state);
  const b=state.brief,issues=validateBrief(b);
  return [
    {name:'需求与核对状态',rows:[['项目','当前记录'],['文件性质','资料核对稿，不含推荐报价，不构成资源锁定'],['客户需求确认',state.briefDraft?'导入需求尚未整体确认':'当前工作草稿'],['客户品牌',b.brand||'未填写'],['行业',b.industry],['预算（元）',b.budget],['所选渠道',b.media.map(channelName).join('、')||'未选择'],['客户投放日期',scheduleSummary(b)],['输入待完善',issues.join('；')||'输入检查通过，仍需逐资源核实价格与档期'],['报价条件','精确单价、制作费、含税口径、计价天数和可售日期需逐资源确认']]},
    {name:'库存核对清单',rows:inventoryMatrix(state.records)},
    {name:'原始刊例参考',rows:[['媒体形式','线路/位置/等级','区间原文','原表数量','发布期原文','制作费原文','来源','来源单元格'],...rates.map(r=>[r.mediaType,r.name,r.priceText,r.quantity,r.periodText,r.productionText,r.source,r.sourceRef])]},
    {name:'历史报告目录',rows:[['表内线路/点位','月份','累计人次原文','累计人数原文','来源文件','重复来源','来源单元格'],...insights.map(r=>[r.route,r.month,r.visitsDisplay,r.peopleDisplay,r.source,r.duplicateOf?'重复导出，不累计':'数据组首个来源',r.sourceRef])]},
    {name:'来源周边点位',rows:[['名称','类型','地址','经度','纬度','坐标系','来源'],...pois.map(p=>[p.name,p.category,p.address,p.lon,p.lat,p.coordinateSystem||'未注明',p.source])]},
    {name:'来源文件',rows:[['名称','类别','记录数','SHA-256'],...(manifest.files||[]).map(f=>[f.name,f.type,f.count,f.sha256||''])]},
    ...['summary','details'].map((section,i)=>({name:i?'覆盖分析明细':'覆盖分析汇总',rows:[['地标','媒体类型','媒体名称','半径（米）','最近距离（米）','最近站点','站点距离（米）','站点经度','站点纬度','中心经度','中心纬度','最近轨迹点经度','最近轨迹点纬度','关联库存编号','坐标系','来源文件','来源行','覆盖点数','最近命中中心点'],...coverage.flatMap(report=>report[section].map(r=>[r.center,r.mediaType,r.name,r.radius,r.distance,r.station,r.stationDistance,r.stationLon,r.stationLat,r.centerLon??'',r.centerLat??'',r.trackLon??'',r.trackLat??'',r.matchedIds.join('；'),'未注明',report.source,r.sourceRef,r.coverageCount??'',r.hitCenter??'']))]})),
    ...campaignSheets(state,internalPlan),...operationSheets(state,internalPlan)
  ];
}
export function reviewCSV(state){const rows=inventoryMatrix(state.records);return toCSV(rows.map((r,i)=>[...r,i?'资料核对稿，非投放报价':'文件用途']));}
export function reviewHTML(state,sources){
  const sheets=reviewSheets(state,sources);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新云 · 资料核对稿（不含报价）</title><style>body{margin:0;background:#f2f5f2;color:#25372c;font:14px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1200px;margin:auto;padding:32px 20px}h1{font-size:24px}p{color:#58675d}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bcc9be;border-radius:6px;background:white;font:inherit}details{background:#fff;border:1px solid #e1e7df;border-radius:8px;margin:18px 0}summary{padding:16px;cursor:pointer;font-weight:600}.scroll{max-height:440px;overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}td,th{padding:10px 14px;text-align:left;border-top:1px solid #edf0eb}th{font-size:12px;color:#5f6d63;background:white;position:sticky;top:0}td{font-variant-numeric:tabular-nums}footer{font-size:12px;color:#617064;margin-top:24px}@media print{input{display:none}.scroll{max-height:none;overflow:visible}table{white-space:normal}summary{break-after:avoid}}</style></head><body><main><h1>新云传媒 · 资料核对稿</h1><p><strong>本文件不含推荐报价，不构成价格承诺或资源锁定。</strong>用于核对已导入的客户需求、库存与原始参考资料；缺失内容保持未填写。</p><input aria-label="检索资料" placeholder="检索已导入资料…" oninput="const q=this.value.toLowerCase();document.querySelectorAll(\'tbody tr\').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(q));document.querySelectorAll(\'details\').forEach((d,i)=>d.open=!!q||i&lt;2)">'+sheets.map((sheet,i)=>'<details '+(i<2?'open':'')+'><summary>'+escape(sheet.name)+' · '+Math.max(0,sheet.rows.length-1)+' 条</summary><div class="scroll"><table><thead><tr>'+sheet.rows[0].map(c=>'<th>'+escape(c)+'</th>').join('')+'</tr></thead><tbody>'+sheet.rows.slice(1).map(row=>'<tr>'+row.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>').join('')+'<footer>刊例区间和原始发布期独立保留。人流不跨来源累计，来源周边点位不自动视为客户门店。</footer></main></body></html>';
}
