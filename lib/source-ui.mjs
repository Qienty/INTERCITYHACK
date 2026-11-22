import {realRates,realPOIs,realSearches,realBriefSources} from '../data/real-data.mjs';
import {paginate} from './listing.mjs';

const views={rates:{page:1},places:{page:1}};
let rateSource=()=>realRates;
export function referencePrice(row,rates=rateSource()){return (row.rateIds||[]).map(id=>rates.find(r=>r.id===id)).filter(Boolean).map(r=>r.priceText+' / '+r.periodText).join('；');}
export function ratesPanel(esc){return sourceTable('rates',esc);}
export function placesPanel(esc){return `<section class="card page-card"><div class="card-head"><h3 class="card-title">区域检索汇总</h3></div><div class="padded source-summary-list">${realSearches.map(s=>'<button class="source-summary-row" data-source-detail="search" data-source-id="'+esc(s.id)+'"><strong>'+esc(s.district+' · '+s.category)+'</strong><span>原表检索 '+s.count+' 项</span><small>只提供汇总，不包含逐项名称或坐标</small></button>').join('')||'<p>没有区域检索汇总。</p>'}</div></section>${sourceTable('places',esc)}`;}
function sourceTable(kind,esc){
  const isRates=kind==='rates',all=isRates?rateSource():realPOIs,result=paginate(all,views[kind].page,10);views[kind].page=result.page;
  const rows=result.items.map(r=>isRates?`<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.mediaType)}</small></td><td>${esc(r.priceText)}<small>原表数量 ${r.quantity??'未提供'}</small></td><td>${esc(r.periodText)}</td><td>${esc(r.productionText||'未提供')}</td><td><button class="btn small" data-source-detail="rate" data-source-id="${esc(r.id)}">查看来源</button></td></tr>`:`<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.category+' · '+r.district)}</small></td><td class="poi-address">${esc(r.address)}</td><td>${r.lon??'未提供'}<small>${r.lat??'未提供'}</small></td><td>${esc(r.distanceText)}</td><td><button class="btn small" data-source-detail="place" data-source-id="${esc(r.id)}">查看来源</button></td></tr>`).join('');
  return `<section class="card page-card source-material-table" data-source-kind="${kind}"><div class="card-head"><h3 class="card-title">${isRates?'原始刊例价参考':'来源周边点位'} <span class="tag gray">${all.length} 条</span></h3><button class="btn small" data-source-collapse="${kind}" aria-expanded="true">收起 / 展开</button></div><div class="source-table-body"><p class="source-material-note">${isRates?'原表区间、发布期和制作费原样保留。没有精确成交价、税费和可售档期，不自动生成最终报价。需要报价时，可在资源详情 → 补充 / 修改已核实报价条件中，把匹配的刊例区间填入价格与计费口径，再核实日期与含税后保存。':'保留来源名称、地址和坐标；坐标系未注明，不自动设为客户门店或可售广告库存。'}</p>${!isRates?pointMap():''}<div class="table-scroll"><table class="data-table"><thead><tr>${(isRates?['线路 / 位置 / 级别','原始刊例区间','发布期','制作费原文','']:['名称 / 分类','地址','经度 / 纬度','距来源中心','']).map(v=>'<th>'+v+'</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div><div class="table-footer"><span>第 ${result.start}–${result.end} 条 · 共 ${result.total} 条</span><div class="pagination"><button class="btn small" data-source-page="${kind}" data-page-value="${result.page-1}" ${result.page===1?'disabled':''}>上一页</button><span class="source-page-position" tabindex="-1">第 ${result.page} / ${result.pages} 页</span><button class="btn small" data-source-page="${kind}" data-page-value="${result.page+1}" ${result.page===result.pages?'disabled':''}>下一页</button></div></div></div></section>`;
}
function pointMap(){
  const points=realPOIs.filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat));if(!points.length)return '';
  const xs=points.map(p=>p.lon),ys=points.map(p=>p.lat),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return '<div class="source-point-map"><svg viewBox="0 0 680 220" role="img" aria-label="来源周边点位相对位置参考图"><rect width="680" height="220" fill="#f4f7f1"/>'+points.map(p=>'<circle cx="'+(24+(p.lon-minX)/(maxX-minX||1)*632)+'" cy="'+(196-(p.lat-minY)/(maxY-minY||1)*172)+'" r="3.5" fill="#54775c"/>').join('')+'</svg><span>来源坐标参考图 · 坐标系未注明 · 不代表媒体覆盖</span></div>';
}
export function openSource(kind,id,{modal,esc}){
  const item=(kind==='rate'?rateSource():kind==='place'?realPOIs:kind==='search'?realSearches:realBriefSources).find(x=>x.id===id);if(!item)return;
  const pairs=kind==='rate'?[['媒体类型',item.mediaType],['线路 / 位置 / 级别',item.name],['刊例价区间原文',item.priceText],['发布期原文',item.periodText],['制作费原文',item.productionText],['原表媒体数量',item.quantity],['税费口径','未注明'],['报价状态','来源参考，未转换为精确报价']]:kind==='place'?[['点位名称',item.name],['分类',item.category],['地址',item.address],['行政区',item.district],['经度',item.lon],['纬度',item.lat],['坐标系','未注明'],['来源检索中心',item.center],['距中心距离',item.distanceText],['合并数量',item.mergedCount]]:kind==='search'?[['检索模式',item.mode],['行政区',item.district],['点位类型',item.category],['检索数量',item.count],['明细','原文件只提供汇总，不编造逐项记录']]:[['文件',item.name],['字段数',item.rows.length],['已填写内容',item.filledCount],['状态',item.filledCount?'客户内容待整体确认':'空白模板，没有客户需求记录']];
  modal(kind==='rate'?'刊例原始资料':kind==='place'?'周边点位原始资料':kind==='search'?'区域检索原始资料':'客户需求模板', '<div class="detail-grid">'+pairs.map(([key,value])=>'<div><small>'+esc(key)+'</small><strong>'+esc(value??'未提供')+'</strong></div>').join('')+'</div><p>来源：'+esc(item.source)+'<br>'+esc(item.sourceRef||('CSV 第 '+(item.sourceRow||'—')+' 行'))+'</p>'+(kind==='rate'?'<div class="note-box">价格为区间化脱敏口径。“1月”不等同于 28 天；“/”不代表制作费为零。精确报价、税费、面积和实际可售日期须另行补充。</div>':kind==='place'?'<div class="note-box">这是用户资料中的周边参考点位，不等同于客户门店或可售广告点位。坐标数值原样解析，未推定坐标系。</div>':''));
}
export function installSourceUI({modal,esc,getRates}){if(typeof getRates==='function')rateSource=getRates;
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-source-detail],[data-source-page],[data-source-collapse]');if(!button||button.disabled)return;
    if(button.dataset.sourceDetail)openSource(button.dataset.sourceDetail,button.dataset.sourceId,{modal,esc});
    if(button.dataset.sourcePage){const kind=button.dataset.sourcePage;views[kind].page=Number(button.dataset.pageValue);document.querySelector('[data-source-kind="'+kind+'"]').outerHTML=sourceTable(kind,esc);document.querySelector('[data-source-kind="'+kind+'"] .source-page-position').focus({preventScroll:true});}
    if(button.dataset.sourceCollapse){const body=button.closest('.source-material-table').querySelector('.source-table-body');body.hidden=!body.hidden;button.setAttribute('aria-expanded',String(!body.hidden));}
  });
}
