import {syncStudioShell} from './lib/studio-shell.mjs';
import {campaignPage,installCampaignUI} from './lib/campaign-ui.mjs';
import {safeBriefReviewInput} from './lib/ai-review.mjs';
import {campaignReview} from './lib/campaign-review.mjs';
import {normalizeHypothesis,normalizeDelivery,hypothesisStatus} from './lib/hypothesis.mjs';
import {campaignPlan,campaignSheets} from './lib/campaign-review.mjs';
import {campaignReportMarkup,campaignFeesMarkup} from './lib/campaign-render.mjs';
import {normalizeInventoryPatch,upsertInventory} from './lib/inventory-update.mjs';
import {reviewSheets,reviewCSV,reviewHTML} from './lib/review-export.mjs';
import {normalizePlaces,normalizeProjectRecords,validateStoredBrief} from './lib/state-validation.mjs';
import {installQuoteUI} from './lib/quote-ui.mjs';
import {ratesPanel,placesPanel,referencePrice,openSource,installSourceUI} from './lib/source-ui.mjs';
import {coveragePanel,openCoverage,installCoverageUI} from './lib/coverage-sources.mjs';
import {refreshSourceRecords} from './lib/source-refresh.mjs';
import {libraryToolbar,installLibraryUI} from './lib/library-ui.mjs';
import {workbenchView,installWorkbenchUI} from './lib/proposal-workbench.mjs';
import {demoInventory,demoCoverage,DEMO_LABEL,PRICE_BASES,DEMO_METRO_PRODUCTION} from './lib/demo-mode.mjs';
import {setMixExpanded} from './lib/mix-panel.mjs';
import {selectionTableMarkup,packagePlansMarkup} from './lib/selection-table.mjs';
import {closingReportPresentation} from './lib/closing-report.mjs';
import {CHANNELS,channelName,channelKey,campaignRanges,withSchedule,scheduleSummary} from './lib/campaign.mjs';
import {scheduleForm,installSchedule} from './lib/schedule-ui.mjs';
import { INDUSTRIES,calculatePlan,parseCSV,toCSV,normalizeRows,mergeRates,inventoryMatrix,INVENTORY_HEADERS,RATE_HEADERS,validateBrief,quoteConditionIssues } from './lib/engine.mjs';
import { realRates,realPOIs,realSearches,realBriefSources,realCoverage,realInventorySnapshots } from './data/real-data.mjs';
import {sourceInventory as realInventory,sourceInsights as realInsights,sourceManifest as dataManifest,appendMissingMetro} from './lib/source-catalog.mjs';
import { exportHTML,quoteSheets } from './lib/export.mjs';
import { paginate,matchesQuery,searchMaterials } from './lib/listing.mjs';
import { installBriefImport } from './lib/brief-import-ui.mjs';
import { BRIEF_FIELDS,prepareBriefDraft } from './lib/brief-import.mjs';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('zh-CN',{maximumFractionDigits:2});
const wan=n=>(Number(n||0)/10000).toFixed(1);
const mediaName=channelName;
const paths={spark:'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',layers:'m12 3 10 5-10 5L2 8l10-5zM2 12l10 5 10-5M2 16l10 5 10-5',chart:'M4 4v16h16M8 16v-5M13 16V7M18 16v-8',file:'M14 2H5v20h14V7l-5-5zM14 2v6h5M8 12h8M8 16h6',database:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3zM4 6v12c0 2 4 3 8 3s8-1 8-3V6M4 12c0 2 4 3 8 3s8-1 8-3',arrow:'M5 12h14m-5-5 5 5-5 5',chevron:'m9 5 7 7-7 7',down:'m6 9 6 6 6-6',check:'m5 12 4 4L19 6',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zM8 12l3 3 5-5',bus:'M5 17V5c0-2 14-2 14 0v12H5zM5 11h14M7 17v3M17 17v3M8 14h1M15 14h1',metro:'M6 17V5c0-3 12-3 12 0v12H6zM6 11h12M9 21l3-4 3 4M9 14h1M14 14h1',pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM15 10a3 3 0 1 1-6 0 3 3 0 1 1 6 0',wallet:'M3 6h18v15H3V6zm0 0V3h15v3M16 12h5v5h-5z',calendar:'M3 5h18v16H3V5zM7 2v6M17 2v6M3 10h18',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M12 7v5l3 2',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',search:'M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0m-2 4 6 6',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',info:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M12 11v6M12 7v1',external:'M14 3h7v7m0-7-11 11M10 3H3v18h18v-7',play:'m9 5 11 7-11 7V5z',save:'M3 3h15l3 3v15H3V3zM7 3v6h9V3M7 21v-8h10v8',users:'M15 7a3 3 0 1 1-6 0 3 3 0 1 1 6 0M5 21v-4c0-5 14-5 14 0v4M18 4c4 0 4 6 0 6',leaf:'M20 3C8 2 1 9 6 16s14 5 14-13zM4 21 15 9',target:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0M12 12h.01'};
const icon=(name,size=16)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
const initial={brief:{industry:'食品饮料',brand:'',budget:2000000,media:['bus'],start:'',end:'',discount:1,goal:''},hypothesis:{},delivery:{},records:realInventory,places:[],evidence:[],imports:dataManifest.files.map(f=>({...f,at:f.month||'用户提供文件'})),strategyText:'',strategySource:'',demoMode:false,demoBasis:'mid',demoMetroProduction:DEMO_METRO_PRODUCTION};
let state=structuredClone(initial),page='studio',tableFilter='all',mapFilter='all',search='',plan,pendingImport=null;
const listViews={};
let projectLibrary=null;
let materialsQuery='',materialsKind='all',materialsPage=1,printing=false;
let sourceRefreshed=false,restoreNotice='';
try{
  const saved=JSON.parse(localStorage.getItem('xinyun-studio-v2-real')||'null');
  localStorage.removeItem('xinyun-studio-v1');
  if(saved&&Array.isArray(saved.records)&&saved.brief){
    state={...state,...saved,brief:{...initial.brief,...saved.brief}};
    if(saved.sourceVersion!==dataManifest.version&&!saved.projectMeta?.sourceVersion){
      try{localStorage.setItem('xinyun-studio-before-source-refresh',JSON.stringify(saved));}catch{}
      sourceRefreshed=true;state.records=refreshSourceRecords(saved.records,realInventory);
      state.imports=[...new Map([...(Array.isArray(saved.imports)?saved.imports:[]),...structuredClone(initial.imports)].map(f=>[f.name,f])).values()];
    }
    state.records=state.records.filter(r=>r.demo!==true&&!String(r.id).startsWith('DEMO-'));
  }
  const supported=new Set(CHANNELS.map(c=>c.id));
  const trimChannels=brief=>{if(!brief||!Array.isArray(brief.media))return;const allowed=[...new Set(brief.media.filter(m=>supported.has(m)))];if(allowed.length!==brief.media.length){brief.media=allowed;sourceRefreshed=true;}};
  trimChannels(state.brief);trimChannels(state.briefDraft?.before?.brief);
  const metroUpgrade=appendMissingMetro(state);if(metroUpgrade.added)sourceRefreshed=true;
  validateStoredBrief(state.brief,{allowDraft:true});
  if(state.briefDraft?.before?.brief)validateStoredBrief(state.briefDraft.before.brief,{allowDraft:true});
  state.records=normalizeProjectRecords(state.records);state.places=normalizePlaces(state.places);state.hypothesis=normalizeHypothesis(state.hypothesis);state.delivery=normalizeDelivery(state.delivery);
  state.evidence=(Array.isArray(state.evidence)?state.evidence:[]).filter(e=>e&&typeof e.title==='string'&&(!e.url||/^https?:\/\//i.test(e.url))).map(e=>({...e,note:String(e.note||'')}));
  if(!Array.isArray(state.imports))state.imports=[];
  state.brief.brand=String(state.brief.brand||'');state.brief.goal=String(state.brief.goal||'');state.brief.budget=Number(state.brief.budget);state.brief.discount=Number(state.brief.discount);
  state.sourceVersion=state.projectMeta?.sourceVersion||dataManifest.version;
}catch(error){state=structuredClone(initial);state.sourceVersion=dataManifest.version;sourceRefreshed=false;restoreNotice='本地草稿格式异常，已载入原始资料：'+error.message;}
function save(silent=true){try{localStorage.setItem('xinyun-studio-v2-real',JSON.stringify(state));projectLibrary?.schedule();if(!silent)toast('草稿已保存在当前浏览器');}catch{toast('浏览器存储空间不足，请先导出项目 JSON');}}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function download(name,body,type='text/plain;charset=utf-8'){const a=document.createElement('a'),url=URL.createObjectURL(body instanceof Blob?body:new Blob([body],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function modal(title,body){$('#modal').innerHTML=`<div class="modal-head"><h3>${esc(title)}</h3><button class="btn subtle" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></div><div class="modal-body">${body}</div>`;if(!$('#modal').open)$('#modal').showModal();}
function recalc(){
  // Demo mode derives quote conditions on the fly; the stored inventory stays untouched.
  const demo=state.demoMode?demoInventory(state.records,realRates,state.brief,{basis:state.demoBasis||'mid',metroProduction:Number.isFinite(Number(state.demoMetroProduction))?Number(state.demoMetroProduction):DEMO_METRO_PRODUCTION}):null;
  plan=calculatePlan(demo?demo.records:state.records,state.brief,state.places);
  if(demo)plan={...plan,demo:true,demoAssumptions:demo.assumptions,demoChanges:demo.changes};
  if(state.briefDraft)plan={...plan,lines:[],total:0,media:0,production:0,execution:0,monitoring:0,remaining:state.brief.budget,units:0,mediaCounts:{},districts:[],coveredPlaces:0,errors:['请先确认左侧自动填入的客户需求'],pendingBrief:true};document.body.dataset.source='files';}
function currentExclusions(){if(!plan.errors.length)return plan.excluded;return state.records.filter(row=>state.brief.media.includes(row.media)).map(row=>({...row,issues:quoteConditionIssues(row)})).filter(row=>row.issues.length);}
function currentBrand(){return state.brief.brand.trim()||INDUSTRIES[state.brief.industry].brand;}
function sourceLabel(){return state.demoMode?DEMO_LABEL+'：价格与档期为假设，原表数据未改':state.records.length?'已加载用户文件 · 表内数据为准':'尚未加载库存文件';}
const navs=[['studio','spark','提案工作台'],['campaign','target','假设书'],['resources','layers','媒体资源库'],['coverage','pin','覆盖分析'],['proposal','file','我的提案'],['data','database','数据中心']];
const pageTitles={studio:['提案工作台','从客户需求到媒体组合，在这里完成一份提案。'],resources:['媒体资源库','核对线路、空位与价格，按原始记录选择资源。'],coverage:['覆盖与受众分析','用历史人流和已核实的地标，建立投放依据。'],proposal:['投放提案','查看媒介组合、排期与报价，准备客户演示。'],data:['数据中心','管理原始资料、报价条件与项目备份。']};
pageTitles.campaign=['Campaign 假设书','把客户需求、投放依据与交付条件对齐。'];
function render(){
  recalc();document.body.dataset.page=page;document.body.dataset.demo=state.demoMode?'on':'off';
  const materialResultsHidden=$('#materials-results')?.hidden!==false;
  const navigation=(ids)=>navs.filter(n=>ids.includes(n[0])).map(([id,ic,label])=>
    `<button data-page="${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''} title="${label}">${icon(ic,18)}<span>${label}</span>${page===id?'<span class="nav-current" aria-hidden="true"></span>':''}</button>`).join('');
  const brandMark='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 25V15a6 6 0 0 1 6-6h16M5 19h10a6 6 0 0 0 6-6V5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="5" cy="25" r="2.5" fill="currentColor"/><circle cx="27" cy="9" r="2.5" fill="currentColor"/></svg>';
  $('#app').innerHTML=
  `<a class="skip-link" href="#workspace">跳到工作区</a>
  <header class="mobile-bar"><button class="btn subtle" data-ui-nav aria-label="打开导航" aria-controls="studio-navigation" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><strong>新云 · ${navs.find(n=>n[0]===page)[2]}</strong><button class="btn subtle" data-action="save" aria-label="保存草稿">${icon('save')}</button></header>
  <button class="nav-scrim" data-ui-nav-close aria-label="关闭导航" tabindex="-1"></button>
  <aside class="sidebar" id="studio-navigation" aria-label="新云工作空间"><div class="logo"><div class="logo-mark">${brandMark}</div><div><div class="logo-title">新云传媒</div><div class="logo-sub">城市媒体 · 提案工作空间</div></div><button class="btn subtle nav-close" data-ui-nav-close aria-label="关闭导航">${icon('close')}</button></div>
  ${materialsSearch()}<div class="workspace-label">投放项目</div><nav class="nav" aria-label="项目导航">${navigation(['studio','campaign','proposal'])}</nav><div class="workspace-label secondary-label">媒体与资料</div><nav class="nav" aria-label="资料导航">${navigation(['resources','coverage','data'])}</nav>
  <div class="sidebar-bottom"><div class="side-source"><span class="status-dot"></span>原始资料已接入<small>${money(state.records.length)} 条媒体资源 · 可追溯来源</small><button class="btn subtle" data-page="data">查看数据来源 ${icon('arrow',14)}</button></div><div class="profile"><div class="avatar">XY</div><div><strong>新云提案团队</strong><small>上海 · 城市户外媒体</small></div></div></div></aside>
  <main class="main"><div class="content" id="workspace" tabindex="-1"><div class="heading"><div><div class="workspace-eyebrow">新云工作空间 <span>/</span> ${page==='studio'?'方案编辑':page==='resources'||page==='coverage'||page==='data'?'媒体与资料':'投放项目'}</div><h1>${pageTitles[page][0]}</h1></div><div class="top-actions"><button class="btn subtle save-label" data-action="save" title="保存草稿到当前浏览器">${icon('save',16)}保存草稿</button><button class="btn" data-action="preview">${icon('play',14)}演示提案</button></div></div>
  ${state.demoMode?`<div class="demo-banner" role="status">${icon('info',14)}<div><strong>${DEMO_LABEL}模式 · 非成交价</strong><span>价格、可售期与制作费为测算假设；对外报价前须重新核价核档。</span></div><button class="btn small" type="button" data-demo-mode="off">退出刊例测算</button></div>`:''}
  ${libraryToolbar(state,esc)}${page==='campaign'?campaignPage(state,plan):page==='studio'?steps()+studio():page==='resources'?resources():page==='coverage'?coverage():page==='data'?dataPage():proposalPage()}<footer class="bottom-note"><span>${icon('save',14)}草稿保存在当前浏览器</span><span>报价需经销售确认 · 新云传媒</span></footer></div></main><button class="btn dark presentation-exit" data-action="exit-presentation">${icon('close',16)}退出演示</button><input class="file-input" id="import-file" type="file" accept=".csv,.xlsx"><input class="file-input" id="project-file" type="file" accept=".json">`;
  syncStudioShell();
  $('#materials-results').hidden=materialResultsHidden;
}

function steps(){
  const briefReady=!validateBrief(state.brief).length&&!!state.brief.brand.trim();
  const quoteReady=plan.lines.length>0&&!plan.errors.length;
  const stages=[['客户需求',state.briefDraft?'待整体确认':briefReady?'已填写':'待完善','studio',briefReady&&!state.briefDraft],['覆盖依据',state.places.length+' 个地标 · '+state.evidence.length+' 项依据','coverage',state.places.length>0&&state.evidence.length>0],['媒体库存',state.records.length+' 条已载入'+(state.demoMode?' · 刊例测算':''),'resources',state.records.length>0],['报价条件',quoteReady?(state.demoMode?'演示组合已生成（非成交价）':'已形成媒体组合'):'价格 / 档期待补充','data',quoteReady]];
  return '<div class="steps" id="readiness" aria-label="提案准备状态">'+stages.map(([title,sub,dest,done])=>`<button class="step ${done?'complete':'pending'}" data-page="${dest}"><span class="stage-indicator">${icon(done?'check':'clock',15)}</span><span><span class="step-name">${title}</span><span class="step-sub">${sub}</span></span>${icon('chevron',14)}</button>`).join('')+'</div>';
}

const INVOICE_OPTIONS=[['none','未设置 / 不开票'],['special','增值税专票'],['general','增值税普票']];
const TAX_RATES=[6,9,13,5,3,1];
function invoiceLabel(invoice){if(!invoice||!invoice.type||invoice.type==='none')return '未设置';const label=(INVOICE_OPTIONS.find(([value])=>value===invoice.type)||[])[1]||'未设置';return label+(invoice.taxRate?' · 税率 '+invoice.taxRate+'%':'');}
function actualBusShare(plan){
  const busUnits=(plan.lines||[]).filter(line=>line.media==='bus').reduce((sum,line)=>sum+line.quantity,0);
  return plan.units?Math.round(busUnits/plan.units*1000)/10:0;
}
// 配比：单选渠道固定 100%；双选后可用两个数字框设置数量口径的公交/地铁目标占比。
function mediaRatioField(b,plan,esc){
  if(b.media.length<2)return '<div class="field ratio-field"><div class="field-label">媒体配比 <small>单一渠道 100%</small></div><p class="field-hint">选择公交与地铁两种渠道后，可设置数量配比目标。</p></div>';
  const constraints=b.constraints||{},has=constraints.busShare!=null&&constraints.busShare!=='',bus=has?Number(constraints.busShare):'';
  const actual=actualBusShare(plan);
  return `<div class="field ratio-field"><div class="field-label">媒体配比 <small>数量口径 · 可留空</small></div><div class="ratio-inputs"><label class="ratio-input">公交<input type="number" min="0" max="100" step="1" data-ratio-share="bus" value="${bus}" placeholder="自动" aria-label="公交目标数量占比">%</label><span class="ratio-sep">/</span><label class="ratio-input">地铁<input type="number" min="0" max="100" step="1" data-ratio-share="metro" value="${has?Math.round((100-bus)*10)/10:''}" placeholder="自动" aria-label="地铁目标数量占比">%</label></div><div class="ratio-meta"><label>容差 ±<input type="number" min="0" max="100" step="1" data-ratio-tolerance value="${Number(constraints.shareTolerance)||0}" aria-label="允许偏差百分点"> 个百分点</label><label><input type="checkbox" data-ratio-hard ${constraints.shareHard?'checked':''}> 硬约束</label>${has?'<button type="button" class="btn small subtle" data-ratio-clear>清除目标</button>':''}</div><p class="field-hint">${has?'目标 公交 '+bus+'% · 地铁 '+(100-bus)+'%；当前实际 公交 '+actual+'%。':'未设置时按规则自动配单；两个数字之和须为 100。'}按资源数量而非媒介费计算。</p></div>`;
}
// 商务条款：折扣、结算发票与税率。税率只用于价税拆分展示，不重复加税。
function commerceFields(b,esc){
  const invoice=b.invoice||{type:'none',taxRate:6,source:''},discount=Number(b.discount)||1;
  const floor=Number(b.constraints?.discountFloor)||0,approval=b.constraints?.discountApproval;
  const below=floor>0&&discount<floor;
  return `<div class="commerce-grid"><div class="field"><label for="brief-discount">客户折扣 <small>折</small></label><div class="discount-input"><input id="brief-discount" type="number" min="1" max="10" step="0.1" data-commerce="discount" value="${(discount*10).toFixed(1)}"><span>折</span><output>${discount.toFixed(2)} 系数</output></div><p class="field-hint">仅作用于媒介费。${below?('低于已核实审批线 '+(floor*10).toFixed(1)+' 折'+(approval?'，已填审批依据':'，需在空间与规则填写审批依据')):'未低于已录入审批线。'}</p></div><div class="field"><label for="brief-invoice">结算发票</label><select id="brief-invoice" data-commerce="invoiceType">${INVOICE_OPTIONS.map(([value,label])=>`<option value="${value}" ${invoice.type===value?'selected':''}>${label}</option>`).join('')}</select><p class="field-hint">专票需客户提供名称、税号、地址电话、开户行及账号四项信息。</p></div><div class="field"><label for="brief-taxrate">税率 <small>信息项，不重复加税</small></label><select id="brief-taxrate" data-commerce="taxRate" ${invoice.type==='none'?'disabled':''}>${TAX_RATES.map(rate=>`<option value="${rate}" ${Number(invoice.taxRate)===rate?'selected':''}>${rate}%</option>`).join('')}</select><p class="field-hint">用于报价单价税拆分展示；含税应付金额不变。</p></div><div class="field"><label for="brief-taxsource">税率与发票依据 <small>${invoice.type==='none'?'未启用':'必填'}</small></label><input id="brief-taxsource" data-commerce="taxSource" maxlength="300" value="${esc(invoice.source||'')}" placeholder="如：客户确认增值税专票 6%，2026-11-22"><p class="field-hint">未填写时不会形成正式报价条款。</p></div></div>`;
}
// 必须经过的地址：按已核实的同坐标系参考点直线距离圈选，不做地理编码。
function addressField(state,esc){
  const spatial=state.brief.spatial||{},radius=spatial.radius||{},enabled=radius.enabled===true;
  const verified=(spatial.mappings||[]).filter(mapping=>mapping.verified===true||mapping.verifiedAt);
  const meters=Number(radius.meters)||1000;
  return `<details class="brief-extra address-field" ${enabled?'open':''}><summary>必须经过的地址 · 按已核实坐标圈选</summary><label class="work-confirm"><input type="checkbox" data-address="enabled" ${enabled?'checked':''}> 启用（不勾选则不约束线路走向）</label><div class="two-fields"><div class="field"><label>地址 / 地标名称</label><input data-address="name" maxlength="80" value="${esc(radius.name||'')}" placeholder="客户要求必须经过的地址"></div><div class="field"><label>坐标系 <small>必填</small></label><select data-address="coordinateSystem" ${enabled?'':'disabled'}>${['','WGS84','GCJ-02','BD-09'].map(system=>`<option value="${system}" ${radius.coordinateSystem===system?'selected':''}>${system||'请选择'}</option>`).join('')}</select></div></div><div class="two-fields"><div class="field"><label>经度</label><input type="number" step="any" data-address="lon" value="${radius.lon??''}" ${enabled?'':'disabled'}></div><div class="field"><label>纬度</label><input type="number" step="any" data-address="lat" value="${radius.lat??''}" ${enabled?'':'disabled'}></div></div><div class="field"><div class="field-label">圈选半径</div><div class="radius-presets">${[500,1000,2000,3000].map(preset=>`<button type="button" class="preset ${meters===preset?'active':''}" data-address-radius="${preset}" ${enabled?'':'disabled'}>${preset===500?'500 m':preset/1000+' km'}</button>`).join('')}<input type="number" min="100" max="50000" step="100" data-address="meters" value="${meters}" ${enabled?'':'disabled'} aria-label="圈选半径（米）"></div></div><div class="field"><label>核实来源</label><input data-address="source" maxlength="300" value="${esc(radius.source||'')}" placeholder="坐标与途经关系的核实来源（可选）"></div><p class="field-hint">只按已核实的同坐标系参考点直线距离判断，不自动地理编码；当前已核实空间关系 ${verified.length} 条。${enabled&&!verified.length?'启用后所有资源都会因无法核实被排除，请先在“空间与规则”导入关系。':''}</p><button type="button" class="btn small" data-mix-goto="rules">去导入已核实空间关系</button></details>`;
}
function commerceBlock(state,plan,esc){
  return `<details class="brief-extra commerce-block" open><summary>商务与执行条件 · 折扣、发票、税率、必须经过地址</summary>${commerceFields(state.brief,esc)}${addressField(state,esc)}</details>`;
}
function briefForm(){const b=state.brief;return `<section class="card brief" id="client-brief"><div class="section-title"><strong>客户投放需求</strong><span>编辑 Brief</span></div>${briefImportTools()}<div class="brief-submit"><button class="generate" data-action="generate">${icon('spark',15)}${state.briefDraft?'确认需求并生成方案':'生成推荐方案'}${icon('arrow',15)}</button><p class="secure-note">只按已确认数据配单</p></div><div class="field"><label for="industry">客户行业 <small>必选</small></label><select id="industry" data-brief="industry">${Object.keys(INDUSTRIES).map(k=>`<option ${k===b.industry?'selected':''}>${k}</option>`).join('')}</select></div><div class="field"><label for="brand">目标品牌 <small>在上海有线下门店</small></label><input id="brand" data-brief="brand" placeholder="输入品牌，补充调研依据" value="${esc(b.brand)}"></div><div class="field"><div class="field-label">投放预算 <small>含税总预算</small></div><div class="budget-top"><div class="budget-value"><small>¥</small><output id="budget-output">${b.budget/10000}</output><span>万元</span></div><span>100–500 万</span></div><input aria-label="投放预算（万元）" id="budget" type="range" min="100" max="500" step="any" value="${b.budget/10000}"><div class="budget-presets">${[100,200,500].map(n=>`<button class="preset ${b.budget===n*10000?'active':''}" data-budget="${n}">${n} 万</button>`).join('')}</div></div><div class="field channels-field"><div class="field-label">投放渠道 <small>可多选</small></div><div class="media-options">${CHANNELS.map(({id:m,label})=>`<label class="media-option ${b.media.includes(m)?'selected':''}"><input type="checkbox" data-media="${m}" ${b.media.includes(m)?'checked':''}>${label}</label>`).join('')}</div>${b.media.some(m=>!state.records.some(r=>r.media===m))?'<p class="field-hint channel-hint">'+b.media.filter(m=>!state.records.some(r=>r.media===m)).map(mediaName).map(esc).join('、')+':当前项目尚未载入该渠道</p>':''}${b.media.includes('metro')&&!state.records.some(r=>r.media==='metro')?'<button class="btn small" type="button" data-action="load-metro-catalog">加载真实地铁站口（'+realInventory.filter(r=>r.media==='metro').length+'条）</button>':''}</div>${mediaRatioField(b,plan,esc)}${scheduleForm(b,plan,esc,icon)}${commerceBlock(state,plan,esc)}<hr class="brief-divider"><div class="field"><label for="goal">投放目标</label><textarea id="goal" data-brief="goal" placeholder="填写客户明确的投放目标">${esc(b.goal)}</textarea></div>${briefExtraFields()}</section>`;}
function studio(){return `<div class="workbench" data-brief-open="false"><button class="brief-mobile-toggle" data-ui-brief aria-expanded="false" aria-controls="client-brief"><span>${icon('file',16)}客户投放需求 <small>${esc(state.brief.brand||'未填写品牌')} · ${money(state.brief.budget/10000)} 万元</small></span><span>编辑需求 ${icon('down',14)}</span></button>${briefForm()}<div class="right-column"><div id="live-output">${workbenchView(state,plan,dashboard,esc)}</div></div></div>`;}
function dashboard(){
  const ready=plan.lines.length>0&&!plan.errors.length,vacancy=state.records.reduce((s,r)=>s+(Number.isFinite(r.available)?r.available:0),0);
  const missingPrices=state.records.filter(r=>!Number.isFinite(r.unitPrice)||r.unitPrice<=0).length;
  const title=state.briefDraft?'需求已填入，等待整体确认':ready?'媒体组合已生成':'补齐投放条件，即可生成组合';
  const description=state.briefDraft?'在左侧查看或修改需求，再一次确认。':ready?(plan.warnings.length?'报价草稿：'+plan.warnings.join('；'):'方案按当前预算、库存与已确认的报价条件计算。'):missingPrices?'已接入 '+realRates.length+' 条区间刊例，精确成交价、税费与可售档期待补充。':'核对需求、可售档期、制作费与含税口径后再生成方案。';
  return `<div class="right-column">${resourceTable(true)}<div class="stats">${ready?stat(plan.fees?.pending.length?'草稿计入费用':'方案总价',wan(plan.total),'万元','wallet','按已确认条件计算'):stat('库存记录',state.records.length,'条','layers','保留原表各媒体形式')}${stat('原表空位',money(vacancy),state.records.every(r=>['bus','metroTrain'].includes(r.media))?'辆':'个','bus','未核定具体投放档期')}${stat('历史人流报告',realInsights.length,'份','users','2023 年 5 月 · 分别保留')}${ready?stat('推荐资源',plan.units,'个','layers','按当前预算与条件'):stat('区间刊例参考',realRates.length,'条','wallet','原始区间与周期，不代填成交价')}</div>${plan.errors.length&&state.brief.start&&state.brief.end&&!state.briefDraft?'<div class="alert">'+plan.errors.map(esc).join('<br>')+'</div>':''}<div class="evidence-strip"><div>${icon('chart',18)}<span><strong>历史人流作为参考</strong><small>报告分别关联，不跨线路累计人数。</small></span><button class="btn subtle" data-page="coverage">查看报告 ${icon('arrow',14)}</button></div><div>${icon('pin',18)}<span><strong>${state.places.length?'已录入 '+state.places.length+' 个目标地标':realPOIs.length+' 个来源周边点位已接入'}</strong><small>来源点位可查看；客户地标与坐标系需核实。</small></span><button class="btn subtle" data-page="coverage">${state.places.length?'查看覆盖':'查看点位'} ${icon('arrow',14)}</button></div></div>${state.strategyText?'<section class="card padded strategy-draft"><h3>客户策略草稿</h3><p>'+esc(state.strategyText)+'</p><span class="tag gray">人工核实后用于提案</span></section>':''}${(ready||state.places.length)?'<div class="map-mix">'+(state.places.length||plan.lines.some(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon))?mapCard():'')+'</div>':''}</div>`;
}

function stat(label,value,unit,ic,note){return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-note">${esc(note)}</div></div>`;}

function mapCard(){
  const hasCoordinates=state.places.length||plan.lines.some(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon));
  if(!hasCoordinates)return `<section class="card map-card"><div class="card-head"><h2 class="card-title">${icon('pin',14)}门店与媒体位置</h2><span class="tag gray">坐标未提供</span></div><div class="empty-state" style="min-height:245px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">${icon('pin',30)}<strong>当前文件没有坐标或线路轨迹</strong><span>位置、覆盖圈与门店均保持空白。<br>已有的历史人流可在「覆盖分析」查看。</span><button class="btn small" data-page="coverage">查看历史人流</button></div></section>`;
  return `<section class="card map-card"><div class="card-head"><h2 class="card-title">${icon('pin',14)}已提供的位置参考点</h2><div class="map-controls">${[['all','全部'],...CHANNELS.filter(c=>plan.lines.some(r=>r.media===c.id)).map(c=>[c.id,c.label])].map(([m,t])=>`<button class="map-control ${mapFilter===m?'active':''}" data-map="${m}">${t}</button>`).join('')}</div></div><div class="map-area">${mapSVG()}<div class="map-label">位置参考图</div></div><div class="map-footer">只显示已录入的参考点，不推断实际公交轨迹。</div></section>`;
}
function mapSVG(){const pts=plan.lines.filter(r=>(mapFilter==='all'||r.media===mapFilter)&&Number.isFinite(r.lon)&&Number.isFinite(r.lat)),all=[...pts,...state.places];if(!all.length)return '';const minLon=Math.min(...all.map(p=>p.lon))-.01,maxLon=Math.max(...all.map(p=>p.lon))+.01,minLat=Math.min(...all.map(p=>p.lat))-.01,maxLat=Math.max(...all.map(p=>p.lat))+.01;const x=v=>35+(v-minLon)/(maxLon-minLon)*530,y=v=>270-(v-minLat)/(maxLat-minLat)*230;return '<svg viewBox="0 0 600 320" role="img" aria-label="已提供坐标参考图"><rect width="600" height="320" fill="#f2f5ed"/>'+state.places.map(p=>'<g><circle cx="'+x(p.lon)+'" cy="'+y(p.lat)+'" r="5" fill="#d69c75"/><text x="'+(x(p.lon)+8)+'" y="'+y(p.lat)+'" font-size="10" fill="#728760">'+esc(p.name)+'</text></g>').join('')+pts.map(p=>'<g class="map-point" data-detail="'+esc(p.id)+'" tabindex="0" role="button" aria-label="查看 '+esc(p.name)+'"><title>'+esc(p.name)+'</title><circle cx="'+x(p.lon)+'" cy="'+y(p.lat)+'" r="5" fill="#6f8c65"/></g>').join('')+'</svg>';}
// 媒体组合栏取代旧的渠道预算分配卡片：见 lib/mix-panel.mjs。

function listView(key, compact=false) {
  return listViews[key] ||= {page:1, size:compact?5:10, collapsed:false};
}
function resetListPages() { Object.values(listViews).forEach(v=>v.page=1); }
function refreshResourceTable(focusSelector) {
  const card=$('.resource-card');if(!card)return;
  card.outerHTML=resourceTable(card.dataset.compact==='true');
  if(focusSelector)$(focusSelector)?.focus({preventScroll:true});
}
function resourceTable(compact=false){
  const inventoryMode=page==='resources'||(compact&&!plan.lines.length);
  const base=inventoryMode?state.records:plan.lines;
  const key=page+'-'+(inventoryMode?'inventory':'plan'),view=listView(key,compact);
  const filtered=base.filter(r=>(tableFilter==='all'||r.media===tableFilter)&&matchesQuery([r.id,r.name,r.operator,r.district,r.grade,r.format,r.source],search));
  const result=paginate(filtered,printing?1:view.page,printing?(filtered.length||view.size):view.size);
  if(!printing)view.page=result.page;
  const rows=result.items,collapsed=view.collapsed&&!printing;
  return `<section class="card resource-card" data-list-key="${key}" data-compact="${compact}">
    <div class="card-head"><h2 class="card-title">${inventoryMode?'库存线路清单':'本次投放媒体组合'} <span class="tag gray">${base.length} 项</span></h2>
      <div class="table-tools"><button class="btn small" data-action="${inventoryMode?'inventory-export':'export-csv'}">${icon('download',12)}导出清单</button><button class="btn small list-toggle" data-list-toggle="${key}" aria-expanded="${!collapsed}" aria-controls="list-body-${key}">${collapsed?'展开清单':'收起清单'} ${icon('down',12)}</button></div></div>
    <div id="list-body-${key}" ${collapsed?'hidden':''}>
      <div class="tabs">${[['all','全部资源'],...CHANNELS.map(c=>[c.id,c.label])].map(([f,l])=>`<button class="tab ${tableFilter===f?'active':''}" data-filter="${f}">${l}<span>${base.filter(r=>f==='all'||r.media===f).length}</span></button>`).join('')}</div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>线路 / 媒体形式</th><th>${inventoryMode?'运营公司':'区域'}</th><th>${inventoryMode?'可用 / 总量':'推荐数量'}</th><th>${inventoryMode?'刊例价':'含税小计'}</th><th>${inventoryMode?'历史人流资料':'匹配度'}</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="resource-name"><div class="media-symbol ${r.media}">${icon(r.media,15)}</div><div><strong>${esc(r.name)}<span class="grade">${esc(r.grade||'未提供')}</span></strong><small>${esc(r.format||mediaName(r.media))} · 源表第 ${r.sourceRow||'—'} 行</small></div></div></td><td>${esc(inventoryMode?(r.operator||'未提供'):(r.district||'未提供'))}</td><td>${inventoryMode?`<strong>${r.available??'—'}</strong> / ${r.capacity??'—'} ${['bus','metroTrain'].includes(r.media)?'辆':'个'}<small>合同 ${r.contracted??'—'} · 预定 ${r.reserved??'—'}</small>`:r.quantity+' 个'}</td><td><strong>${inventoryMode?(r.unitPrice==null?(referencePrice(r)||'未提供'):'¥'+money(r.unitPrice)):'¥'+money(r.amount)}</strong><small>${inventoryMode&&!r.availableStart?(referencePrice(r)?'区间参考 · 可售日期未提供':'可售日期未提供'):''}</small></td><td>${inventoryMode?((r.insightIds||[]).length?`<button class="btn small" data-resource-insights="${esc(r.id)}">${r.insightIds.length} 份报告 ↗</button>`:'<span class="tag gray">无同名报告</span>'):(r.score+' / 100')}</td><td><button class="row-more" data-detail="${esc(r.id)}" aria-label="查看 ${esc(r.name)} 详情">⋯</button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state">没有符合筛选条件的资源。</div></td></tr>'}</tbody></table></div>
      <div class="table-footer list-footer"><span class="list-count" role="status">${result.total?'第 '+result.start+'–'+result.end+' 项':'暂无匹配资源'} · 共 ${result.total} 项</span><div class="pagination" aria-label="媒体清单分页">
        <label class="page-size">每页 <select data-list-size="${key}" aria-label="每页显示条数">${[5,10,20].map(n=>`<option value="${n}" ${view.size===n?'selected':''}>${n} 条</option>`).join('')}</select></label>
        <button class="btn small page-nav" data-list-page="1" ${result.page===1?'disabled':''} aria-label="第一页">«</button><button class="btn small page-nav" data-list-page="${result.page-1}" ${result.page===1?'disabled':''}>上一页</button><span class="page-position" tabindex="-1">第 ${result.page} / ${result.pages} 页</span><button class="btn small page-nav" data-list-page="${result.page+1}" ${result.page===result.pages?'disabled':''}>下一页</button><button class="btn small page-nav" data-list-page="${result.pages}" ${result.page===result.pages?'disabled':''} aria-label="最后一页">»</button>
      </div></div><div class="list-note">原表空位不等于已核定档期可售 · 导出包含完整清单</div>
    </div>
  </section>`;
}

const materialKinds=[['all','全部材料'],['inventory','媒体库存'],['insight','人流报告'],['coverage','覆盖报告'],['rate','刊例参考'],['place','周边点位'],['search','检索汇总'],['file','来源文件'],['evidence','调研依据']];
function materialMatches(kind=materialsKind) {
  return searchMaterials({records:state.records,insights:realInsights,files:dataManifest.files,imports:state.imports,evidence:state.evidence,rates:realRates,pois:realPOIs,searches:realSearches,coverage:realCoverage},materialsQuery,kind);
}
function materialsSearch(){return `<section class="materials-search" aria-label="相关材料搜索"><form id="materials-search-form" role="search"><label class="sr-only" for="materials-query">搜索相关材料</label>${icon('search',16)}<input id="materials-query" type="search" maxlength="200" autocomplete="off" placeholder="搜索相关材料、线路或文件…" value="${esc(materialsQuery)}" aria-label="搜索相关材料" aria-controls="materials-results"><button class="btn subtle clear-search" type="button" data-action="clear-materials" aria-label="清空材料搜索">${icon('close',14)}</button><button class="search-submit" type="submit" aria-label="搜索材料">搜索</button></form><div id="materials-results">${materialsResults()}</div></section>`;}

function materialsResults(){
  if(!materialsQuery.trim())return '';
  const all=materialMatches('all'),filtered=materialsKind==='all'?all:all.filter(r=>r.kind===materialsKind);
  const result=paginate(filtered,materialsPage,6);materialsPage=result.page;
  return `<div class="materials-results-panel"><div class="materials-filters" aria-label="材料类型">${materialKinds.map(([kind,label])=>`<button class="material-filter ${materialsKind===kind?'active':''}" data-material-kind="${kind}" aria-pressed="${materialsKind===kind}">${label} <span>${kind==='all'?all.length:all.filter(r=>r.kind===kind).length}</span></button>`).join('')}</div><div class="materials-result-list">${result.items.map(r=>`<button class="material-result" data-material-id="${esc(r.id)}" data-material-type="${r.kind}"><span class="material-icon">${icon(r.kind==='inventory'?'bus':r.kind==='insight'?'chart':'file',18)}</span><span class="material-copy"><strong>${esc(r.title)} <span class="tag gray">${materialKinds.find(k=>k[0]===r.kind)[1]}</span></strong><span>${esc(r.subtitle)}</span><small>${esc(r.source)}</small></span>${icon('chevron',14)}</button>`).join('')||'<div class="empty-state">没有找到相关材料，请更换关键词或材料类型。</div>'}</div><div class="materials-result-footer"><span role="status">共 ${result.total} 项结果${result.total?' · 显示 '+result.start+'–'+result.end+' 项':''}</span><div class="pagination"><button class="btn small" data-material-page="${result.page-1}" ${result.page===1?'disabled':''}>上一页</button><span class="material-page-position" tabindex="-1">第 ${result.page} / ${result.pages} 页</span><button class="btn small" data-material-page="${result.page+1}" ${result.page===result.pages?'disabled':''}>下一页</button></div></div></div>`;
}
function openMaterial(kind,id){
  if(kind==='coverage')return openCoverage(id,{modal,esc,getRecords:()=>state.records});
  if(['rate','place','search'].includes(kind))return openSource(kind,id,{modal,esc});
  if(kind==='inventory')return detail(id);
  if(kind==='insight')return insightDetail(id);
  if(kind==='evidence'){
    const e=state.evidence[Number(id)];if(!e)return;
    modal('调研依据 · '+e.title,`<p class="material-note">${esc(e.note)}</p>${e.url&&/^https?:\/\//i.test(e.url)?`<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">打开来源链接 ↗</a>`:'<div class="note-box">未提供来源链接</div>'}`);return;
  }
  const f=[...state.imports,...dataManifest.files].find(f=>f.name===id);if(!f)return;
  modal('来源文件 · '+f.name,`<div class="detail-grid"><div><small>文件名</small><strong>${esc(f.name)}</strong></div><div><small>材料类型</small><strong>${esc(f.type)}</strong></div><div><small>记录数</small><strong>${esc(f.count??'未提供')}</strong></div><div><small>数据月份 / 导入时间</small><strong>${esc(f.month||f.at||'未提供')}</strong></div><div><small>原始资料说明</small><strong>${esc(f.note||'无补充说明')}</strong></div><div><small>内容 SHA-256</small><strong>${esc(f.sha256||'浏览器导入，未附原始文件哈希')}</strong></div></div>${(f.sourceNotes||[]).map(note=>'<div class="note-box">'+esc(note)+'</div>').join('')}<div class="note-box">搜索范围包含库存、人流报告、刊例区间、周边点位、检索汇总与调研摘要。</div>`);
}

function resources(){return `<div class="status-strip">${icon('info',14)}${sourceLabel()} · 未提供的数据保持为空。相同线路的不同媒体形式分别保留。</div><div class="page-toolbar"><button class="btn dark" data-import="inventory">${icon('upload',13)}更新库存</button><button class="btn" data-import="rates">导入刊例价</button><button class="btn" data-action="inventory-export">导出当前库存</button><div class="search-field">${icon('search',13)}<input id="resource-search" aria-label="搜索资源" placeholder="搜索线路、公司或编号" value="${esc(search)}"></div></div><div id="resource-results">${resourceTable()}</div>`;}
function coverage(){return `<div class="stats">${stat('历史报告',realInsights.length,'份','file',dataManifest.summary.busInsights+' 份公交 / '+dataManifest.summary.metroInsights+' 份地铁')}${stat('可关联报告',dataManifest.summary.linkedInsights,'份','layers','按表内线路名称精确关联')}${stat('有报告的库存',dataManifest.summary.withInsights,'条','bus','同线路报告不重复累计人数')}${stat('数据月份','2023-05','','calendar','原表月份，不推算 2027 流量')}</div><details class="card page-card report-directory" open><summary class="card-head"><span class="card-title">历史人流与受众画像 <span class="tag gray">${realInsights.length} 份</span></span><span class="disclosure-label">展开 / 收起</span></summary><div class="note-box" style="margin:0 20px 18px">文件名已按表内线路调整，原表内容未修改。共 ${dataManifest.summary.distinctInsightGroups} 组数据、${dataManifest.summary.duplicateInsights} 份重复导出，全部来源分别保留。多报告线路不取单一人流值；没有同名库存的来源仍可查看。累计人数与人次不跨报告相加。</div>${insightsTable()}</details>${coveragePanel(esc)}${placesPanel(esc)}<div class="page-grid page-card"><div class="card padded"><h3>客户门店 / 地标</h3><p>来源周边点位已保留坐标。客户门店、媒体坐标和坐标系仍需核实，不自动混用。</p><ul class="evidence-list">${state.places.map((p,i)=>`<li><span class="number">${i+1}</span><div><strong>${esc(p.name)}</strong><p>${p.lon.toFixed(4)}, ${p.lat.toFixed(4)} · 半径 ${p.radius}m</p></div><button class="btn subtle" data-remove-place="${esc(p.id)}" aria-label="移除地标">${icon('close',12)}</button></li>`).join('')||'<li><p>尚未填写门店 / 地标。</p></li>'}</ul><button class="btn" data-action="add-place" style="margin-top:16px">${icon('plus',13)}添加已核实坐标</button></div><div class="card padded"><h3>品牌与需求依据</h3><ul class="evidence-list">${state.evidence.map((e,i)=>`<li><div><strong>${esc(e.title)}</strong><p>${esc(e.note)}</p>${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>`:''}</div><button class="btn subtle" data-remove-evidence="${i}" aria-label="删除证据">${icon('close',12)}</button></li>`).join('')||'<li><p>没有提供品牌与 campaign 材料，当前保持空白。</p></li>'}</ul><div class="button-row" style="margin-top:16px"><button class="btn" data-action="add-evidence">添加依据</button><button class="btn dark" data-action="ai-strategy">${icon('spark',13)}生成 AI 策略草稿</button></div></div></div>`;}
function dataPage(){return `${realInventorySnapshots.length?'<section class="card padded page-card"><h3>真实红豆档期快照</h3><p>默认资源目录已接入公交与地铁合并快照。这些文件是同一库存的不同渠道视图，不能叠加；手动换源仍先预览并整体确认。</p><div class="button-row">'+realInventorySnapshots.map(f=>'<button class="btn small" data-dated-source="'+esc(f.id)+'">'+esc(f.source)+' · '+(f.rows.length-1)+'条</button>').join('')+'</div></section>':''}<div class="stats">${stat('原始文件',dataManifest.files.length,'份','file','库存、人流、刊例、点位与模板')}${stat('媒体库存',state.records.length,'条','bus','按原表保留字段与空值')}${stat('更正文件名',dataManifest.renames?.length||0,'份','check','以表内线路为准，文件内容未改')}${stat('区间刊例',realRates.length,'条','wallet','保留原始发布期和制作费')}</div><div class="page-grid page-card"><section class="card padded"><h3>已接入的库存</h3><p>${esc(state.records[0]?.source||'无库存文件')} · ${state.records.length} 条记录</p><div class="note-box">保留总车辆数、保养影响容量、合同车、预定车、空位数与可能续约数。未用这些数值重新推算或覆盖原始空位。</div><div class="button-row" style="margin-top:18px"><button class="btn dark" data-import="inventory">${icon('upload',13)}更新库存文件</button><button class="btn" data-action="inventory-export">导出当前库存</button></div></section><section class="card padded"><h3>刊例价与投放条件</h3><p>已接入原始区间刊例、发布期与制作费。精确成交价、含税状态及可售起止日期仍待补充，不取区间中值，不将原始月价擅自折算成 28 天价格。</p><div class="button-row"><button class="btn" data-import="rates">导入已确认的精确报价</button><button class="btn" data-template="rates">下载空白字段模板</button></div></section></div>${ratesPanel(esc)}<details class="card page-card source-directory" open><summary class="card-head"><span class="card-title">全部来源文件 <span class="tag gray">${dataManifest.files.length} 份</span></span><span class="disclosure-label">展开 / 收起</span></summary><div class="table-scroll"><table class="data-table files-table"><thead><tr><th>文件名</th><th>内容</th><th>记录数</th><th>月份 / 来源说明</th></tr></thead><tbody>${dataManifest.files.map(f=>`<tr><td>${esc(f.name)}</td><td>${esc(f.type)}</td><td>${f.count}</td><td>${esc(f.month||f.note||'未提供')}</td></tr>`).join('')}</tbody></table></div></details><section class="card padded page-card"><h3>文件名调整记录</h3><p>只调整了命名。重名加后缀保留，每份文件在改名前后的 SHA-256 均一致。</p><details><summary>查看 ${dataManifest.renames?.length||0} 条记录</summary><ul class="evidence-list">${(dataManifest.renames||[]).map(r=>`<li><div><strong>${esc(r.name)}</strong><p>原名：${esc(r.original)}<br>表内线路：${esc(r.route)} · ${r.sourcePresent===false?'历史记录，当前源目录已不含此项':r.sourceContentUnchanged===false?'历史命名记录；当前同名源文件已更新':'内容未修改'}</p></div></li>`).join('')}</ul></details><div class="button-row" style="margin-top:18px"><button class="btn" data-action="export-project">备份当前项目</button><button class="btn" data-action="import-project">恢复项目备份</button><button class="btn" data-action="reset">恢复文件数据</button></div></section>`;}
function checks(){return [['预算检查',plan.total<=state.brief.budget&&plan.total>0,plan.total?'¥'+money(plan.total):'尚未报价'],['目标品牌',!!state.brief.brand.trim(),state.brief.brand.trim()?'已填写':'未提供'],['研究依据',state.evidence.length>0,state.evidence.length+' 项'],['文件库存',state.records.length>0,state.records.length+' 条'],['门店 / 地标',state.places.length>0,state.places.length+' 个'],['报价条件',plan.lines.length>0,plan.lines.length?'按当前条件计算':'价格、日期待补充']];}
function proposalPage(){return baseProposalPage()+(state.hypothesis?.clientProfile||plan.lines.length?(campaignFeesMarkup(state,plan)+campaignReportMarkup(state,plan)):'<div class="campaign-proposal-link"><button class="btn" data-page="campaign">完善假设书与提交自检</button></div>');}
function baseProposalPage(){if(plan.errors.length||!plan.lines.length)return proposalPending();const b=state.brief,scenarios=[100,200,500].map(n=>({budget:n,p:calculatePlan(state.records,{...b,budget:n*10000},state.places)}));return `<div class="mode-watermark">${sourceLabel()} · 本提案为工作草稿，非最终报价或资源锁定凭证。</div><div class="page-toolbar"><button class="btn dark" data-action="export-html">${icon('download',13)}导出交互 HTML</button><button class="btn" data-action="export-xlsx">导出 Excel</button><button class="btn" data-action="export-csv">导出 CSV</button><button class="btn" data-action="export-pptx">导出结案报告 PPTX</button><button class="btn" data-action="pricing">报价设置</button><button class="btn" data-action="print">${icon('file',13)}打印 / PDF</button></div><section class="proposal-cover"><div class="proposal-context">新云传媒 · 2027 户外媒体投放方案</div><h2>${esc(currentBrand())}<br>${esc(INDUSTRIES[b.industry].campaign)}</h2><p>${esc(b.goal)} · 上海户外媒体投放方案</p><div class="proposal-meta"><div>投放预算<strong>¥${b.budget/10000} 万</strong></div><div>建议投放额<strong>¥${wan(plan.total)} 万</strong></div><div>投放日期<strong>${esc(scheduleSummary(b))}</strong></div><div>媒体组合<strong>${b.media.map(mediaName).join(' + ')}</strong></div><div>客户折扣<strong>${(Number(b.discount)*10).toFixed(1)} 折</strong></div><div>结算发票<strong>${esc(invoiceLabel(b.invoice))}</strong></div></div></section><div class="page-grid page-card"><div class="card padded"><h3>01 / 我们理解的品牌任务</h3><p>${esc(state.strategyText||INDUSTRIES[b.industry].objective)}</p><div class="note-box">目标人群假设：${esc(INDUSTRIES[b.industry].audience)}。<br>${state.evidence.length?'已补充 '+state.evidence.length+' 项调研依据，仍需核实品牌与 campaign 的匹配关系。':'品牌与门店调研尚未完成；本段为行业模板，不代表客户确认的 brief。'}</div></div><div class="card padded"><h3>02 / 预算变化，组合跟着变</h3><p>同一套资源与价格规则，支持 100–500 万预算即时重组。</p><div class="mini-chart">${scenarios.map(s=>`<button class="bar ${b.budget===s.budget*10000?'current':''}" style="height:${Math.max(4,s.p.total/5000000*100)}%;border:0" data-budget="${s.budget}" aria-label="切换到 ${s.budget} 万预算"><span>${s.p.units||0} 个资源</span></button>`).join('')}</div><div class="scenario-labels">${scenarios.map(s=>'<span>'+s.budget+' 万</span>').join('')}</div></div></div><div class="page-card">${resourceTable()}</div><section class="card padded page-card"><div class="card-head"><h3 class="card-title">03 / 发布推荐与采购档位</h3><span class="tag gray">按当前已核实单价测算</span></div>${selectionTableMarkup(state,plan,esc)}${packagePlansMarkup(state,plan,esc)}<div class="note-box" style="margin-top:14px">甄选表按当前组合的资源与数量导出；采购档位按已选资源的单价与可售量顺序补齐，是档位测算，不是已锁定资源或最终报价。${state.demoMode?'当前为刊例测算，价格为测算假设。':''}</div></section><div class="quote-total"><span>04 / 含税报价合计<small style="display:block;margin-top:7px">媒介费 + 制作费 · ${plan.days} 天投放 · ${plan.periods} × 28 天计费周期</small></span><strong>¥${money(plan.total)}</strong></div><section class="card"><div class="card-head"><h3 class="card-title">05 / 从确认到结案，每一步有安排</h3><span class="tag gray">建议执行流程</span></div><div class="timeline">${[['投放前','档期复核与合同','红豆核对合同车、预定车和空车；锁定资源与价格口径。'],['上线前','画面与制作确认','客户确认物料、制作规格、审批和上刊计划。'],...campaignRanges(b).map((r,i)=>[r.start+' — '+r.end,'第 '+(i+1)+' 段投放与监测','按合同约定提交上刊凭证及监测材料，异常及时沟通。']),[b.end+' 后','结案与复盘','整理实际排期、监测照片与结案报告；补偿依合同执行。']].map(([d,t,p])=>`<div class="timeline-item"><span>${d}</span><strong>${t}</strong><p>${p}</p></div>`).join('')}</div></section><div class="page-grid page-card"><div class="card padded"><h3>06 / 提案准备度</h3>${checks().map(([label,ok,desc])=>`<div class="check-row ${ok?'':'warn'}">${icon(ok?'check':'info',14)}${label}<span class="right">${esc(desc)}</span></div>`).join('')}</div><div class="card padded"><h3>报价说明与交付边界</h3><p>报价按每段 28 天整期分别向上取整，分段间隔不计费，价格系数 ${b.discount.toFixed(2)}（客户折扣 ${(b.discount*10).toFixed(1)} 折）；制作费沿用每个资源一次计收口径，分段重复制作费用须另行确认。当前只接受已确认含税的价格。结算发票：${esc(invoiceLabel(b.invoice))}${plan.tax?`；按条款税率 ${plan.tax.rate}% 对含税合计做价税拆分：税额约 ¥${money(plan.tax.amount)}、不含税约 ¥${money(plan.tax.net)}（信息项，不重复加税）`:''}。必须经过地址：${b.spatial?.radius?.enabled?esc((b.spatial.radius.name||'已启用')+' · '+b.spatial.radius.coordinateSystem+' · '+b.spatial.radius.meters+' m'):'未启用'}。</p><div class="note-box">没有已验证人流与去重模型，不展示曝光、CPM 或转化承诺。2023 年人流仅可作历史参考。库存导入文件不是锁定凭证；误刊补偿、监测频次与退款等须以双方正式合同为准。</div></div></div>`;}

function detail(id){const row=state.records.find(r=>r.id===id||r.upstreamId===id||r.sourceResourceId===id),picked=plan.lines.find(r=>r.id===id);if(!row)return;modal('库存详情 · '+row.name,`<span class="tag">原表记录 · ${esc(row.sourceRef||row.source||'用户导入')}</span><div class="detail-grid">${[['线路',row.name],['运营公司',row.operator],['线路等级',row.grade],['媒体形式',row.format],['总车辆数（可售）',row.capacity],['保养影响容量',row.maintenance],['合同车数',row.contracted],['预定车数',row.reserved],['空位数',row.available],['可能续约数',row.renewal],['库存查询日期',row.snapshotDate],['可售开始',row.availableStart],['可售结束',row.availableEnd],['已确认28天单价',row.unitPrice],['制作费',row.production],['含税状态',row.priceIncludesTax===true?'已确认':null],['价格来源',row.priceSource],['来源文件',row.sourceFile||row.source]].map(([k,v])=>`<div><small>${k}</small><strong>${v===undefined||v===null||v===''?'未提供':esc(v)}</strong></div>`).join('')}</div><div class="button-row"><button class="btn dark" data-condition-resource="${esc(row.id)}">补充 / 修改已核实报价条件</button></div>${picked?`<div class="note-box">本次推荐 ${picked.quantity} 个，合计 ¥${money(picked.amount)}。</div>`:'<div class="note-box">尚未形成报价；缺失的价格与档期保持空白。</div>'}${(row.rateIds||[]).length?'<h4>关联刊例参考</h4><div class="button-row">'+row.rateIds.map(id=>{const rate=realRates.find(r=>r.id===id);return rate?'<button class="btn small" data-source-detail="rate" data-source-id="'+esc(id)+'">'+esc(rate.priceText+' / '+rate.periodText)+'</button>':'';}).join('')+'</div>':''}${(row.insightIds||[]).length?`<h4>关联的历史报告</h4><div class="button-row">${row.insightIds.map(id=>`<button class="btn small" data-insight="${esc(id)}">${esc(realInsights.find(i=>i.id===id)?.source||id)}</button>`).join('')}</div>`:''}${(row.coverageIds||[]).length?'<h4>关联的平台覆盖报告</h4><div class="button-row">'+row.coverageIds.map(id=>{const report=realCoverage.find(r=>r.id===id);return report?'<button class="btn small" data-coverage-open="'+esc(id)+'">'+esc(report.name)+'</button>':'';}).join('')+'</div>':''}<p>技术键：${esc(row.id)}。${esc(row.idOrigin||'本机导入标识。')}</p>`);}
function addPlace(){modal('添加门店 / 地标',`<form id="place-form"><div class="field"><label>名称</label><input name="name" required maxlength="80" placeholder="填写已核实的门店名称"></div><div class="two-fields"><div class="field"><label>经度（WGS84）</label><input name="lon" type="number" step="any" min="-180" max="180" required placeholder="填写已核实经度"></div><div class="field"><label>纬度（WGS84）</label><input name="lat" type="number" step="any" min="-90" max="90" required placeholder="填写已核实纬度"></div></div><div class="field"><label>圈选半径（米）</label><input name="radius" type="number" min="100" max="10000" step="100" required value="1500"></div><div class="note-box">坐标须与导入媒体使用同一坐标系。本原型不自动转换 GCJ-02 / BD-09；圈选仅按参考点直线距离计算。</div><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button class="btn dark" type="submit">添加并重新配单</button></div></form>`);}
function addEvidence(){modal('添加品牌调研依据',`<form id="evidence-form"><div class="field"><label>资料标题</label><input name="title" required maxlength="120" placeholder="官网门店查询 / 客户 brief / campaign 依据"></div><div class="field"><label>来源链接（可选，仅 http / https）</label><input name="url" type="url" placeholder="https://..."></div><div class="field"><label>关键发现与日期</label><textarea name="note" required maxlength="1500" placeholder="记录可以核实的事实、查询日期，以及对媒介选择的影响"></textarea></div><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button class="btn dark" type="submit">保存依据</button></div></form>`);}
function pricing(){modal('报价设置',`<form id="pricing-form"><div class="field"><label>销售确认的价格系数</label><input name="discount" type="number" min="0.01" max="1" step="0.01" value="${state.brief.discount}" required><div class="field-hint">1.00 = 刊例价；0.80 = 八折。仅作用于媒介费。</div></div><div class="note-box">单资源报价 = 28 天刊例价 × 各分段计费期数之和 × 价格系数 + 单资源制作费。所有录入价格须确认含税；制作费按现有每资源一次口径计收，分段重复制作另行确认。实际刊例如按自然月、年度或其他口径，请先确认换算，不直接套用。</div><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button class="btn dark" type="submit">更新报价</button></div></form>`);}
let importKind='inventory';
function demoModeModal(){
  const coverage=demoCoverage(state.records,realRates,state.demoBasis||'mid');
  const selected=state.records.filter(r=>state.brief.media.includes(r.media)).length;
  const missing=coverage.total-coverage.priced;
  modal('按刊例区间生成测算稿',`<form id="demo-mode-form"><p>刊例测算用已公开的刊例区间，为仍缺少报价条件的库存补上测算价格、可售期和制作费，让媒体组合栏、配量和报价构成可以完整查看。</p><div class="note-box">只补充缺失字段：已人工核实的价格、档期、制作费和税口径不会被覆盖，库存原表与项目记录也不会被改写。测算数字不是成交价、不是合同锁档。价格来源：07-媒体刊例价.xlsx（30 条区间刊例；公交 S/A++/A+ 覆盖 429 条，地铁按接口等级映射）。</div><div class="import-summary"><div>库存记录<strong>${coverage.total}</strong></div><div>已有精确价格<strong>${coverage.priced}</strong></div><div>将补测算价格<strong>${missing}</strong></div></div><div class="two-fields"><div class="field"><label for="demo-basis">价格基准</label><select id="demo-basis" name="basis">${PRICE_BASES.map(item=>`<option value="${item.id}" ${(state.demoBasis||'mid')===item.id?'selected':''}>${item.label}</option>`).join('')}</select></div><div class="field"><label for="demo-metro-production">地铁制作费测算假设（元 / 口）</label><input id="demo-metro-production" name="metroProduction" type="number" min="0" step="1" value="${Number.isFinite(Number(state.demoMetroProduction))?Number(state.demoMetroProduction):DEMO_METRO_PRODUCTION}"><div class="field-hint">原表按 100 元/㎡ 计，无法换算成单口金额，因此需要明确测算假设。</div></div></div><div class="field"><div class="field-label">测算渠道 <small>至少一项</small></div><div class="media-options">${CHANNELS.map(({id,label})=>`<label class="media-option ${state.brief.media.includes(id)?'selected':''}"><input type="checkbox" name="media" value="${id}" ${state.brief.media.includes(id)?'checked':''}>${label}</label>`).join('')}</div><div class="field-hint">当前所选渠道共 ${selected} 条库存。</div></div><label class="work-confirm"><input type="checkbox" name="fillDates" checked> 若投放日期为空，填入 2027 年第一季度演示档期（2027-01-01 至 2027-03-31）</label><label class="work-confirm"><input type="checkbox" name="requireChannels" checked> 演示时每个所选渠道至少投放 1 个资源（写入“必投渠道”约束，可在空间与规则里取消）</label><div class="modal-actions"><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn dark">确认按刊例区间生成测算稿</button></div></form>`);
}
function setDemoMode(off){
  state.demoMode=!off;setMixExpanded(true);save();render();
  toast(off?'已退出刊例测算：正式报价仍需已核实条件':'刊例测算已载入：价格与档期为测算假设，非成交价');
}
// 一步报价：直接用 07 刊例价（区间中位）生成报价，档期为空时按 2027 Q1 试算。
function quickRateQuote(){
  if(!state.brief.start||!state.brief.end){
    state.brief.schedule={unit:'custom',mode:'continuous',ranges:[{start:'2027-01-01',end:'2027-03-31'}]};
    state.brief.start='2027-01-01';state.brief.end='2027-03-31';
  }
  state.demoMode=true;state.demoBasis='mid';setMixExpanded(true);save();render();
  const dates=scheduleSummary(state.brief);
  toast('已按 07 刊例价（区间中位）生成报价 · 档期 '+dates+'（可在左侧修改）');
}
async function loadImport(file){
  if(!file)return;if(file.size>10*1024*1024)return toast('文件超过 10MB 上限');
  try{let sheets;if(/\.xlsx$/i.test(file.name)){const res=await fetch('/api/import-xlsx',{method:'POST',body:file});const data=await res.json();if(!res.ok)throw new Error(data.error);sheets=data.sheets;}else if(/\.csv$/i.test(file.name)){let text=await file.text();if(text.includes('\uFFFD'))text=new TextDecoder('gb18030').decode(await file.arrayBuffer());sheets=[{name:'CSV',rows:parseCSV(text,{preserveBlankRows:true})}];}else throw new Error('请使用 CSV 或 XLSX 文件，旧版 XLS 请另存为 XLSX');
    pendingImport={filename:file.name,sheets,kind:importKind,index:0};
    if(importKind==='rates'&&sheets.some(sheet=>(sheet.rows[0]||[]).some(cell=>/区间化|发布期|制作费单价/.test(String(cell)))))throw new Error('这是区间刊例（如 07-媒体刊例价.xlsx），不能作为精确 28 天价直接导入；系统已内置为参考，请用“刊例测算”，或在资源详情中按刊例区间填入后再核实');showImportPreview(0);
  }catch(e){modal('无法导入文件','<div class="alert error">'+esc(e.message)+'</div><p>请核对字段模板和文件格式。原有数据未变更。</p>');}
}
function showImportPreview(index){
  pendingImport.index=Number(index);let result;try{result=pendingImport.kind==='inventory'&&pendingImport.mode==='upsert'?normalizeInventoryPatch(state.records,pendingImport.sheets[index].rows,pendingImport.filename):normalizeRows(pendingImport.sheets[index].rows,pendingImport.filename,pendingImport.kind);result.filename=pendingImport.filename;}catch(e){result={data:[],errors:[e.message],warnings:[],mapping:{}};}
  if(pendingImport.kind==='inventory'&&pendingImport.mode==='upsert'&&!result.errors.length){pendingImport.upsert=upsertInventory(state.records,result,pendingImport.sheets[index].rows);result.errors.push(...pendingImport.upsert.errors);}
  pendingImport.result=result;let merge=null;if(pendingImport.kind==='rates'&&!result.errors.length){merge=mergeRates(state.records,result.data);result.warnings.push(...merge.warnings,...merge.incomplete.map(row=>row.name+'：'+row.issues.join('、')));}pendingImport.merge=merge;
  modal('导入前，先确认数据',`<div class="field"><label>文件 / 工作表</label><select id="import-sheet">${pendingImport.sheets.map((s,i)=>`<option value="${i}" ${i===Number(index)?'selected':''}>${esc(s.name)}</option>`).join('')}</select><div class="field-hint">${esc(pendingImport.filename)}</div></div>${pendingImport.kind==='inventory'?'<div class="field"><label for="inventory-import-mode">库存导入方式</label><select id="inventory-import-mode"><option value="replace" '+(pendingImport.mode!=='upsert'?'selected':'')+'>整体替换（原有方式）</option><option value="upsert" '+(pendingImport.mode==='upsert'?'selected':'')+'>按编号更新，保留未提供记录</option></select><small>按编号更新时，空白保留原值，明确的0会更新；可只提供编号与坐标/行政区等列。</small></div>':''}<div class="import-summary"><div>数据记录<strong>${result.data.length}</strong></div><div>阻断错误<strong>${result.errors.length}</strong></div><div>提示 / 待核验<strong>${result.warnings.length}</strong></div></div>${result.errors.length||result.warnings.length?'<div class="import-errors">'+[...result.errors,...result.warnings].slice(0,25).map(esc).join('<br>')+(result.errors.length+result.warnings.length>25?'<br>仅展示前 25 项':'')+'</div>':'<div class="note-box">字段检查通过。导入不等于库存锁定或报价审批。</div>'}<p>${pendingImport.kind==='inventory'?(pendingImport.mode==='upsert'?'按稳定编号更新 '+(pendingImport.upsert?.updated.length||0)+' 条、新增 '+(pendingImport.upsert?.added.length||0)+' 条，其余记录保留；不自动清空缺省字段。':'确认后整体替换本机库存。已有品牌与门店信息保留。'):'将按编号或唯一的媒体类型 + 等级匹配价格；匹配 '+(merge?.matched||0)+' 条，其中 '+(merge?.incomplete.length||0)+' 条仍有库存、日期或计价条件缺口。未填写的确认字段保留原值。'}</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn dark" data-action="confirm-import" ${result.errors.length||!result.data.length?'disabled':''}>确认导入${icon('arrow',13)}</button></div>`);
}
function confirmImport(){if(!pendingImport||pendingImport.result.errors.length)return;const {result,kind,filename,merge}=pendingImport;if(kind==='inventory'){state.records=pendingImport.mode==='upsert'?pendingImport.upsert.data:result.data.map(linkImportedRecord);}else state.records=merge.data;state.imports.push({name:filename,type:kind==='inventory'?'库存':'刊例价',count:result.data.length,at:new Date().toLocaleString('zh-CN')});pendingImport=null;$('#modal').close();save();render();toast('导入完成，方案已按新数据重新计算');}
function requirePlan(){if(plan.errors.length||!plan.lines.length){toast('没有可导出的有效方案，请先检查输入及数据');return false;}return true;}
async function exportPptx(){if(!requirePlan())return;try{const presentation=closingReportPresentation(state,plan);const res=await fetch('/api/export-pptx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presentation})});if(!res.ok)throw new Error((await res.json()).error);download('新云投放结案报告'+(state.demoMode?'_刊例测算':'')+'.pptx',await res.blob(),'application/vnd.openxmlformats-officedocument.presentationml.presentation');toast(state.demoMode?'结案报告已导出（刊例测算标识已写入，非成交价）':'结案报告已导出，含执行、监测与数据口径说明');}catch(e){toast('结案报告导出失败：'+e.message);}}
async function exportXlsx(){if(!requirePlan())return;try{const res=await fetch('/api/export-xlsx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheets:quoteSheets(state,plan)})});if(!res.ok)throw new Error((await res.json()).error);download('新云投放提案'+(state.demoMode?'_刊例测算':'')+'.xlsx',await res.blob());toast(state.demoMode?'Excel 已导出（工作表含刊例测算标识，非成交价）':'Excel 已导出，含清单、报价口径与证据');}catch(e){toast('Excel 导出失败：'+e.message);}}
function restoreProject(file){
  if(!file)return;if(file.size>10*1024*1024)return toast('项目文件超过 10MB');
  file.text().then(t=>{
    const obj=JSON.parse(t);
    if(![1,2].includes(obj.version)||!obj.state||!Array.isArray(obj.state.records)||obj.state.records.length>5000)throw new Error('不是有效的项目备份');
    const candidate=obj.state; if(candidate.records.some(r=>r.demo===true||String(r.id).startsWith('DEMO-')))throw new Error('该备份包含已移除的内置样例，请使用真实数据备份');
    if(!candidate.brief||!Object.hasOwn(INDUSTRIES,candidate.brief.industry)||!Array.isArray(candidate.brief.media)||candidate.brief.media.some(m=>!CHANNELS.some(c=>c.id===m)))throw new Error('项目需求字段无效');
    validateStoredBrief(candidate.brief,{allowDraft:true});
    if(candidate.briefDraft?.before?.brief)validateStoredBrief(candidate.briefDraft.before.brief,{allowDraft:true});
    candidate.records=normalizeProjectRecords(candidate.records);candidate.places=normalizePlaces(candidate.places);candidate.hypothesis=normalizeHypothesis(candidate.hypothesis);candidate.delivery=normalizeDelivery(candidate.delivery);
    candidate.evidence=(Array.isArray(candidate.evidence)?candidate.evidence:[]).filter(e=>typeof e.title==='string'&&(!e.url||/^https?:\/\//i.test(e.url)));
    if(!Array.isArray(candidate.imports))candidate.imports=[];
    state={...structuredClone(initial),...candidate};state.brief.brand=String(state.brief.brand||'');state.brief.goal=String(state.brief.goal||'');state.brief.discount=Number(state.brief.discount);state.brief.budget=Number(state.brief.budget);
    save();render();toast('项目备份已恢复');
  }).catch(e=>toast('恢复失败：'+e.message));
}
async function aiStrategy(){modal('生成 AI 策略草稿',`<p>将发送当前行业、预算、目标和你填写的调研摘要给服务器配置的模型服务。不会发送账号、原始库存或价格明细。</p><div class="note-box">模型仅辅助解释策略。不能自行生成未核实的门店、线路、价格、人流、覆盖率或效果保证。</div><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn dark" data-action="run-ai">发送摘要并生成</button></div>`);}
async function runAI(button){button.disabled=true;button.textContent='正在生成…';try{const res=await fetch('/api/strategy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({industry:state.brief.industry,brand:state.brief.brand,budget:state.brief.budget,goal:state.brief.goal,evidence:state.evidence.map(e=>({title:e.title,note:e.note})).slice(0,10)})});const result=await res.json();if(!res.ok)throw new Error(result.error);state.strategyText=result.text;state.strategySource='model';save();$('#modal').close();render();toast('AI 草稿已生成，请人工核实后用于提案');}catch(e){button.disabled=false;button.textContent='重试生成';const msg=document.createElement('p');msg.className='alert';msg.textContent=e.message;$('.modal-body').prepend(msg);}}
document.addEventListener('click',async event=>{const el=event.target.closest('button,[data-detail]');if(!el||el.disabled)return;
  if(el.dataset.listToggle){const v=listView(el.dataset.listToggle);v.collapsed=!v.collapsed;refreshResourceTable('[data-list-toggle]');return;}
  if(el.dataset.listPage){const card=el.closest('[data-list-key]');listView(card.dataset.listKey).page=Number(el.dataset.listPage);refreshResourceTable('.page-position');return;}
  if(el.dataset.materialType){openMaterial(el.dataset.materialType,el.dataset.materialId);return;}
  if(el.dataset.materialKind){materialsKind=el.dataset.materialKind;materialsPage=1;$('#materials-results').innerHTML=materialsResults();$('#materials-results [data-material-kind="'+materialsKind+'"]').focus({preventScroll:true});return;}
  if(el.dataset.materialPage){materialsPage=Number(el.dataset.materialPage);$('#materials-results').innerHTML=materialsResults();$('.material-page-position').focus({preventScroll:true});return;}
  if(el.dataset.page){page=el.dataset.page;tableFilter='all';search='';resetListPages();render();window.scrollTo({top:0,behavior:'smooth'});return;}
  if(el.dataset.budget){state.brief.budget=Number(el.dataset.budget)*10000;save();render();toast('预算已调整为 '+el.dataset.budget+' 万，媒体组合已更新');return;}
  if(el.dataset.insight){insightDetail(el.dataset.insight);return;}if(el.dataset.resourceInsights){const r=state.records.find(x=>x.id===el.dataset.resourceInsights);modal('线路报告 · '+r.name,'<p>'+esc(r.trafficStatus||'各报告分别核对，不累加人数')+'</p>'+insightsTable(realInsights.filter(i=>(r.insightIds||[]).includes(i.id))));return;}if(el.dataset.detail){detail(el.dataset.detail);return;}
  if(el.dataset.filter){tableFilter=el.dataset.filter;resetListPages();refreshResourceTable('[data-filter="'+tableFilter+'"]');return;}
  if(el.dataset.map){mapFilter=el.dataset.map;render();return;}
  if(el.dataset.datedSource){const source=realInventorySnapshots.find(s=>s.id===el.dataset.datedSource);if(source){pendingImport={filename:source.source,sheets:[{name:'CSV',rows:source.rows}],kind:'inventory',index:0};showImportPreview(0);}return;}
  if(el.dataset.import){importKind=el.dataset.import;$('#import-file').click();return;}
  if(el.dataset.template){download(el.dataset.template==='inventory'?'库存字段模板.csv':'刊例价字段模板.csv',toCSV([el.dataset.template==='inventory'?INVENTORY_HEADERS:RATE_HEADERS]),'text/csv;charset=utf-8');return;}
  if(el.dataset.removePlace){state.places=state.places.filter(p=>p.id!==el.dataset.removePlace);save();render();return;}
  if(el.dataset.removeEvidence!==undefined){state.evidence.splice(Number(el.dataset.removeEvidence),1);save();render();return;}
  if(el.dataset.demoQuick!==undefined){quickRateQuote();return;}
  if(el.dataset.demoMode==='on'){demoModeModal();return;}
  if(el.dataset.demoMode==='off'){setDemoMode(true);return;}
  if(el.dataset.mixGap!==undefined){el.dataset.action='excluded';}
  if(el.dataset.ratioClear!==undefined){state.brief.constraints||={};delete state.brief.constraints.busShare;delete state.brief.constraints.shareTolerance;delete state.brief.constraints.shareHard;save();render();return;}
  if(el.dataset.addressRadius){const meters=Number(el.dataset.addressRadius);state.brief.spatial||={};state.brief.spatial.radius={...(state.brief.spatial.radius||{}),enabled:true,meters};save();render();return;}
  const action=el.dataset.action;
  if(action?.startsWith('review-')){await exportReview(action.slice(7));return;}
  if(action==='close')$('#modal').close();
  if(action==='run-campaign-ai'){await runCampaignAI(el);return;}
  if(action==='load-metro-catalog'){const result=appendMissingMetro(state,{force:true});save();render();toast('已补充 '+result.added+' 条真实地铁站口；原有报价条件不变');return;}
  if(action==='save')save(false);
  if(action==='undo-brief-import'){undoBriefImport();return;}
  if(action==='generate'&&state.briefDraft){confirmImportedBrief();return;}
  if(action==='generate'){save();render();toast(plan.errors.length?'请修正需求输入后重试':'推荐已更新：'+plan.lines.length+' 项媒体，¥'+wan(plan.total)+' 万');}
  if(action==='preview'){page='proposal';render();document.body.classList.add('presentation');window.scrollTo(0,0);}
  if(action==='exit-presentation'){document.body.classList.remove('presentation');}
  if(action==='clear-materials'){materialsQuery='';materialsKind='all';materialsPage=1;$('#materials-query').value='';$('#materials-results').innerHTML='';$('#materials-query').focus();}
  if(action==='excluded'){const excluded=currentExclusions();modal('逐资源报价条件检查','<p>以下列出所选渠道的具体缺口。客户投放日期等需求仍须单独完成。</p>'+(excluded.length?'<ul class="evidence-list">'+excluded.map(r=>'<li><div><strong>'+esc(r.name)+'</strong><p>'+esc((r.issues||[r.reason]).join('；'))+'</p><button class="btn small" data-condition-resource="'+esc(r.id)+'">补充已核实条件</button></div></li>').join('')+'</ul>':'<div class="note-box">所选渠道没有资料条件排除项；如无推荐，请检查预算、客户输入与库存。</div>'));}
  if(action==='add-place')addPlace();if(action==='add-evidence')addEvidence();if(action==='pricing')pricing();if(action==='confirm-import')confirmImport();
  if(action==='export-csv'&&requirePlan()){download('投放方案清单'+(state.demoMode?'_刊例测算':'')+'.csv',toCSV(quoteSheets(state,plan)[0].rows),'text/csv;charset=utf-8');toast(state.demoMode?'方案清单已导出 CSV（含刊例测算标识）':'方案清单已导出 CSV');}
  if(action==='export-xlsx')await exportXlsx();
  if(action==='export-pptx')await exportPptx();
  if(action==='export-html'&&requirePlan()){const exportState=state.demoMode?{...state,records:demoInventory(state.records,realRates,state.brief,{basis:state.demoBasis||'mid',metroProduction:Number.isFinite(Number(state.demoMetroProduction))?Number(state.demoMetroProduction):DEMO_METRO_PRODUCTION}).records}:state;download('新云互动提案'+(state.demoMode?'_刊例测算':'')+'.html',exportHTML(exportState),'text/html;charset=utf-8');toast(state.demoMode?'独立 HTML 已导出（刊例测算标识已写入，离线可调预算）':'独立 HTML 已导出，离线打开可调整预算');}
  if(action==='inventory-export')download('当前库存.csv',toCSV(inventoryMatrix(state.records)),'text/csv;charset=utf-8');
  if(action==='export-project')download('新云项目备份.json',JSON.stringify({version:2,state},null,2),'application/json');
  if(action==='import-project')$('#project-file').click();
  if(action==='print')window.print();
  if(action==='reset')modal('恢复文件数据',`<p>这会用 data 目录生成的真实库存替换当前浏览器库存，清空本地需求与调研。可先备份当前项目。</p><div class="modal-actions"><button class="btn" data-action="close">取消</button><button class="btn" data-action="export-project">先导出备份</button><button class="btn orange" data-action="confirm-reset">确认重置</button></div>`);
  if(action==='confirm-reset'){state=structuredClone(initial);state.sourceVersion=dataManifest.version;save();$('#modal').close();render();toast('已恢复用户文件数据');}
  if(action==='ai-strategy')aiStrategy();if(action==='run-ai')await runAI(el);
});
document.addEventListener('input',event=>{const target=event.target;if(target.dataset?.ratioShare){const other=document.querySelector('[data-ratio-share="'+(target.dataset.ratioShare==='bus'?'metro':'bus')+'"]');if(other&&target.value!==''&&Number(target.value)>=0&&Number(target.value)<=100)other.value=String(Math.round((100-Number(target.value))*10)/10);}if(target.dataset?.commerce==='discount'){const output=target.closest('.discount-input')?.querySelector('output');if(output&&Number.isFinite(Number(target.value)))output.textContent=(Number(target.value)/10).toFixed(2)+' 系数';}if(target.id==='materials-query'){materialsQuery=target.value;materialsPage=1;$('#materials-results').innerHTML=materialsResults();}if(target.id==='budget'){state.brief.budget=+target.value*10000;$('#budget-output').textContent=target.value;document.querySelectorAll('[data-budget]').forEach(b=>b.classList.toggle('active',Number(b.dataset.budget)*10000===state.brief.budget));}if(target.id==='resource-search'){search=target.value;resetListPages();const card=$('.resource-card');if(card)listView(card.dataset.listKey).collapsed=false;$('#resource-results').innerHTML=resourceTable();}});
document.addEventListener('change',async event=>{const el=event.target;
  if(el.dataset?.commerce){
    const key=el.dataset.commerce;
    try{
      if(key==='discount'){const zhe=Number(el.value);if(!Number.isFinite(zhe)||zhe<1||zhe>10)throw new Error('客户折扣须为 1–10 折');state.brief.discount=Math.round(zhe*100)/1000;}
      else if(key==='invoiceType'){const type=['none','special','general'].includes(el.value)?el.value:'none';state.brief.invoice={...(state.brief.invoice||{}),type};if(type==='none'){state.brief.invoice.taxRate=0;state.brief.invoice.source='';}else if(!Number(state.brief.invoice.taxRate))state.brief.invoice.taxRate=6;}
      else if(key==='taxRate')state.brief.invoice={...(state.brief.invoice||{}),taxRate:Number(el.value)};
      else if(key==='taxSource')state.brief.invoice={...(state.brief.invoice||{}),source:el.value.trim()};
      save();render();
    }catch(error){toast(error.message);}
    return;
  }
  if(el.dataset?.address){
    const key=el.dataset.address,s=state;
    s.brief.spatial||={};
    const radius={...(s.brief.spatial.radius||{})};
    if(key==='enabled')radius.enabled=el.checked;
    else if(key==='name')radius.name=el.value.trim();
    else if(key==='coordinateSystem')radius.coordinateSystem=el.value;
    else if(key==='lon'||key==='lat'||key==='meters')radius[key]=el.value===''?null:Number(el.value);
    else if(key==='source')radius.source=el.value.trim();
    s.brief.spatial.radius=radius;
    save();
    if(key==='enabled'&&el.checked){const verified=(s.brief.spatial.mappings||[]).filter(mapping=>mapping.verified===true||mapping.verifiedAt).length;if(!verified)toast('已启用必须经过地址，但当前没有已核实空间关系，组合会被阻断');}
    render();
    return;
  }
  if(el.dataset?.ratioShare!==undefined||el.dataset?.ratioTolerance!==undefined||el.dataset?.ratioHard!==undefined){
    const constraints=state.brief.constraints||(state.brief.constraints={});
    if(el.dataset.ratioShare!==undefined){
      const busValue=document.querySelector('[data-ratio-share="bus"]')?.value??'';
      const metroValue=document.querySelector('[data-ratio-share="metro"]')?.value??'';
      if(busValue===''&&metroValue===''){delete constraints.busShare;delete constraints.shareTolerance;delete constraints.shareHard;}
      else{let bus=Number(busValue),metro=Number(metroValue);if(busValue!==''&&metroValue==='')metro=100-bus;if(metroValue!==''&&busValue==='')bus=100-metro;if(!Number.isFinite(bus)||bus<0||bus>100||!Number.isFinite(metro)||metro<0||metro>100){toast('配比须为 0–100 的数字');return;}if(Math.abs(bus+metro-100)>0.01){toast('公交与地铁占比之和须为 100%');return;}constraints.busShare=bus;}
    }
    if(el.dataset.ratioTolerance!==undefined)constraints.shareTolerance=Number(el.value)||0;
    if(el.dataset.ratioHard!==undefined)constraints.shareHard=el.checked;
    save();render();
    return;
  }
  if(el.id==='budget'){recalc();$('#live-output').innerHTML=workbenchView(state,plan,dashboard,esc);if($('#readiness'))$('#readiness').outerHTML=steps();save();return;}if(el.dataset.listSize){const v=listView(el.dataset.listSize);v.size=Number(el.value);v.page=1;refreshResourceTable('[data-list-size]');return;}if(el.dataset.brief){state.brief[el.dataset.brief]=el.value;if(['start','end'].includes(el.dataset.brief)&&state.brief.schedule){state.brief.schedule={unit:'custom',mode:'continuous',ranges:[{start:state.brief.start,end:state.brief.end}]};}if(el.dataset.brief==='industry'){state.strategyText='';state.strategySource='';}save();if(state.briefDraft)refreshBriefDraft();else render();}if(el.dataset.media){state.brief.media=[...document.querySelectorAll('[data-media]:checked')].map(x=>x.dataset.media);if(state.brief.media.length<2&&state.brief.constraints){delete state.brief.constraints.busShare;delete state.brief.constraints.shareTolerance;delete state.brief.constraints.shareHard;}save();if(state.briefDraft)refreshBriefDraft();else render();}if(el.id==='import-file')await loadImport(el.files[0]);if(el.id==='project-file')restoreProject(el.files[0]);if(el.id==='import-sheet')showImportPreview(el.value);if(el.id==='inventory-import-mode'){pendingImport.mode=el.value;showImportPreview(pendingImport.index);}});
document.addEventListener('submit',event=>{const f=event.target;if(f.id==='materials-search-form'){event.preventDefault();$('#materials-results').hidden=false;materialsPage=1;$('#materials-results').innerHTML=materialsResults();return;}if(!['place-form','evidence-form','pricing-form','demo-mode-form'].includes(f.id))return;event.preventDefault();const data=Object.fromEntries(new FormData(f));
  if(f.id==='demo-mode-form'){const chosen=[...new Set(new FormData(f).getAll('media').filter(m=>CHANNELS.some(c=>c.id===m)))];if(!chosen.length){toast('刊例测算至少选择一个渠道');return;}const metroProduction=Number(data.metroProduction);if(!Number.isFinite(metroProduction)||metroProduction<0){toast('地铁制作费测算假设须为非负数');return;}state.brief.media=chosen;state.demoBasis=PRICE_BASES.some(b=>b.id===data.basis)?data.basis:'mid';state.demoMetroProduction=metroProduction;if(data.requireChannels==='on'){state.brief.constraints={...(state.brief.constraints||{}),requiredMedia:chosen};}if(data.fillDates==='on'&&(!state.brief.start||!state.brief.end)){state.brief.schedule={unit:'custom',mode:'continuous',ranges:[{start:'2027-01-01',end:'2027-03-31'}]};state.brief.start='2027-01-01';state.brief.end='2027-03-31';}state.demoMode=true;setMixExpanded(true);document.getElementById('modal').close();save();render();toast('刊例测算已载入：价格为测算假设，非成交价，正式报价仍需核价核档');return;}
  if(f.id==='place-form'){if(!data.name.trim())return toast('请填写门店名称');state.places.push({id:'p-'+Date.now(),name:data.name.trim(),lat:+data.lat,lon:+data.lon,radius:+data.radius});}if(f.id==='evidence-form'){if(data.url&&!/^https?:\/\//i.test(data.url))return toast('来源只支持 http / https 链接');state.evidence.push({title:data.title.trim(),url:data.url.trim(),note:data.note.trim()});}if(f.id==='pricing-form')state.brief.discount=+data.discount;save();$('#modal').close();render();toast('已保存并更新方案');});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.body.classList.remove('presentation');if((event.key==='Enter'||event.key===' ')&&event.target.matches('g[data-detail]')){event.preventDefault();detail(event.target.dataset.detail);}});
function sourceOverview(){return `<section class="card padded"><h3>源文件概览</h3><div class="source-status">${icon('bus',18)}<div><strong>公交车身媒体库存</strong><small>${dataManifest.inventoryCount} 条 · 原表总容量 ${money(dataManifest.summary.totalCapacity)} 辆<br>原表合同车 ${money(dataManifest.summary.contracted)} 辆</small></div></div><div class="source-status">${icon('chart',18)}<div><strong>2023 年 5 月历史画像</strong><small>${realInsights.length} 份报告 · ${dataManifest.summary.withInsights} 条库存有同名报告<br>${dataManifest.summary.distinctInsightGroups} 组数据 · 多报告不取单一人流值</small></div></div><button class="btn small" data-page="coverage">查看人流明细 ${icon('arrow',12)}</button></section>`;}

function insightsTable(reports=realInsights){return `<div class="table-scroll"><table class="data-table insights-table"><thead><tr><th>表内线路 / 点位</th><th>累计人次（原表）</th><th>累计人数（原表）</th><th>库存关联</th><th></th></tr></thead><tbody>${reports.map(r=>`<tr><td><strong>${esc(r.route)}</strong><small>${esc(r.media==='metro'?'地铁出入口':'公交')} · ${esc(r.month)} · ${esc(r.source)}</small></td><td>${esc(r.visitsDisplay)}</td><td>${esc(r.peopleDisplay)}</td><td>${r.matchedIds.length?'关联 '+r.matchedIds.length+' 条库存':'未关联库存的来源'}<small>${r.duplicateOf?'同内容的来源另有保留':''}</small></td><td><button class="btn small" data-insight="${esc(r.id)}">查看明细</button></td></tr>`).join('')}</tbody></table></div>`;}

function insightDetail(id){const r=realInsights.find(x=>x.id===id);if(!r)return;const group=(title,items)=>`<h4>${title}</h4><div class="profile-bars">${items.map(x=>{const max=Math.max(...items.map(i=>i.value||0),1);return `<div class="profile-bar"><span>${esc(x.label)}</span><i style="--fill:${(x.value||0)/max*100}%"></i><strong>${x.value===null?'未提供':money(x.value)}</strong></div>`;}).join('')}</div>`;modal('历史画像 · '+r.route,`<span class="tag">${esc(r.month)} · 原表明细</span><p>${esc(r.source)}<br>${esc(r.sourceRef)}</p><div class="detail-grid"><div><small>累计人次（保留原表文本）</small><strong>${esc(r.visitsDisplay)}</strong></div><div><small>累计人数（保留原表文本）</small><strong>${esc(r.peopleDisplay)}</strong></div><div><small>关联库存</small><strong>${r.matchedIds.length?r.matchedIds.map(id=>state.records.find(x=>x.id===id)?.name||id).map(esc).join('、'):'无同名库存，保留该来源'}</strong></div><div><small>手机品牌（原表）</small><strong>${esc(r.phoneBrand)}</strong></div></div>${group('指定时段客流量（原表值）',r.timeSlots)}${group('年龄画像（原表值）',r.age)}${group('性别画像（原表值）',r.gender)}${group('个人消费水平（原表值）',r.consumption)}${group('扩展 POI 覆盖数量',Object.entries(r.poi).map(([label,value])=>({label,value})))}<div class="note-box">这是 2023 年 5 月的所选区域历史数据，不是当前广告曝光。${r.duplicateOf?'这份与另一个来源内容相同，原文件均保留，不重复累计。':''}</div>`);}

function reviewExportTools(){return '<details class="review-exports"><summary>导出资料核对稿（不含报价）</summary><p>可带走真实库存、原始刊例、人流与点位资料。正式报价仍须核实完整条件。</p><div class="button-row"><button class="btn" data-action="review-html">HTML 核对稿</button><button class="btn" data-action="review-xlsx">Excel 核对稿</button><button class="btn" data-action="review-csv">库存核对 CSV</button></div></details>';}
async function exportReview(kind){const sources={rates:realRates,insights:realInsights,pois:realPOIs,coverage:realCoverage,manifest:dataManifest};try{if(kind==='html')download('新云资料核对稿_不含报价.html',reviewHTML(state,sources),'text/html;charset=utf-8');else if(kind==='csv')download('资料核对_库存清单_非报价.csv',reviewCSV(state),'text/csv;charset=utf-8');else{const response=await fetch('/api/export-xlsx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheets:reviewSheets(state,sources)})});if(!response.ok)throw new Error((await response.json()).error);download('新云资料核对稿_不含报价.xlsx',await response.blob());}toast('已导出资料核对稿，不含推荐报价');}catch(error){toast('资料核对稿导出失败：'+error.message);}}
function proposalPending(){if(state.briefDraft)return '<section class="card padded"><h3>客户需求待整体确认</h3><p>导入内容已自动填入左侧需求表单。确认后再生成提案。</p><button class="btn dark" data-page="studio">查看并确认需求</button>'+reviewExportTools()+'</section>';return '<section class="card padded proposal-empty"><div class="empty-heading">'+icon('file',24)+'</div><h3>当前尚未形成报价方案</h3><p>已加载 '+state.records.length+' 条真实库存和 '+realInsights.length+' 份历史人流报告。区间刊例与来源点位已经载入。精确成交价、含税口径、可售档期和客户门店仍需确认。</p><div class="note-box">按实际资料确定客户、投放档期与报价条件后再计算媒体组合。已导入区间刊例与周边点位资料，未代填精确单价、实际可售日期或客户门店。</div><div class="button-row" style="margin-top:20px"><button class="btn dark" data-page="resources">查看真实库存</button><button class="btn" data-page="coverage">查看历史人流</button><button class="btn" data-page="data">管理源文件</button></div>'+reviewExportTools()+'</section>';}

function linkImportedRecord(row){const known=realInventory.filter(r=>r.name===row.name&&r.operator===row.operator&&r.grade===row.grade&&r.format===row.format);const id=known.length===1&&String(row.id).startsWith('inventory-')?known[0].id:row.id;const keys=String(row.name).split('/').map(x=>x.replace(/路$/,''));return {...row,id,sourceResourceId:known.length===1?known[0].id:row.sourceResourceId,rateIds:known.length===1?(known[0].rateIds||[]):[],coverageIds:known.length===1?(known[0].coverageIds||[]):[],insightIds:realInsights.filter(r=>r.media===row.media&&keys.includes(r.route.replace(/路$/,''))).map(r=>r.id)};}


function briefImportTools(){
  const pending=state.briefDraft;
  return `<div class="brief-import-tools"><button class="btn intake-open" data-intake-action="open">${icon('upload',13)}导入客户需求${icon('arrow',12)}</button><small>粘贴 / 上传 → 自动填入 → 整体确认</small>${!pending&&state.briefImport?'<button class="btn subtle intake-receipt" data-intake-action="receipt">查看最近确认记录 ↗</button>':''}</div>${pending?`<div class="brief-draft-banner" role="status"><strong>${icon('check',13)}已自动填入 · 待整体确认</strong><p>直接查看、修改下方需求，完成后点击底部确认按钮。</p>${pending.warnings.length?`<details class="brief-draft-warnings"><summary>${pending.warnings.length} 条识别提示</summary><p>${pending.warnings.map(esc).join('<br>')}</p></details>`:''}<div class="button-row"><button class="btn subtle" data-intake-action="source">查看导入原文</button><button class="btn subtle" data-action="undo-brief-import">撤销本次导入</button></div></div><div id="brief-confirm-errors" class="intake-errors" role="alert" hidden></div>`:''}`;
}
function refreshBriefDraft(){
  recalc();if($('#live-output'))$('#live-output').innerHTML=workbenchView(state,plan,dashboard,esc);if($('#readiness'))$('#readiness').outerHTML=steps();if($('#schedule-editor'))$('#schedule-editor').outerHTML=scheduleForm(state.brief,plan,esc,icon);
  document.querySelectorAll('[data-media]').forEach(el=>el.closest('.media-option')?.classList.toggle('selected',el.checked));
  if($('#brief-confirm-errors'))$('#brief-confirm-errors').hidden=true;
}
function briefExtraFields(){
  const fields=BRIEF_FIELDS.filter(f=>['audience','areas','locations','quantity','monitoring','settlement','deadline','notes'].includes(f.key));
  if(!state.briefDraft&&!fields.some(f=>state.brief[f.key]))return '';
  return `<details class="brief-extra"><summary>补充需求 · 人群、区域、门店与备注</summary>${fields.map(f=>`<div class="field"><label for="brief-extra-${f.key}">${f.label}</label><textarea id="brief-extra-${f.key}" data-brief="${f.key}" maxlength="4000">${esc(state.brief[f.key]||'')}</textarea></div>`).join('')}</details>`;
}
function confirmImportedBrief(){
  const pending=state.briefDraft;if(!pending)return;
  if(pending.campaignSource){const status=hypothesisStatus(state.brief,state.hypothesis);if(status.missing.length){page='campaign';render();toast('请补齐假设书缺项，再整体确认：'+status.missing.join('、'));return;}}
  const errors=validateBrief(state.brief);
  if(!state.brief.brand.trim())errors.unshift('请填写目标品牌');
  if(errors.length){const box=$('#brief-confirm-errors');box.hidden=false;box.textContent=errors.join('；');box.scrollIntoView({block:'nearest',behavior:'smooth'});toast('请在左侧补充或修正提示内容，再整体确认');return;}
  const applied={},before={};
  for(const field of BRIEF_FIELDS){if(state.brief[field.key]!==undefined){applied[field.key]=structuredClone(state.brief[field.key]);before[field.key]=pending.before.brief[field.key]??null;}}
  const sources=pending.sources||[{source:pending.source,text:pending.rawText}];
  const receipt={document:pending.document||null,source:sources.map(s=>s.source).join(' + '),rawText:sources.map(s=>s.source+'\n'+s.text).join('\n\n'),confirmedAt:new Date().toISOString(),before,applied,pending:[]};
  state.briefImport=receipt;delete state.briefDraft;
  const summary=BRIEF_FIELDS.filter(f=>applied[f.key]!==undefined&&applied[f.key]!=='').map(f=>f.label+'：'+(f.key==='budget'?applied[f.key]/10000+' 万元':f.key==='media'?applied[f.key].map(mediaName).join('、'):f.key==='schedule'?scheduleSummary({schedule:applied.schedule,start:applied.start,end:applied.end}):applied[f.key])).join('\n');
  state.evidence=state.evidence.filter(e=>e.kind!=='confirmed-brief');
  state.evidence.push({kind:'confirmed-brief',title:'人工确认的客户需求 · '+state.brief.brand,note:'来源：'+receipt.source+'\n人工确认时间：'+new Date(receipt.confirmedAt).toLocaleString('zh-CN')+'\n'+summary,url:''});
  save();render();toast(plan.lines.length?'需求已整体确认，推荐方案已生成':'需求已整体确认；当前库存仍缺少可报价条件，暂无有效报价');
}
function undoBriefImport(){
  const before=state.briefDraft?.before;if(!before)return;
  state.brief=structuredClone(before.brief);if(before.hypothesis)state.hypothesis=before.hypothesis;if(before.delivery)state.delivery=before.delivery;state.strategyText=before.strategyText;state.strategySource=before.strategySource;
  delete state.briefDraft;save();render();toast('已撤销本次导入，恢复导入前的需求');
}
installBriefImport({
  getState:()=>state,modal,toast,download,esc,icon,
  stage:extracted=>{
    const prepared=prepareBriefDraft(state.brief,extracted);
    if(!Object.keys(prepared.patch).length)throw new Error(prepared.warnings.join('；')||'没有可自动填入的有效需求字段');
    const previous=state.briefDraft;
    const before=previous?.before||{brief:structuredClone(state.brief),strategyText:state.strategyText,strategySource:state.strategySource};
    const sources=[...(previous?.sources||[]),{source:extracted.source,text:extracted.text}];
    state.brief=prepared.brief;
    state.briefDraft={source:extracted.source,rawText:extracted.text,warnings:prepared.warnings,document:extracted.document||null,before,sources,importedKeys:Object.keys(prepared.patch)};
    state.strategyText='';state.strategySource='';
    page='studio';tableFilter='all';search='';resetListPages();save();render();
  }
});

window.addEventListener('beforeprint',()=>{printing=true;render();});
window.addEventListener('afterprint',()=>{printing=false;render();});
installCampaignUI({getState:()=>state,render,save,toast,modal,download,runAI:()=>openCampaignAI(),confirmBrief:()=>{if(state.briefDraft)confirmImportedBrief();},stageProvided:source=>{const previous=state.briefDraft;const before=previous?.before||{brief:structuredClone(state.brief),hypothesis:structuredClone(state.hypothesis||{}),delivery:structuredClone(state.delivery||{}),strategyText:state.strategyText,strategySource:state.strategySource};state.brief={...state.brief,...structuredClone(source.brief),fees:{execution:{status:'included',assumed:true,source:'用户假设书约定：执行已含制作，不含创意设计；需核实合同'},monitoring:{status:'unknown',amount:null,source:''}}};delete state.brief.schedule;state.hypothesis=normalizeHypothesis(source.hypothesis);state.delivery=normalizeDelivery(source.delivery);state.strategyText='';state.strategySource='';state.briefDraft={campaignSource:true,source:source.source,rawText:'用户提供的一页假设书；已自动填入明确需求，原文测算差异保留在核对区。',before,warnings:['机构规模、单一campaign主目标待补充','原文人次、CPM、预算余量与12周时长存在口径差异；未导入任何价格或库存'],sources:[{source:source.source,text:'原文件保留；按审查结果形成需求核对稿。'}],importedKeys:Object.keys(source.brief)};save();toast('已填入用户假设书；请补主目标与规模依据，再整体确认');}});
if(sourceRefreshed)save();
installQuoteUI({getState:()=>state,modal,save,render,toast,esc,referencePrice,rates:realRates});
projectLibrary=installLibraryUI({getState:()=>state,setState:next=>{state=next;appendMissingMetro(state);page='studio';},save,render,modal,toast,esc,baseline:realInventory,sourceVersion:dataManifest.version,initial,exportHTML,stageParameters:source=>{const before={brief:structuredClone(state.brief),strategyText:state.strategyText,strategySource:state.strategySource};const fields=['industry','budget','media','goal','audience','areas','locations','notes'];for(const key of fields)if(source.brief[key]!==undefined)state.brief[key]=structuredClone(source.brief[key]);state.briefDraft={source:'本机历史方案参数',rawText:fields.map(key=>key+'：'+JSON.stringify(source.brief[key]??'')).join('\n'),warnings:['只借鉴需求意向，未继承资源锁定、审批、监测状态或完成证据'],before,sources:[],importedKeys:fields};page='studio';save();render();}});
installWorkbenchUI({getState:()=>state,getPlan:()=>plan,save,render,toast,modal,esc,download,getRepository:()=>projectLibrary.repository});

installSourceUI({modal,esc});
installCoverageUI({modal,esc,getRecords:()=>state.records});
installSchedule({getBrief:()=>state.brief,setBrief:b=>state.brief=b,changed:()=>{save();render();}});
render();
if(restoreNotice)toast(restoreNotice);

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#modal').open){event.preventDefault();$('#materials-query')?.focus();$('#materials-results').hidden=true;}});
document.addEventListener('input',event=>{if(event.target.id==='materials-query')$('#materials-results').hidden=false;});
document.addEventListener('focusin',event=>{if(event.target.id==='materials-query')$('#materials-results').hidden=false;});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.materials-search')&&!event.target.closest('#modal'))$('#materials-results').hidden=true;});

let campaignAIPayload=null,campaignAIJob=0;
function openCampaignAI(){
  campaignAIJob++;const h=normalizeHypothesis(state.hypothesis),b=state.brief;
  campaignAIPayload=safeBriefReviewInput({industry:b.industry,budgetBand:b.budget<=1000000?'100万档':b.budget<=2000000?'100–200万档':'200–500万档',businessGoal:h.businessGoal||b.goal,campaignGoal:h.campaignGoal,audience:h.audience||b.audience,area:h.area||b.areas,kpi:h.kpi,proof:h.proof,evidence:h.evidence});
  const issues=campaignReview(state,plan).checks.filter(c=>c.status!=='pass');
  modal('需求检查 · 发送前预览','<p>模型只给缺项和矛盾建议，不会更改需求、库存或金额。下列内容将发送至已配置的模型服务，请先检查是否可对外发送。</p><details><summary>查看待发送的匿名摘要</summary><pre class="campaign-ai-preview">'+esc(JSON.stringify(campaignAIPayload,null,2))+'</pre></details><div id="campaign-ai-result"><h4>本地规则检查（非模型结果）</h4><ul>'+issues.map(c=>'<li>'+esc(c.label+'：'+c.evidence)+'</li>').join('')+'</ul></div><div class="modal-actions"><button class="btn" data-action="close">关闭</button><button class="btn dark" data-action="run-campaign-ai">发送摘要并使用模型检查</button></div>');
}
async function runCampaignAI(button){
  const job=campaignAIJob;button.disabled=true;button.textContent='正在检查…';
  try{const response=await fetch('/api/brief-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(campaignAIPayload)}),data=await response.json();if(job!==campaignAIJob||!$('#modal').open||!$('#campaign-ai-result'))return;if(!response.ok)throw new Error(data.error||'模型检查暂不可用');
    const r=data.result;$('#campaign-ai-result').innerHTML='<h4>模型生成 · 需人工核实</h4><p>'+esc(r.summary)+'</p>'+[['missing','缺项'],['conflicts','矛盾'],['questions','建议追问']].map(([key,label])=>'<h4>'+label+'</h4><ul>'+(r[key]||[]).map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>').join('')+'<p>结果仅在当前弹窗展示，不写入项目备份，不自动覆盖任何字段。</p>';
  }catch(error){if(job!==campaignAIJob||!$('#modal').open||!$('#campaign-ai-result'))return;const note=document.createElement('p');note.className='alert';note.textContent=error.message+'。当前保留的是本地规则结果，非模型生成。';$('#campaign-ai-result').prepend(note);}
  finally{if(button.isConnected){button.disabled=false;button.textContent='重新使用模型检查';}}
}
