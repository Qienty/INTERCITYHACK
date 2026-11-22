export function operationBasis(plan,brief){return JSON.stringify({lines:plan.lines.map(r=>[r.id,r.media,r.quantity]).sort(),ranges:plan.segments?.map(r=>[r.start,r.end])||[],selection:brief.selection||{}});}
export function operationDays(start,end,closed=[]){const result=[];if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))return result;let at=Date.parse(start),last=Date.parse(end);if(!Number.isFinite(at)||!Number.isFinite(last)||new Date(at).toISOString().slice(0,10)!==start||new Date(last).toISOString().slice(0,10)!==end||last<at||(last-at)/86400000>730)return result;for(;at<=last;at+=86400000){const date=new Date(at).toISOString().slice(0,10);if(!closed.includes(date))result.push(date);}return result;}
const shiftDate=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
// 建议施工窗口：上刊放在投放开始前 7 天内完成，下刊放在投放结束后 3 天内完成。
// 只是建议值，必须按真实的前后客户占用、进场许可和班组产能核对后才能确认。
export function suggestedWindows(plan){
  return Object.fromEntries((plan.segments||[]).map((segment,index)=>[index,{installStart:shiftDate(segment.start,-7),installEnd:shiftDate(segment.start,-1),removeStart:shiftDate(segment.end,1),removeEnd:shiftDate(segment.end,3)}]));
}
// 测算模式一键条件：数值与窗口均为测算假设，来源字段明确写明，真实项目必须替换。
export function demoConstructionSettings(plan){
  const windows=suggestedWindows(plan);
  return {capacities:{bus:4,metro:2},reserveNights:1,source:'刊例测算：示例班组与施工窗口，非真实许可；真实项目必须替换',closedDates:[],windows:Object.fromEntries(Object.entries(windows).map(([index,window])=>[index,{...window,permitConfirmed:true}])),confirmed:true,handoff:{workWindow:'22:00–06:00',nightConfirmed:true,prePressDays:3,prePressSource:'测算假设：客户定稿与审批前置天数',photoDelayDays:1,source:'刊例测算：上下刊流程与监拍时效假设'}};
}
export function generateConstruction(plan,brief,settings={}){
  const errors=[],tasks=[],daily=new Map(),basis=operationBasis(plan,brief);
  if(!plan.lines.length||plan.errors.length)errors.push('先形成满足报价与组合约束的媒体清单');
  if(settings.confirmed!==true||!settings.source)errors.push('班组产能及施工许可窗口须有核实来源并确认');
  if((settings.closedDates||[]).some(date=>!operationDays(date,date).length))errors.push('停工日期包含无效日期');
  if(!Number.isSafeInteger(settings.reserveNights)||settings.reserveNights<0)errors.push('请明确备用夜晚数（可为0）');
  for(const media of [...new Set(plan.lines.map(r=>r.media))])if(!Number.isSafeInteger(settings.capacities?.[media])||settings.capacities[media]<=0)errors.push((media==='bus'?'公交':'地铁')+'每夜产能须为正整数');
  for(const [i,segment]of (plan.segments||[]).entries()){
    const window=settings.windows?.[i];if(!window||window.permitConfirmed!==true){errors.push('第'+(i+1)+'段施工及前后占用许可窗口未确认');continue;}
    if(window.installEnd>segment.start||window.removeStart<segment.end)errors.push('第'+(i+1)+'段上刊截止不可晚于投放开始，下刊开始不可早于投放结束');
    for(const phase of ['install','remove'])if(!operationDays(window[phase+'Start'],window[phase+'End'],settings.closedDates).length)errors.push('第'+(i+1)+'段'+(phase==='install'?'上刊':'下刊')+'窗口没有有效施工日期');
  }
  if(errors.length)return {tasks:settings.tasks||[],basis:settings.basis||'',errors};
  for(const [i,segment]of plan.segments.entries())for(const phase of ['install','remove']){
    const window=settings.windows[i],days=operationDays(window[phase+'Start'],window[phase+'End'],settings.closedDates),usable=days.slice(0,Math.max(0,days.length-settings.reserveNights));
    for(const row of plan.lines){let remaining=row.quantity,batch=0;for(const date of usable){const key=date+'|'+row.media,capacity=settings.capacities[row.media]-(daily.get(key)||0),quantity=Math.min(remaining,capacity);if(quantity<=0)continue;tasks.push({id:i+'|'+phase+'|'+row.id+'|'+batch++,segment:i,phase,resourceId:row.id,name:row.name,media:row.media,quantity,date,owner:'',manual:false});daily.set(key,(daily.get(key)||0)+quantity);remaining-=quantity;if(!remaining)break;}if(remaining)errors.push(row.name+'第'+(i+1)+'段'+(phase==='install'?'上刊':'下刊')+'还缺 '+remaining+' 个施工产能');}
  }
  const manual=new Map((settings.tasks||[]).filter(t=>t.manual).map(t=>[t.id,t]));for(let i=0;i<tasks.length;i++)if(manual.has(tasks[i].id)){tasks[i]={...manual.get(tasks[i].id),requiresReview:settings.basis!==basis};manual.delete(tasks[i].id);}for(const row of manual.values())tasks.push({...row,requiresReview:true});
  return {tasks,basis,errors};
}
export function constructionReview(plan,brief,settings={}){
  const errors=[],tasks=settings.tasks||[],basis=operationBasis(plan,brief),ids=new Set(),counts=new Map(),daily=new Map();
  if(!tasks.length)return {errors:['施工计划尚未生成'],stale:false,complete:false};
  const stale=settings.basis!==basis;if(stale)errors.push('媒体数量、档期或选择意向已变化，施工计划须重新核对');
  for(const task of tasks){
    if(ids.has(task.id))errors.push('重复施工任务：'+task.id);ids.add(task.id);
    const row=plan.lines.find(r=>r.id===task.resourceId),segment=plan.segments?.[task.segment],window=settings.windows?.[task.segment];
    if(!row||!segment){errors.push(task.name+'：已不在当前媒体清单或投放分段中');continue;}
    if(!['install','remove'].includes(task.phase)||!Number.isSafeInteger(task.quantity)||task.quantity<=0){errors.push(task.name+'：任务类型或数量无效');continue;}
    if(!window?.permitConfirmed||!operationDays(window[task.phase+'Start'],window[task.phase+'End'],settings.closedDates).includes(task.date))errors.push(task.name+'：日期不在已许可施工日历中');
    if((task.phase==='install'&&task.date>segment.start)||(task.phase==='remove'&&task.date<segment.end))errors.push(task.name+'：施工日期与广告投放期冲突');
    if(task.requiresReview)errors.push(task.name+'：保留的人工调整行尚未重新确认');
    const key=task.segment+'|'+task.phase+'|'+task.resourceId;counts.set(key,(counts.get(key)||0)+task.quantity);const dayKey=task.date+'|'+row.media;daily.set(dayKey,(daily.get(dayKey)||0)+task.quantity);
  }
  for(const [i]of (plan.segments||[]).entries())for(const phase of ['install','remove'])for(const row of plan.lines){const count=counts.get(i+'|'+phase+'|'+row.id)||0;if(count!==row.quantity)errors.push(row.name+'第'+(i+1)+'段'+(phase==='install'?'上刊':'下刊')+'排了 '+count+'，应排 '+row.quantity);}
  for(const [key,count]of daily){const media=key.split('|')[1];if(!settings.confirmed||!settings.source||!Number.isSafeInteger(settings.capacities?.[media])||count>settings.capacities[media])errors.push(key+'：超出已确认产能，或产能未核实');}
  return {errors:[...new Set(errors)],stale,complete:errors.length===0};
}
export function generateMonitoring(plan,brief,delivery={},execution={},monitoring={}){
  const nodes=[],basis=operationBasis(plan,brief),config=monitoring.config||{},after=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
  for(const [i,segment]of (plan.segments||[]).entries()){
    for(const [type,title,defaultDate,requirement]of [['posting','上刊凭证',segment.start,delivery.posting],['removal','下刊凭证',segment.end,delivery.removal]]){
      const phase=type==='posting'?'install':'remove',dates=(execution.tasks||[]).filter(t=>t.segment===i&&t.phase===phase).map(t=>t.date).sort();
      nodes.push({id:i+'|'+type,segment:i,type,title:'第'+(i+1)+'段'+title,date:dates.at(-1)||defaultDate,deliverable:requirement||'',owner:'',acceptance:'',status:'待执行',evidence:[],source:delivery.source||'',manual:false});
    }
    if(config.confirmed&&config.source&&Number.isSafeInteger(config.inspectionDays)&&config.inspectionDays>0){for(let offset=config.inspectionDays;offset<segment.days;offset+=config.inspectionDays)nodes.push({id:i+'|inspection|'+offset,segment:i,type:'inspection',title:'第'+(i+1)+'段巡检',date:after(segment.start,offset),deliverable:delivery.inspection||'',owner:'',acceptance:'',status:'待执行',evidence:[],source:config.source,manual:false});}
    if(config.confirmed&&config.source&&Number.isSafeInteger(config.reportDays)&&config.reportDays>=0)nodes.push({id:i+'|closing',segment:i,type:'closing',title:'第'+(i+1)+'段结案',date:after(segment.end,config.reportDays),deliverable:delivery.closing||'',owner:'',acceptance:'',status:'待执行',evidence:[],source:config.source,manual:false});
  }
  const previous=new Map((monitoring.nodes||[]).map(n=>[n.id,n]));for(let i=0;i<nodes.length;i++){const old=previous.get(nodes[i].id);if(old){nodes[i]={...nodes[i],...old,requiresReview:monitoring.basis!==basis};previous.delete(old.id);}}for(const node of previous.values())nodes.push({...node,requiresReview:true});return {nodes,basis};
}
export function monitoringReview(plan,brief,monitoring={}){
  const errors=[],nodes=monitoring.nodes||[],ids=new Set();if(!nodes.length)return {errors:['监测交付节点尚未生成'],complete:false};
  if(monitoring.basis!==operationBasis(plan,brief))errors.push('媒体或档期变化后，监测节点须重新核对');
  for(const node of nodes){if(ids.has(node.id))errors.push('重复节点：'+node.title);ids.add(node.id);if(!/^\d{4}-\d{2}-\d{2}$/.test(node.date||'')||!Number.isFinite(Date.parse(node.date))||new Date(node.date).toISOString().slice(0,10)!==node.date)errors.push(node.title+'：计划日期无效');if(!node.owner||!node.deliverable||!node.acceptance||!node.source)errors.push(node.title+'：责任方、交付物、验收方式或条款来源未明确');if(node.requiresReview)errors.push(node.title+'：人工修改节点待重新确认');if(['已提交','已验收'].includes(node.status)&&!node.evidence?.length)errors.push(node.title+'：缺少实际提交证据');if(node.status==='已验收'&&!node.acceptedBy)errors.push(node.title+'：缺少验收人');if(!['待执行','已提交','异常','已验收'].includes(node.status))errors.push(node.title+'：状态无效');}
  return {errors:[...new Set(errors)],complete:errors.length===0};
}
// 上下刊流程卡点：依据客户提供的《上下刊流程卡点说明》，把可以自动判断的环节列成检查，
// 其余环节通过人工风险登记维护。结论只针对当前已确认的排期、许可与监测条件。
export const RISK_CATEGORIES=['客户端','外部客观','内部运营','外包供应链'];
export function handoffReview(plan,brief,execution={},monitoring={}){
  const handoff=execution.handoff||{},checks=[];
  const add=(id,category,label,status,detail)=>checks.push({id,category,label,status,detail});
  const window=String(handoff.workWindow||'').trim();
  const windowValid=/^\d{1,2}:\d{2}\s*[–\-—~至]\s*\d{1,2}:\d{2}$/.test(window);
  add('night','内部运营','夜间作业窗口',handoff.nightConfirmed===true&&windowValid?'pass':'deviation',handoff.nightConfirmed===true&&windowValid?'已确认 '+window+' 夜间上下刊；白天不占道作业':'夜间窗口未确认或格式无效（示例 22:00–06:00）');
  const capacities=execution.capacities||{},media=[...new Set((plan.lines||[]).map(r=>r.media))];
  const capacityOk=media.length>0&&media.every(m=>Number.isSafeInteger(capacities[m])&&capacities[m]>0);
  add('capacity','外包供应链','单晚施工产能',capacityOk&&execution.confirmed===true?'pass':capacityOk?'pending':'pending',capacityOk?'已确认 '+media.map(m=>(m==='bus'?'公交 ':'地铁 ')+capacities[m]+(m==='bus'?' 台/夜':' 口/夜')).join('、')+'(产能来源：'+(execution.source||'未填写')+')':'每夜产能未确认，无法判断是否需要拆批');
  const reserve=execution.reserveNights;
  add('reserve','外部客观','雨天与延误备用窗口',Number.isSafeInteger(reserve)&&reserve>=1?'pass':Number.isSafeInteger(reserve)?'deviation':'pending',Number.isSafeInteger(reserve)?(reserve>=1?'备用 '+reserve+' 晚，可吸收雨天顺延与施工延误':'备用 0 晚，雨天顺延会直接挤压投放档期'):'备用夜晚未填写');
  const closed=Array.isArray(execution.closedDates)?execution.closedDates:[];
  add('closed','外部客观','明确停工日',closed.length?'pass':'pending',closed.length?'已列 '+closed.length+' 个停工日：'+closed.slice(0,4).join('、')+(closed.length>4?' 等':''):'未列停工日；若流程中确无固定停工日，可在配置中填写说明');
  const preDays=handoff.prePressDays;
  add('prepress','客户端','定稿→审批→制作前置',Number.isSafeInteger(preDays)&&preDays>=1&&handoff.prePressSource?'pass':Number.isSafeInteger(preDays)&&preDays>=1?'deviation':'pending',Number.isSafeInteger(preDays)&&preDays>=1?'前置 '+preDays+' 天'+ (handoff.prePressSource?'（'+handoff.prePressSource+'）':'，缺少依据来源'):'未确认客户定稿、内容审批与制作所需前置天数');
  const windows=execution.windows||{},segments=plan.segments||[];
  const permitOk=segments.length>0&&segments.every((_,i)=>windows[i]?.permitConfirmed===true);
  add('permit','内部运营','进场许可与前后占用',permitOk?'pass':'pending',permitOk?'各段施工窗口已确认前序客户占用与进场许可':'施工窗口的前后占用、进场许可尚未逐段确认');
  const tasks=execution.tasks||[],nodes=monitoring.nodes||[],photoDays=handoff.photoDelayDays;
  const installDates=tasks.filter(t=>t.phase==='install').map(t=>t.date).filter(Boolean).sort();
  const posting=nodes.filter(n=>n.type==='posting').map(n=>n.date).filter(Boolean).sort();
  const addDays=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
  let photoStatus='pending',photoDetail='监拍交付延迟未确认，或施工/监测节点尚未生成';
  if(Number.isSafeInteger(photoDays)&&installDates.length&&posting.length){
    const earliestPosting=posting[0],latestInstall=installDates.at(-1),expected=addDays(latestInstall,photoDays);
    photoStatus=earliestPosting>=expected?'pass':'deviation';
    photoDetail='外包监拍按'+(photoDays?'隔天（'+photoDays+' 天）':'当日')+'交付；上刊完成 '+latestInstall+'，最早上刊凭证 '+earliestPosting+(photoStatus==='deviation'?'，早于约定，可能无法出片':'');}
  add('photo','外包供应链','外包监拍交付延迟',photoStatus,photoDetail);
  add('handoff-source','内部运营','流程与交接依据',handoff.source?'pass':'deviation',handoff.source?'来源：'+handoff.source:'未填写上下刊流程、交接与监拍时效依据');
  return {checks,deviations:checks.filter(check=>check.status!=='pass'),complete:checks.every(check=>check.status==='pass')};
}
export function operationSheets(state,plan){
  const construction=constructionReview(plan,state.brief,state.execution),monitoring=monitoringReview(plan,state.brief,state.monitoring),handoff=handoffReview(plan,state.brief,state.execution,state.monitoring);
  return [{name:'施工任务',rows:[['任务ID','资源编号','线路/点位','分段','工序','日期','数量','责任方','人工调整','状态'],...(state.execution?.tasks||[]).map(t=>[t.id,t.resourceId,t.name,t.segment+1,t.phase==='install'?'上刊':'下刊',t.date,t.quantity,t.owner,t.manual?'是':'否',t.requiresReview?'待复核':'计划中'])]}, {name:'监测交付节点',rows:[['节点','分段','计划日期','交付物','责任角色','验收方式','状态','实际证据文件','条款来源','验收人','待复核'],...(state.monitoring?.nodes||[]).map(n=>[n.title,n.segment+1,n.date,n.deliverable,n.owner,n.acceptance,n.status,(n.evidence||[]).map(e=>e.name).join('；'),n.source,n.acceptedBy||'',n.requiresReview?'是':'否'])]}, {name:'上下刊卡点',rows:[['环节','类别','卡点','状态','说明'],...handoff.checks.map(c=>[c.label,c.category,c.detail,({pass:'已确认或可规避',deviation:'需处理',pending:'待核验',block:'阻断'})[c.status]||c.status,c.detail]),...(state.execution?.risks||[]).map(r=>['风险登记',r.category,r.item,r.status||'待确认',[r.mitigation,r.owner?'责任：'+r.owner:''].filter(Boolean).join('；')])]}, {name:'组合执行检查',rows:[['检查类型','状态','说明'],...(plan.constraintAudit?.checks||[]).map(c=>['组合',({block:'阻断',pass:'符合已列条件',deviation:'目标偏差',pending:'待核验'})[c.status]||c.status,c.label+'：'+c.detail]),...construction.errors.map(e=>['施工','待完善',e]),...monitoring.errors.map(e=>['交付','待完善',e]),...handoff.deviations.map(e=>['卡点','需处理',e.label+'：'+e.detail]),['施工日历','用户确认窗口内的日历日，剔除明确停工日期；不内置节假日',state.execution?.source||'产能和许可来源未提供']]}];
}
export function operationHTML(state,plan){
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return operationSheets(state,plan).map(sheet=>'<section class="panel card" style="margin-top:20px"><details><summary>'+escape(sheet.name)+' · '+(sheet.rows.length-1)+'条</summary><div style="overflow:auto;max-height:420px"><table><thead><tr>'+sheet.rows[0].map(c=>'<th>'+escape(c)+'</th>').join('')+'</tr></thead><tbody>'+sheet.rows.slice(1).map(row=>'<tr>'+row.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details></section>').join('');
}
