import {INDUSTRIES,validateBrief,normalizeRows,inventoryMatrix} from './engine.mjs';
import {scheduleShapeErrors,scheduleErrors,campaignRanges} from './campaign.mjs';
import {validDate} from './engine.mjs';
import {quoteFees} from './fees.mjs';

export function normalizePlaces(value){
  if(!Array.isArray(value))return [];
  const numeric=v=>v===null||v===undefined||String(v).trim()===''||typeof v==='boolean'?NaN:Number(v);
  return value.filter(p=>p&&typeof p==='object').map(p=>({...p,name:String(p.name||'').trim(),lon:numeric(p.lon),lat:numeric(p.lat),radius:numeric(p.radius)})).filter(p=>p.name&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.radius)&&p.radius>=100&&p.radius<=10000);
}
export function validateStoredBrief(brief,{allowDraft=false}={}){
  if(!brief||typeof brief!=='object'||!Object.hasOwn(INDUSTRIES,brief.industry))throw new Error('客户行业无效，请使用规定行业');
  const shape=scheduleShapeErrors(brief);if(shape.length)throw new Error(shape.join('；'));
  if(brief.schedule&&(!allowDraft||campaignRanges(brief).every(r=>r.start&&r.end))){const schedule=scheduleErrors(brief,validDate);if(schedule.length)throw new Error(schedule.join('；'));}
  if(!Array.isArray(brief.media)||brief.media.some(m=>!['bus','metro'].includes(m)))throw new Error('项目投放渠道无效');
  if(!Number.isFinite(+brief.budget)||+brief.budget<1000000||+brief.budget>5000000)throw new Error('项目预算须在 100–500 万元之间');
  if(!Number.isFinite(+brief.discount)||+brief.discount<=0||+brief.discount>1)throw new Error('项目价格系数无效');
  const feeIssues=quoteFees(brief).errors;
  if(brief.fees!==undefined&&brief.fees!==null&&(typeof brief.fees!=='object'||Array.isArray(brief.fees)))throw new Error('费用结构无效');
  if(brief.fees)for(const key of ['execution','monitoring']){const item=brief.fees[key];if(item!==undefined&&(!item||typeof item!=='object'||Array.isArray(item)||!['unknown','included','separate'].includes(item.status)))throw new Error('费用字段格式无效');}
  if(!allowDraft&&feeIssues.length)throw new Error(feeIssues.join('；'));
  // Incomplete dates and an empty channel selection are legitimate editable drafts.
  return validateBrief(brief);
}
export function normalizeProjectRecords(records){
  if(!Array.isArray(records)||records.length>5000||records.some(r=>!r||typeof r!=='object'))throw new Error('项目库存格式无效');
  if(!records.length)return [];
  const normalized=normalizeRows(inventoryMatrix(records),'恢复的项目','inventory');if(normalized.errors.length)throw new Error(normalized.errors[0]);
  return normalized.data.map((r,i)=>({...records[i],...r,sourceRow:records[i].sourceRow??r.sourceRow,insightIds:Array.isArray(records[i].insightIds)?records[i].insightIds.filter(id=>typeof id==='string'):[],rateIds:Array.isArray(records[i].rateIds)?records[i].rateIds.filter(id=>typeof id==='string'):[]}));
}
export function conditionPatch(values){
  const number=v=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v);
  const patch={unitPrice:number(values.unitPrice),production:number(values.production),periodDays:number(values.periodDays),priceIncludesTax:values.priceIncludesTax===true||values.priceIncludesTax==='true',availableStart:String(values.availableStart||''),availableEnd:String(values.availableEnd||''),priceSource:String(values.priceSource||'').trim()};
  const errors=[];
  if(!Number.isFinite(patch.unitPrice)||patch.unitPrice<=0)errors.push('请填写大于零的精确单价');
  if(!Number.isFinite(patch.production)||patch.production<0)errors.push('请确认制作费，零元也须明确填写');
  const billingUnit=String(values.periodDays||values.billingUnit||'');
  if(['day','calendarMonth'].includes(billingUnit)){patch.billingUnit=billingUnit;patch.periodDays=null;patch.billingSource=String(values.billingSource||'').trim();if(!patch.billingSource)errors.push('按天或自然月计价须提供明确的企业规则来源');}
  else if(patch.periodDays!==28)errors.push('请选择已确认的28天、按天或自然月计价口径');
  else if(values.billingSource!==undefined){patch.billingUnit='period28';patch.billingSource=String(values.billingSource||'').trim();}
  if(!patch.priceIncludesTax){patch.taxRate=number(values.taxRate);patch.billingSource=String(values.billingSource||'').trim();if(!Number.isFinite(patch.taxRate)||patch.taxRate<0||patch.taxRate>100||!patch.billingSource)errors.push('请明确确认含税价格；若为未税，须填写已核实税率及计税来源');}
  if(!validDate(patch.availableStart)||!validDate(patch.availableEnd)||patch.availableStart>patch.availableEnd)errors.push('请填写已核实的可售起止日期');
  if(!patch.priceSource||patch.priceSource.length>500)errors.push('请填写 1–500 字的价格与档期核实来源');
  return {patch,errors};
}
