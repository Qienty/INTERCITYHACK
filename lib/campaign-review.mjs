import {calculatePlan,validateBrief} from './engine.mjs';
import {channelName,scheduleSummary} from './campaign.mjs';
import {quoteFees,feeDescription} from './fees.mjs';
import {hypothesisStatus,normalizeHypothesis,normalizeDelivery,providedSourceAudit,publicProposalState} from './hypothesis.mjs';

export function campaignPlan(state){
  const p=calculatePlan(state.records,state.brief,state.places||[]);
  return state.briefDraft?{...p,lines:[],total:0,media:0,production:0,execution:0,monitoring:0,units:0,remaining:state.brief.budget,districts:[],mediaCounts:{},coveredPlaces:0,errors:['客户需求尚未整体确认']}:p;
}

export function proposalCoverage(records){
  return {bus:records.filter(r=>r.media==='bus').length,metro:records.filter(r=>r.media==='metro').length,priced:records.filter(r=>Number.isFinite(r.unitPrice)&&r.unitPrice>0).length,dated:records.filter(r=>r.availableStart&&r.availableEnd).length,located:records.filter(r=>Number.isFinite(r.lon)&&Number.isFinite(r.lat)).length,reported:records.filter(r=>r.insightIds?.length).length};
}
export function allocationDiff(before,after){
  const old=new Map(before.lines.map(r=>[r.id,r])),next=new Map(after.lines.map(r=>[r.id,r])),rows=[];
  for(const id of new Set([...old.keys(),...next.keys()])){const a=old.get(id),b=next.get(id),prior=a?.quantity||0,current=b?.quantity||0;rows.push({id,name:b?.name||a.name,before:prior,after:current,delta:current-prior,amountDelta:Math.round(((b?.amount||0)-(a?.amount||0))*100)/100});}
  return {rows,added:rows.filter(r=>r.delta>0),reduced:rows.filter(r=>r.delta<0),retained:rows.filter(r=>r.delta===0),totalDelta:Math.round((after.total-before.total)*100)/100};
}
export function campaignReview(state,plan){
  const b=state.brief,h=normalizeHypothesis(state.hypothesis),d=normalizeDelivery(state.delivery),status=hypothesisStatus(b,h),fees=quoteFees(b),coverage=proposalCoverage(state.records);
  const channels=['bus','metro'].map(media=>({media,amount:plan.lines.filter(r=>r.media===media).reduce((s,r)=>s+r.amount,0)})).filter(x=>x.amount>0).sort((a,c)=>c.amount-a.amount);
  const main=channels[0]?.media||'',mix=channels.map((x,i)=>channelName(x.media)+'：'+(i?'补充':'实际主投')+'，¥'+x.amount.toFixed(2)).join('；');
  const responses=status.elements.map(e=>({...e,answer:[
    (h.publicMode?h.publicName:b.brand)||'客户未填写',
    h.businessGoal||b.goal||'生意目标未填写',
    h.campaignGoal?(h.campaignGoal+'；组合采用库存、档期、价格与现有行业规则，不承诺该目标的实际转化效果'):'主目标待选择',
    '目标区域：'+(h.area||b.areas||'未填写')+'；已录入客户地标 '+(state.places?.length||0)+' 个；'+(h.coverageEvidence||'覆盖分析证据待补充'),
    scheduleSummary(b)+'；'+plan.days+' 天，'+plan.periods+' 个28天计费期；当前草稿 ¥'+plan.total.toFixed(2)+' / 预算 ¥'+Number(b.budget).toFixed(2),
    mix||'当前尚无已核实可报价组合；不会用来源报告冒充库存',
    (h.kpi||'KPI待选择')+'；'+(h.proof||'验收证据待填写')+'；历史人流不直接等于未来曝光或去重触达'
  ][e.id-1],evidence:e.id===4?h.coverageEvidence:e.id===5?h.stockEvidence:e.id===7?h.metricEvidence:h.evidence}));
  if(h.sourceAudit)responses.push(
    {id:'H1',label:'H1 人群在动线上',value:'通勤动线与目标人群匹配',answer:h.coverageEvidence||'仅有人群与区域意向，尚缺覆盖分析、线路动线与客户地标证据',evidence:h.coverageEvidence},
    {id:'H2',label:'H2 商圈选对且够密',value:'原文三商圈、每圈至少两台、集中度不超过45%',answer:'实际入选 '+plan.lines.length+' 行、'+plan.units+' 个资源；商圈归属与覆盖不能由行政区或名称推断，原文阈值尚需逐资源验证',evidence:h.coverageEvidence},
    {id:'H3',label:'H3 效果与CPM口径',value:'原文1054万人次、CPM164.5',answer:'按原文参数简式复算1026万人次；媒体费口径169.01、全案口径185.19。仅为未核实假设复算，当前实际报价草稿¥'+plan.total.toFixed(2)+'；不据此承诺未来效果',evidence:h.metricEvidence},
    {id:'H4',label:'H4 档期与投放节奏',value:'原文分月45%/25%/30%，12周与Q1并列',answer:scheduleSummary(b)+'；当前'+plan.days+'天、'+plan.periods+'个28天计费期。全部资源共用排期，原文分月比例未自动用于分资源进退场',evidence:h.stockEvidence},
    {id:'H5',label:'H5 归因与交付边界',value:'投放证明与开户效果分开',answer:h.proof||'需补上刊、巡检、下刊和结案证明；开户/核销等结果投后回收，不承诺单点直接归因',evidence:d.source}
  );
  const hasPlan=plan.lines.length>0&&!plan.errors.length;
  const checks=[
    {id:1,label:'客户任务与七要素',status:status.missing.length?'warn':status.confirmed?'pass':'warn',evidence:status.missing.length?'缺少：'+status.missing.join('、'):status.confirmed?'已整体确认；仍不等于事实证据已核实':'内容已填写，尚待整体确认'},
    {id:2,label:'行业、预算、渠道、日期',status:validateBrief(b).length?'fail':'pass',evidence:validateBrief(b).join('；')||'四项输入已通过范围和格式检查'},
    {id:3,label:'门店 → 覆盖 → 线路 → 空位',status:hasPlan&&h.coverageEvidence.trim()&&h.stockEvidence.trim()?'pass':'warn',evidence:(h.coverageEvidence||'缺覆盖分析证据')+'；'+(h.stockEvidence||'缺按档期查询的库存依据')},
    {id:4,label:'主次与选择理由',status:hasPlan&&(!h.mediaPriority||main===h.mediaPriority)?'pass':'warn',evidence:mix||'尚未形成组合；意向主投不代表实际已经分配'},
    {id:5,label:'费用拆分与预算',status:!hasPlan?'warn':fees.pending.length?'warn':fees.errors.length?'fail':'pass',evidence:[feeDescription(fees,'execution'),feeDescription(fees,'monitoring'),hasPlan?'总价 ¥'+plan.total.toFixed(2)+'，余量 ¥'+plan.remaining.toFixed(2):'报价条件待核实'].join('；')},
    {id:6,label:'可售期与实际排期',status:hasPlan&&plan.lines.every(r=>r.snapshotDate)&&h.stockEvidence?'pass':'warn',evidence:hasPlan?'入选资源已通过所填可售期校验；'+(h.stockEvidence||'仍缺实时查询依据，快照不等于资源锁定'):'无可报价资源，不能声明排期可执行'},
    {id:7,label:'效果口径与交付证明',status:h.kpi&&h.proof&&h.metricEvidence?'pass':'warn',evidence:h.metricEvidence||'缺效果口径依据；上刊照片只能证明投出，不证明开户转化'},
    {id:8,label:'施工、天气、替换与补偿',status:['workWindow','capacity','weather','replacement','compensation','source'].every(k=>d[k].trim())&&!/待核实|待确认|尚非/.test(d.source+' '+d.capacity+' '+d.compensation)?'pass':'warn',evidence:d.source||'执行条件及合同依据待确认；不代填施工产能或补偿天数'},
    {id:9,label:'预算变化与复用',status:hasPlan?'pass':'warn',evidence:hasPlan?'同一引擎支持100/200/500万重算，差分同时列增加、减少和保留':'引擎可重算，当前数据仍不足以演示有效配单'},
    {id:10,label:'离线HTML现场运行',status:h.runtimeReviewed?'pass':'warn',evidence:h.runtimeReviewed?'人工记录：已现场验证离线交互；更改数据后请复验':'已提供离线预算重算能力，仍须人工打开导出物现场验证'},
    {id:11,label:'对外资料脱敏',status:h.privacyReviewed?'pass':'warn',evidence:h.privacyReviewed?'人工记录：已检查对外展示内容；系统不自动判定真实客户或真实成交价':'原要求存在研究品牌与对外实名口径冲突，须人工检查并确认允许的展示范围'},
    {id:12,label:'当前资料范围',status:'pass',evidence:'载入公交 '+coverage.bus+' 条 / 地铁 '+coverage.metro+' 条；有精确价 '+coverage.priced+' 条 / 有日期 '+coverage.dated+' 条 / 有坐标 '+coverage.located+' 条；是本地资料完整度，不是全系统覆盖率'}
  ];
  return {status,fees,coverage,responses,checks,main,mix,delivery:d,sourceAudit:h.sourceAudit?providedSourceAudit():null};
}
export function campaignScenarios(state,base){
  return [100,200,500].map(budget=>{const plan=campaignPlan({...state,brief:{...state.brief,budget:budget*10000}});return {budget,plan,diff:allocationDiff(base,plan)};});
}
export function campaignSheets(input,plan){
  const state=publicProposalState(input),model=campaignReview(state,plan),h=state.hypothesis,d=model.delivery;
  const sheets=[
    {name:'campaign假设书',rows:[['要素','当前内容','状态'],...model.status.elements.map(e=>[e.label,e.value||'待填写',e.complete?'已填写':'待完善']),['总体状态',model.status.confirmed?'已整体确认':'草稿，未确认或输入已变化','缺项及回应仍须核验'],['判断依据',h.evidence||'待填写','不把假设标成事实']]},
    {name:'假设回应',rows:[['要素','假设书内容','方案回应','依据'],...model.responses.map(r=>[r.label,r.value,r.answer,r.evidence||'待补'])]},
    {name:'监测与风险',rows:[['类别','当前约定或待核实事项'],...Object.entries({posting:'上刊',inspection:'在刊',removal:'下刊',closing:'结案',replacement:'替换',workWindow:'施工窗口',capacity:'施工产能',weather:'天气与备用窗口',compensation:'误刊补偿',source:'依据'}).map(([key,label])=>[label,d[key]||'待确认']),['执行费',feeDescription(model.fees,'execution')],['监测费',feeDescription(model.fees,'monitoring')]]},
    {name:'提交自检',rows:[['序号','自检项','状态','证据或缺口'],...model.checks.map(c=>[c.id,c.label,c.status==='pass'?'通过已列条件':c.status==='fail'?'阻断':'待核验',c.evidence]),['说明','自动检查与人工记录不是评委分数，也不构成资源锁定','','']]}
  ];
  if(model.sourceAudit){const a=model.sourceAudit;sheets.push({name:'原始假设复算',rows:[['项目','原文或复算结果','口径'],['文件性质','用户提供材料的算术核对，非库存、报价或未来效果承诺','原文值不写入库存'],['原文人次',a.claimedVisits,'原文缺逐项依据'],['按原文假设复算人次',a.visits,'(7×36万+1×90万)×3'],['人次差额',a.visitDifference,'原文值减简式复算值'],['媒体费口径CPM',a.mediaCPM,'用1026万人次复算，不代表实测效果'],['全案口径CPM',a.projectCPM,'用190.01万元与1026万人次复算'],['总预算余量（元）',a.budgetRemaining,'相对200万元'],['红线内余量（元）',a.limitRemaining,'相对196万元'],['另行保留额度（元）',a.reserved,'200万与196万差额'],['Q1天数',a.days,'12周为84天；90天按28天整期计4期']]});}
  return sheets;
}
