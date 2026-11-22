import {channelName,campaignRanges,scheduleSummary} from './campaign.mjs';
import {validDate} from './engine.mjs';

export const CAMPAIGN_GOALS=['认知','到店','促销','拉新'];
export const CAMPAIGN_KPIS=['覆盖人次','触达频次','到店扫码量','开户/核销量（投后回收）','投放交付验收'];
export function normalizeHypothesis(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('假设书格式无效');
  const result={};
  for(const key of ['researchBrand','publicName','clientProfile','brandScale','businessGoal','campaignGoal','audience','area','mediaPriority','kpi','proof','evidence','coverageEvidence','stockEvidence','metricEvidence','sourceLabel','confirmedFingerprint','confirmedAt'])result[key]=String(input[key]??'').slice(0,6000);
  if(result.campaignGoal&&!CAMPAIGN_GOALS.includes(result.campaignGoal))throw new Error('假设书主目标无效');
  if(result.kpi&&!CAMPAIGN_KPIS.includes(result.kpi))throw new Error('假设书 KPI 口径无效');
  if(result.mediaPriority&&!['bus','metro'].includes(result.mediaPriority))throw new Error('假设书主投渠道无效');
  result.publicMode=input.publicMode===true;result.privacyReviewed=input.privacyReviewed===true;result.runtimeReviewed=input.runtimeReviewed===true;
  if(input.sourceAudit===true)result.sourceAudit=true;
  return result;
}
export function hypothesisElements(brief,h={}){
  const text=value=>String(value??'').trim(),media=Array.isArray(brief.media)?brief.media:[];
  return [
    {id:1,label:'① 客户与品牌',value:[h.publicMode?h.publicName:brief.brand,h.clientProfile,h.brandScale].filter(Boolean).join('；'),complete:!!text(brief.brand)&&!!text(h.clientProfile)&&!!text(h.brandScale),response:'品牌与生意任务'},
    {id:2,label:'② 生意目标',value:h.businessGoal||brief.goal||'',complete:!!text(h.businessGoal||brief.goal),response:'品牌任务与投放目标'},
    {id:3,label:'③ campaign 主目标',value:h.campaignGoal||'',complete:CAMPAIGN_GOALS.includes(h.campaignGoal),response:'主目标与媒体取舍'},
    {id:4,label:'④ 人群与区域',value:[h.audience||brief.audience,h.area||brief.areas].filter(Boolean).join('；'),complete:!!text(h.audience||brief.audience)&&!!text(h.area||brief.areas),response:'门店/地标与覆盖证据'},
    {id:5,label:'⑤ 时间与预算',value:scheduleSummary(brief)+'；'+Number(brief.budget)/10000+' 万元（含税）',complete:Number(brief.budget)>=1000000&&Number(brief.budget)<=5000000&&!!brief.start&&!!brief.end&&campaignRanges(brief).every(r=>validDate(r.start)&&validDate(r.end)&&r.start.startsWith('2027-')&&r.end.startsWith('2027-')&&r.start<=r.end),response:'日期、计费周期与预算拆分'},
    {id:6,label:'⑥ 媒体与主次',value:media.map(channelName).join('、')+(h.mediaPriority?'；意向主投 '+channelName(h.mediaPriority):''),complete:media.length>0&&media.includes(h.mediaPriority),response:'实际媒体组合与主次'},
    {id:7,label:'⑦ 成功衡量',value:[h.kpi,h.proof].filter(Boolean).join('；'),complete:CAMPAIGN_KPIS.includes(h.kpi)&&!!text(h.proof),response:'效果边界、监测与验收'}
  ];
}
export function hypothesisFingerprint(brief,h={}){
  const clean={};for(const key of ['brand','industry','budget','media','start','end','schedule','goal','audience','areas','fees'])clean[key]=brief[key]??null;
  const copy=normalizeHypothesis(h);delete copy.confirmedAt;delete copy.confirmedFingerprint;delete copy.runtimeReviewed;delete copy.privacyReviewed;
  const value=JSON.stringify([clean,copy]);let a=2166136261,c=2246822519;
  for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);c=Math.imul(c^value.charCodeAt(i),3266489917);}
  return 'v1-'+value.length+'-'+(a>>>0).toString(16)+'-'+(c>>>0).toString(16);
}
export function hypothesisStatus(brief,h={}){
  const elements=hypothesisElements(brief,h),missing=elements.filter(e=>!e.complete).map(e=>e.label);
  const confirmed=!!h.confirmedFingerprint&&h.confirmedFingerprint===hypothesisFingerprint(brief,h);
  return {elements,missing,complete:elements.length-missing.length,confirmed,stale:!!h.confirmedFingerprint&&!confirmed};
}
export function normalizeDelivery(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('执行方案格式无效');
  return Object.fromEntries(['posting','inspection','removal','closing','replacement','workWindow','capacity','weather','compensation','source'].map(k=>[k,String(input[k]??'').slice(0,4000)]));
}
export function publicProposalState(state){
  const h=normalizeHypothesis(state.hypothesis),b={...state.brief};
  const confirmed=!state.briefDraft&&hypothesisStatus(b,h).confirmed;
  if(h.publicMode)b.brand=h.publicName.trim()||'未填写对外客户名';
  // Internal research names, original source text and import receipts do not enter HTML payloads.
  delete h.researchBrand;delete h.confirmedFingerprint;
  if(confirmed)h.confirmedFingerprint=hypothesisFingerprint(b,h);
  return {execution:state.execution||{},monitoring:state.monitoring||{},brief:b,records:state.records,places:state.places||[],evidence:(state.evidence||[]).filter(e=>e.kind!=='confirmed-brief'||!h.publicMode),strategyText:h.publicMode?'':state.strategyText||'',strategySource:state.strategySource||'',hypothesis:h,delivery:normalizeDelivery(state.delivery),demoMode:!!state.demoMode};
}

