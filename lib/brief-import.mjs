import {INDUSTRIES,validDate,validateBrief} from './engine.mjs';
import {CHANNELS,channelName,campaignRanges,periodRange,withSchedule,scheduleErrors} from './campaign.mjs';

export const BRIEF_FIELDS=[
  {key:'brand',label:'客户 / 品牌',type:'text',aliases:['目标品牌','客户品牌','客户名称','品牌名称','品牌','客户']},
  {key:'industry',label:'客户行业',type:'industry',aliases:['客户行业','所属行业','行业']},
  {key:'budget',label:'含税总预算（万元）',type:'budget',aliases:['含税总预算','投放预算','预算金额','含税预算','总预算','预算']},
  {key:'media',label:'投放渠道',type:'media',aliases:['投放渠道','投放媒体','媒体类型','投放形式','媒介类型','媒介','媒体']},
  {key:'schedule',label:'投放日期 / 分段',type:'schedule',aliases:['排期设置','分段日期','投放日期']},
  {key:'start',label:'投放开始日期',type:'date',aliases:['投放开始日期','投放开始','开始日期','起始日期','开始时间']},
  {key:'end',label:'投放结束日期',type:'date',aliases:['投放结束日期','投放结束','结束日期','截止日期','结束时间']},
  {key:'goal',label:'投放目标',type:'textarea',aliases:['投放目标','营销目标','传播目标','活动目标','客户需求','需求描述','需求目标','目标']},
  {key:'audience',label:'目标人群',type:'text',aliases:['目标人群','目标受众','目标客群','受众人群','受众']},
  {key:'areas',label:'重点区域',type:'text',aliases:['投放区域','重点区域','目标区域','覆盖区域','区域']},
  {key:'locations',label:'门店 / 地标要求',type:'textarea',aliases:['门店 / 地标要求','门店地标','门店清单','重点门店','门店','地标']},
  {key:'quantity',label:'媒体数量要求',type:'text',aliases:['媒体数量','投放数量','数量']},
  {key:'monitoring',label:'监测与验收要求',type:'textarea',aliases:['监测与验收要求','监测验收要求','监播要求','监测要求','上刊要求','上刊监测']},
  {key:'settlement',label:'结算与合同要求',type:'textarea',aliases:['结算与合同要求','结算要求','结算方式','付款方式','合同要求','发票要求']},
  {key:'deadline',label:'客户回复期限',type:'text',aliases:['客户回复期限','回复期限','回复时间']},
  {key:'notes',label:'补充要求',type:'textarea',aliases:['补充要求','特别要求','其他要求','注意事项','备注']}
];
export const BRIEF_TEMPLATE_HEADERS=['客户品牌','客户行业','含税总预算（万元）','投放渠道','投放开始日期','投放结束日期','投放目标','目标人群','重点区域','门店清单','补充要求','投放日期','媒体数量要求','监测与验收要求','结算与合同要求','客户回复期限'];
const scheduleAliases=['投放档期','投放周期','投放时间','投放日期','排期设置','分段日期','档期','排期'];
const blank=v=>v==null||String(v).trim()===''||/^(?:待定|待确认|未提供|暂无)$/.test(String(v).trim());
const normalize=s=>String(s??'').normalize('NFKC').trim();
const escapeRE=s=>[...s].map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
function keyFor(label){
  const clean=normalize(label).replace(/\((?:人民币|元|万元|万|RMB|CNY)\)/gi,'').replace(/\s/g,'');
  if(scheduleAliases.includes(clean))return 'schedule';
  return BRIEF_FIELDS.find(f=>f.aliases.some(a=>a.replace(/\s/g,'')===clean))?.key;
}
function chineseNumber(text){
  if(/^\d[\d,]*(?:\.\d+)?$/.test(text))return Number(text.replaceAll(',',''));
  const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  let total=0,current=0;for(const char of text){if(char in digits)current=digits[char];else if(char==='十'||char==='百'||char==='千'){total+=(current||1)*({十:10,百:100,千:1000}[char]);current=0;}else return null;}return total+current;
}
function budgetValue(raw,label){
  const currency=/人民币|RMB|CNY|[¥￥]/i.test(raw);
  const value=normalize(raw).replace(/人民币|RMB|CNY|[¥￥]/gi,'').replace(/(?:\(含税\)|含税|税后)\s*$/,'').trim();
  const match=value.match(/^([\d,]+(?:\.\d+)?|[零〇一二两三四五六七八九十百千]+)\s*(万元|万|元|w)?$/i);
  if(!match)return null;
  let number=chineseNumber(match[1]);if(number===null)return null;
  const unit=match[2]||normalize(label).match(/\((万元|万|元)\)/)?.[1]||(currency?'元':null);
  if(!unit)return null;
  if(/^(?:万|万元|w)$/i.test(unit))number*=10000;
  return number;
}
function dateValue(raw){
  const m=normalize(raw).match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if(!m)return null;const v=[m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-');return validDate(v)?v:null;
}
function industryValue(raw){
  const text=normalize(raw).replace(/[\s/、]/g,'');
  return ({食品饮料:'食品饮料',食品:'食品饮料',饮料:'食品饮料',银行保险:'银行保险',银行:'银行保险',保险:'银行保险',保健品:'保健品',私立医院:'私立医院',民营医院:'私立医院',乐园:'乐园（主题公园）',主题公园:'乐园（主题公园）','乐园(主题公园)':'乐园（主题公园）'})[text]||null;
}
function mediaValue(raw){
  // Removed train channels must not be reinterpreted as station entrances via the generic 地铁 alias.
  const text=normalize(raw).replace(/地铁(?:车辆|车厢|列车)|\bmetro[_ ]?(?:vehicle|train)\b/gi,'');if(/或|待选|二选一|择一/.test(text))return null;
  const media=[],aliases=CHANNELS.flatMap(c=>c.aliases.map(a=>({id:c.id,text:a}))).sort((a,b)=>b.text.length-a.text.length);
  const pattern=new RegExp(aliases.map(a=>escapeRE(a.text)).join('|'),'gi');
  for(const match of text.matchAll(pattern)){
    if(/(?:不投放|不投|不要|不用|不考虑|排除|暂不|不含)[^,，;；、。]{0,4}$/.test(text.slice(Math.max(0,match.index-10),match.index)))continue;
    const id=aliases.find(a=>a.text.toLowerCase()===match[0].toLowerCase()).id;if(!media.includes(id))media.push(id);
  }
  // Preserve the historical bus-before-metro representation for old briefs.
  return media.length?CHANNELS.filter(c=>media.includes(c.id)).sort((a,b)=>(a.id==='bus'?-1:a.id==='metro'?0:1)-(b.id==='bus'?-1:b.id==='metro'?0:1)).map(c=>c.id):null;
}
const pad2=n=>String(n).padStart(2,'0');
function buildDate(year,month,day){if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day))return null;const value=year+'-'+pad2(month)+'-'+pad2(day);return validDate(value)?value:null;}
function uniqueYear(text){const years=[...new Set([...String(text).matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1])))];return years.length===1?years[0]:null;}
function orderedRanges(ranges){const sorted=[...ranges].filter(r=>r&&r.start&&r.end).sort((a,b)=>a.start.localeCompare(b.start));if(sorted.length!==ranges.length||sorted.some(r=>r.start>r.end))return null;for(let i=1;i<sorted.length;i++)if(sorted[i].start<=sorted[i-1].end)return null;return sorted;}
// Explicit dates, month-day ranges and short slashed ranges are parsed directly.
// The returned years let the caller refuse periods outside the competition's 2027 window.
function parseSchedule(raw){
  const text=normalize(raw);
  const finish=ranges=>{
    const ordered=orderedRanges(ranges);if(!ordered)return {schedule:null,reason:'invalid',years:[]};
    const years=[...new Set(ordered.flatMap(r=>[Number(r.start.slice(0,4)),Number(r.end.slice(0,4))]))];
    const schedule={unit:'custom',mode:ordered.length>1||/分段|可拆|分两段|两段/.test(text)?'segments':'continuous',ranges:ordered};
    return {schedule,reason:null,years};
  };
  const full=[...text.matchAll(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/g)].map(m=>({date:buildDate(Number(m[1]),Number(m[2]),Number(m[3]))}));
  if(full.length>=2){
    if(full.length%2||full.some(t=>!t.date))return {schedule:null,reason:'invalid',years:[]};
    const ranges=[];for(let i=0;i<full.length;i+=2)ranges.push({start:full[i].date,end:full[i+1].date});
    return finish(ranges);
  }
  const contextYear=uniqueYear(text);
  const monthRanges=[...text.matchAll(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*[–\-—~～至到]\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g)];
  if(monthRanges.length){
    const years=[],ranges=[];
    for(const m of monthRanges){const year=Number(m[1]||m[4]||contextYear);years.push(year);ranges.push({start:buildDate(year,Number(m[2]),Number(m[3])),end:buildDate(year,Number(m[5]),Number(m[6]))});}
    if(years.some(y=>!Number.isInteger(y)))return {schedule:null,reason:'invalid',years:[]};
    const result=finish(ranges);if(result.schedule)result.years=[...new Set(years)];return result;
  }
  if(/档期|排期|投放|周期|可拆|分段/.test(text)){
    const short=[...text.matchAll(/(?:(\d{4})\s*[/-])?(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[–\-—~～至到]\s*(?:(\d{4})\s*[/-])?(\d{1,2})\s*[/-]\s*(\d{1,2})/g)];
    if(short.length){
      const years=[],ranges=[];
      for(const m of short){const year=Number(m[1]||m[4]||contextYear);years.push(year);ranges.push({start:buildDate(year,Number(m[2]),Number(m[3])),end:buildDate(year,Number(m[5]),Number(m[6]))});}
      if(years.some(y=>!Number.isInteger(y)))return {schedule:null,reason:'invalid',years:[]};
      const result=finish(ranges);if(result.schedule)result.years=[...new Set(years)];return result;
    }
  }
  const years=[...new Set([...text.matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1])))];if(years.length!==1||years[0]!==2027)return {schedule:null,reason:'period',years};
  let unit='custom',ranges=[];
  if(/季度|Q[1-4]/i.test(text)){unit='quarter';const values=[...text.matchAll(/第?([1-4一二三四])季度|Q([1-4])/gi)].map(m=>({一:1,二:2,三:3,四:4}[m[1]]||Number(m[1]||m[2])));if(!values.length)return {schedule:null,reason:'invalid',years};ranges=values.map(q=>periodRange(unit,2027,q));}
  else if(/月度|全月/.test(text)){unit='month';let months=[...text.matchAll(/(?:^|[^\d])([1-9]|1[0-2])月/g)].map(m=>Number(m[1]));if(!months.length)months=[...text.matchAll(/2027-(0[1-9]|1[0-2])(?!-\d)/g)].map(m=>Number(m[1]));if(!months.length)return {schedule:null,reason:'invalid',years};ranges=months.map(m=>periodRange(unit,2027,m));}
  else if(/年度|全年/.test(text)){unit='year';ranges=[periodRange(unit,2027)];}
  else return {schedule:null,reason:'period',years};
  const schedule={unit,mode:ranges.length>1||/分段/.test(text)?'segments':'continuous',ranges};
  const brief=withSchedule({},schedule);const invalid=scheduleErrors(brief,validDate).length;return {schedule:invalid?null:schedule,reason:invalid?'invalid':null,years};
}
function scheduleValue(raw){return parseSchedule(raw).schedule;}
// Section headings such as「二、监测与结算要求」carry requirements that are not key:value fields.
function sectionBlocks(text){
  const sections=[];let current=null;
  for(const line of String(text??'').split(/\r?\n/)){
    const heading=line.match(/^\s*(?:[一二三四五六七八九十]+[、.．])\s*([^\n]{1,40})\s*$/);
    if(heading){current={title:heading[1].trim(),body:[]};sections.push(current);continue;}
    if(current)current.body.push(line);
  }
  return sections;
}
function convert(key,value,label){
  if(blank(value))return null;
  if(key==='industry')return industryValue(value);
  if(key==='budget')return budgetValue(value,label);
  if(key==='media')return mediaValue(value);
  if(key==='schedule')return scheduleValue(value);
  if(key==='start'||key==='end')return dateValue(value);
  return normalize(value);
}
export function extractBrief(rawText,source='粘贴的客户需求'){
  const raw=String(rawText??'').replace(/^\uFEFF/,'').trim();
  if(!raw)throw new Error('请先粘贴客户需求或选择有内容的文件');
  if(raw.length>50000)throw new Error('单份需求超过 50,000 字符，请按客户拆分后导入');
  // Section/page markers from DOCX/PDF extraction are provenance, not client text.
  const text=raw.replace(/【(?:段落|第)\s*\d+\s*(?:页|段)?】\s*/g,'').trim();
  let yearWarningShown=false;
  const values={},snippets={},warnings=[],candidates={},invalid=new Set();
  const labels=[...BRIEF_FIELDS.flatMap(f=>f.aliases),...scheduleAliases].sort((a,b)=>b.length-a.length).map(escapeRE).join('|');
  const regex=new RegExp('(^|[\\n;；,，。\\t ])('+labels+')([\\t ]*[（(](?:人民币|万元|元|万|RMB|CNY)[）)])?(?:[\\t ]*[:：=][\\t ]*|\\t+)','g');
  const hits=[...text.matchAll(regex)];
  function add(key,raw,label){
    if(blank(raw))return;
    snippets[key]=[snippets[key],label+'：'+raw].filter(Boolean).join('\n');
    const value=convert(key,raw,label);
    if(value===null){invalid.add(key);return;}
    (candidates[key]||=[]).push(value);
  }
  function schedule(rawValue,label){
    const parsed=parseSchedule(rawValue);
    if(parsed.schedule){
      if(parsed.years.some(year=>year!==2027)){if(!yearWarningShown){yearWarningShown=true;warnings.push('原 brief 档期为 '+parsed.schedule.ranges.map(r=>r.start+' 至 '+r.end).join('；')+'，不在赛题规定的 2027 年内，未自动填入；请按 2027 年档期调整后人工确认。');}return;}
      const b=withSchedule({},parsed.schedule);add('start',b.start,label);add('end',b.end,label);if(parsed.schedule.unit!=='custom'||parsed.schedule.mode==='segments')add('schedule',rawValue,label);return;
    }
    warnings.push('投放日期不完整、分段重叠或无法识别，请填写完整日期、明确的年度 / 季度 / 月度周期。');
  }
  hits.forEach((m,i)=>{
    const label=m[2]+(m[3]||''),key=keyFor(label);
    // A single labeled line ends at newline; free-form goal/notes retain following lines.
    let raw=text.slice(m.index+m[0].length,hits[i+1]?.index??text.length).trim().replace(/[;；，。]+$/,'');
    if(!['goal','notes','locations','schedule'].includes(key))raw=raw.split('\n')[0].trim();
    else raw=raw.split(/\n(?=[^:\n：]{1,30}[:：])/)[0].trim();
    if(key==='brand'){const embedded=raw.search(/[\t ]+[^\s:：]{1,24}[:：]/);if(embedded>=0){warnings.push('客户 / 品牌中包含其他字段，已截断；请核对导入原文。');raw=raw.slice(0,embedded).trim();}}
    if(key==='schedule')schedule(raw,label);else if(key)add(key,raw,label);
  });
  // Conservative fallback for an unlabeled email sentence. Ambiguous amounts remain blank.
  if(!snippets.budget){
    const matches=[...text.matchAll(/(?:总预算|投放预算|预算)(?:为|是|约为|约|不超过|控制在)?\s*[:：]?\s*([^\n，;；。]{1,45})/g)];
    for(const m of matches){const candidate=m[1].match(/^([\d,]+(?:\.\d+)?|[零〇一二两三四五六七八九十百千]+)\s*(万元|万|元|w)(?![\d])/i);if(candidate&&!/[~～至到-]|或者|或/.test(m[1]))add('budget',candidate[0],'预算');else {snippets.budget=m[0];invalid.add('budget');}}
  }
  if(!snippets.industry){const m=text.match(/(?:属于|来自|我们是)?(食品饮料|银行保险|私立医院|民营医院|保健品|主题公园|乐园|食品|饮料|银行|保险)行业/);if(m)add('industry',m[1],'行业');}
  if(!snippets.media){const m=text.match(/(?:希望|计划|仅|只)?投放\s*([^\n，;；。]{1,100})/);if(m&&/公交|地铁|巴士|商圈|地标|楼宇|住宅/.test(m[1]))add('media',m[1],'投放渠道');}
  if(!snippets.start&&!snippets.end&&!yearWarningShown){const m=text.match(/(?:档期|排期|投放时间)(?:为|是)?\s*[:：]?\s*([^\n;；。]+)/);if(m)schedule(m[1],'投放档期');}
  // Real 4A briefs wrap the client name in quotes: 客户「某国际品牌」.
  if(!snippets.brand){const m=text.match(/客户\s*[「“"]([^」”"\n]{1,30})[」”"]/)||text.match(/品牌\s*[「“"]([^」”"\n]{1,30})[」”"]/);if(m)add('brand',m[1],'客户 / 品牌');}
  // Unsupported media is named explicitly instead of silently keeping the previous channel.
  if(!snippets.media){const unsupported=text.match(/LED|户外大牌|大牌|双层巴士|铛铛车|游船|灯箱|墙贴|LCD|候车亭/);if(unsupported)warnings.push('brief 要求「'+unsupported[0]+'」等媒体，当前方案仅支持公交车身与地铁站口；投放渠道未自动选择，请人工确认。');}
  if(!snippets.quantity){const m=text.match(/数量\s*(?:为|是)?\s*[:：]?\s*([^\n，。;；]{1,40})/);if(m)add('quantity',m[1],'媒体数量要求');}
  // Section headings carry monitoring / settlement / reply requirements as free text.
  const sections=sectionBlocks(text);
  const monitoringSection=sections.find(section=>/监测|监播|验收|交付/.test(section.title));
  if(monitoringSection){
    const body=monitoringSection.body.join('\n').trim();
    const monitorLines=body.split(/\n/).map(line=>line.trim()).filter(line=>/(照片|监拍|监播|巡检|上刊|下刊|验收)/.test(line));
    const settlementLines=body.split(/\n/).map(line=>line.trim()).filter(line=>/(结算|付款|发票|协议|合同|账期)/.test(line));
    if(!snippets.monitoring&&monitorLines.length)add('monitoring',monitorLines.join('\n').slice(0,4000),'监测与验收要求');
    if(!snippets.settlement&&settlementLines.length)add('settlement',settlementLines.join('\n').slice(0,4000),'结算与合同要求');
  }
  const replySection=sections.find(section=>/回复|答复/.test(section.title));
  if(replySection&&!snippets.deadline){
    const lines=replySection.body.map(line=>line.trim()).filter(Boolean);
    const stop=lines.findIndex(line=>/^(?:顺祝|祝商祺|此致|谢谢|——|说明[:：])/.test(line));
    const body=(stop>=0?lines.slice(0,stop):lines).join(' ').replace(/\s+/g,' ').trim();
    if(body)add('deadline',body.slice(0,200),'客户回复期限');
  }
  if(!snippets.deadline){const m=text.match(/(?:请于|于)[^。\n]{0,60}?\d+\s*个?工作日内?[^。\n]{0,40}回复[^。\n]{0,60}/);if(m)add('deadline',m[0].trim(),'客户回复期限');}
  if(!snippets.monitoring){const m=text.match(/(?:上刊|下刊)[^。\n]{0,80}(?:照片|监拍|监播|巡检)[^。\n]{0,80}/);if(m)add('monitoring',m[0].trim(),'监测与验收要求');}
  if(!snippets.settlement){const m=text.match(/(?:月度结算|发票|付款节奏|框架协议)[^。\n]{0,80}/);if(m)add('settlement',m[0].trim(),'结算与合同要求');}
  for(const field of BRIEF_FIELDS){
    const list=candidates[field.key]||[],distinct=[...new Map(list.map(v=>[JSON.stringify(v),v])).values()];
    if(invalid.has(field.key)||distinct.length>1){warnings.push(field.label+'存在冲突、范围、单位缺失或无法识别的内容，未自动选取，请人工确认。');continue;}
    if(distinct.length===1)values[field.key]=distinct[0];
  }
  if(candidates.schedule&&['schedule','start','end'].some(key=>invalid.has(key)||new Set((candidates[key]||[]).map(v=>JSON.stringify(v))).size>1)){
    delete values.schedule;delete values.start;delete values.end;
    warnings.push('周期 / 分段排期与其他日期内容冲突，未自动覆盖原排期，请在需求表单中修正。');
  }
  // A 2027 brief may ask to split the booking: 可拆两段排期（5/1–5/7、5/8–5/10）.
  if(/可拆|分两段|两段排期/.test(text)&&values.start&&values.start.startsWith('2027-')){
    const year=values.start.slice(0,4);
    const pairs=[...text.matchAll(/(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[–\-—~～]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})/g)];
    if(pairs.length>1){
      const ranges=pairs.map(m=>({start:buildDate(Number(year),Number(m[1]),Number(m[2])),end:buildDate(Number(year),Number(m[3]),Number(m[4]))}));
      const ordered=orderedRanges(ranges);
      if(ordered&&ordered.length>1){values.schedule={unit:'custom',mode:'segments',ranges:ordered};const merged=withSchedule({},values.schedule);values.start=merged.start;values.end=merged.end;warnings.push('按 brief 的「可拆」原文识别为 '+ordered.length+' 段排期，请核对分段日期是否与客户一致。');}
    }
  }
  return {source,text:raw,values,snippets,warnings};
}
export function briefCandidatesFromRows(rows,source){
  if(!Array.isArray(rows)||!rows.length)throw new Error('所选工作表没有内容');
  const clean=rows.filter(r=>Array.isArray(r)&&r.some(v=>!blank(v)));
  const headerIndex=clean.findIndex(r=>r.filter(c=>keyFor(String(c))).length>=2);
  const texts=[];
  if(headerIndex>=0){
    const headers=clean[headerIndex];
    for(const row of clean.slice(headerIndex+1)){if(!headers.some((h,i)=>keyFor(String(h))&&!blank(row[i])))continue;texts.push(headers.map((h,i)=>!blank(row[i])?String(h)+'：'+cellText(h,row[i]):'').filter(Boolean).join('\n'));}
  }else{
    const pairs=clean.filter(r=>keyFor(String(r[0]))&&!blank(r[1]));
    if(pairs.length)texts.push(clean.filter(r=>!blank(r[1])).map(r=>String(r[0])+'：'+cellText(r[0],r[1])).join('\n'));
  }
  if(!texts.length)throw new Error('未找到客户需求字段，请使用需求模板，或把原文粘贴到文本框');
  if(texts.length>100)throw new Error('一次最多导入 100 份候选需求，请拆分文件');
  return texts.map((text,i)=>({...extractBrief(text,source+' · 需求 '+(i+1)),index:i}));
}
function cellText(header,value){
  const key=keyFor(String(header));
  if(['start','end'].includes(key)&&typeof value==='number'&&Number.isInteger(value)&&value>=30000&&value<=80000)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
  return String(value);
}
export function reviewBrief(current,patch){
  const errors=[],clean={};
  for(const field of BRIEF_FIELDS){
    if(!Object.hasOwn(patch,field.key))continue;
    const value=patch[field.key];
    if(field.key==='industry'){if(!Object.hasOwn(INDUSTRIES,value))errors.push('请选择支持的客户行业');else clean.industry=value;}
    else if(field.key==='budget'){if(!Number.isFinite(value)||value<1000000||value>5000000)errors.push('预算须在 100–500 万元之间');else clean.budget=value;}
    else if(field.key==='media'){if(!Array.isArray(value)||!value.length||value.some(m=>!CHANNELS.some(c=>c.id===m)))errors.push('至少确认一种有效投放渠道');else clean.media=[...new Set(value)];}
    else if(field.key==='schedule'){
      if(!value||!Array.isArray(value.ranges))errors.push('投放分段格式无效');
      else{const candidate=withSchedule({},value),issues=scheduleErrors(candidate,validDate);if(issues.length)errors.push(...issues);else clean.schedule=structuredClone(value);}
    }
    else if(field.type==='date'){if(!validDate(value)||!value.startsWith('2027-'))errors.push(field.label+'须为 2027 年内有效日期');else clean[field.key]=value;}
    else{const text=String(value??'').trim(),limit=field.type==='textarea'?4000:200;if(!text||text.length>limit)errors.push(field.label+'请填写 1–'+limit+' 个字符');else clean[field.key]=text;}
  }
  let merged={...current,...clean};
  if(clean.schedule)merged=withSchedule(merged,clean.schedule);
  if(validDate(merged.start)&&validDate(merged.end)&&merged.start>merged.end)errors.push('开始日期不能晚于结束日期');
  if(!Object.keys(clean).length)errors.push('请至少选择一个要应用的字段');
  const pending=validateBrief(merged);if(!String(merged.brand||'').trim())pending.unshift('目标品牌待补充');
  return {errors:[...new Set(errors)],patch:clean,merged,pending};
}

// Populate the existing brief as one draft. Missing/invalid values retain current data.
export function prepareBriefDraft(current,extracted){
  const patch={},warnings=[...extracted.warnings];
  for(const field of BRIEF_FIELDS){
    if(!Object.hasOwn(extracted.values,field.key))continue;
    const result=reviewBrief({...current,start:'',end:''},{[field.key]:extracted.values[field.key]});
    if(result.errors.length)warnings.push(field.label+'未自动填入：'+result.errors.join('；')+'。保留原值。');
    else Object.assign(patch,result.patch);
  }
  let brief={...current,...patch};
  if(patch.schedule){brief=withSchedule(brief,patch.schedule);patch.start=brief.start;patch.end=brief.end;}
  else if(patch.start||patch.end){delete brief.schedule;}
  return {brief,patch,warnings};
}
