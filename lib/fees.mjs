// Missing fees, confirmed free, and included fees are intentionally different states.
export function quoteFees(brief){
  const errors=[],pending=[],details={};
  if(brief.fees!==undefined&&brief.fees!==null&&(typeof brief.fees!=='object'||Array.isArray(brief.fees)))errors.push('费用结构无效');
  for(const key of ['execution','monitoring']){
    const label=key==='execution'?'执行费':'监测费',input=brief.fees?.[key];
    if(!input||input.status==='unknown'){pending.push(label);details[key]={status:'unknown',amount:0,source:''};continue;}
    if(!['included','separate'].includes(input.status)){errors.push(label+'状态无效');continue;}
    if(typeof input.source!=='string'||!input.source.trim()){errors.push(label+'须填写核实来源或已含费用说明');continue;}
    if(input.status==='included'){details[key]={status:'included',amount:0,source:input.source.trim(),assumed:input.assumed===true};if(input.assumed===true)pending.push(label);continue;}
    const amount=input.amount===null||input.amount===undefined||typeof input.amount==='boolean'||String(input.amount).trim()===''?NaN:Number(input.amount);
    if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(Math.round(amount*100))){errors.push(label+'须填写已确认的非负含税金额');continue;}
    details[key]={status:'separate',amount:Math.round(amount*100)/100,source:input.source.trim()};
  }
  const executionUnitCents=Math.round((details.execution?.amount||0)*100),monitoringCents=Math.round((details.monitoring?.amount||0)*100);
  if(monitoringCents>Math.round(Number(brief.budget)*100))errors.push('监测固定费用已超过预算');
  return {errors,pending,details,executionUnitCents,monitoringCents};
}

export function feeDescription(fees,key){
  const item=fees?.details?.[key],label=key==='execution'?'执行费':'监测费';
  if(!item||item.status==='unknown')return label+'待确认，不计为已确认免费';
  if(item.status==='included')return label+'已含：'+item.source+(item.assumed?'（原文拟定，待合同核实）':'');
  return label+'单列 ¥'+item.amount.toFixed(2)+(key==='execution'?'/资源':'/项目')+'（含税）；'+item.source;
}