// This is the user's supplied PDF, not example inventory or a confirmed quote.
export const PROVIDED_CAMPAIGN={
  source:'用户提供的 campaign 假设书 · 2026-11-21',
  brief:{industry:'银行保险',brand:'某银行上海分行',budget:2000000,media:['bus','metro'],start:'2027-01-01',end:'2027-03-31',goal:'个人养老金开户推广，连接通勤认知与网点/App承接',audience:'上海主城区 30–50 岁个税纳税通勤人群',areas:'陆家嘴、静安寺、徐家汇'},
  hypothesis:{researchBrand:'招商银行上海分行',publicName:'某银行上海分行',publicMode:true,clientProfile:'银行保险行业；上海分行零售条线',brandScale:'',businessGoal:'个人养老金开户推广，连接通勤认知与网点/App 开户承接',campaignGoal:'',audience:'30–50 岁个税纳税通勤人群',area:'陆家嘴、静安寺、徐家汇',mediaPriority:'bus',kpi:'覆盖人次',proof:'上刊照片 → 在刊巡检 → 下刊照片 → 结案报告；开户和扫码结果投放后回收，不承诺单点直接归因',evidence:'来源为用户提供的一页假设书；机构规模、主目标、资源及人流口径尚需核实。主投公交按原文媒体费65%推定，需整体确认。',sourceLabel:'用户提供的 campaign 假设书 · 2026-11-21',sourceAudit:true},
  delivery:{posting:'当日逐台/逐口上刊照片，带时间水印及上刊清单',inspection:'投放期每月一次巡检，异常点位当日反馈',removal:'下刊后5个工作日内提供下刊照片',closing:'投放结束后10个工作日提交结案报告',replacement:'同商圈同等级候选替换，价格、实际展示天数及新档期另行复核，不自动锁定',workWindow:'仅夜间作业；具体可用时间待施工方确认',capacity:'原文计划7台公交、1口地铁拆为2–3个夜间批次；实际数量与施工产能待核实',weather:'雨天停工，预留两个备用夜间窗口；原文要求1月20日前完成上刊，需与实际分月方案核对',compensation:'原文约定我方延误按延误天数2倍补刊；具体责任范围、资源及补刊档期须核实合同',source:'用户提供的一页假设书中的建议交付条件，尚非已签合同'},
  assumptions:{busUnits:7,metroUnits:1,busMonthly:360000,metroMonthly:900000,months:3,claimedVisits:10540000,media:1734000,production:58500,total:1900100,spendLimit:1960000,claimedBuffer:59900,claimedCPM:164.5}
};
export function providedSourceAudit(){
  const a=PROVIDED_CAMPAIGN.assumptions,visits=(a.busUnits*a.busMonthly+a.metroUnits*a.metroMonthly)*a.months;
  return {visits,claimedVisits:a.claimedVisits,visitDifference:a.claimedVisits-visits,mediaCPM:a.media/visits*1000,projectCPM:a.total/visits*1000,claimedMediaCPM:a.media/a.claimedVisits*1000,claimedProjectCPM:a.total/a.claimedVisits*1000,budgetRemaining:PROVIDED_CAMPAIGN.brief.budget-a.total,limitRemaining:a.spendLimit-a.total,reserved:PROVIDED_CAMPAIGN.brief.budget-a.spendLimit,days:90,weeksDays:84,periods:4};
}
