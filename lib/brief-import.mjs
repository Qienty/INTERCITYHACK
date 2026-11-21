import {INDUSTRIES,validDate,validateBrief} from './engine.mjs';

export const BRIEF_FIELDS=[
  {key:'brand',label:'客户 / 品牌',type:'text',aliases:['目标品牌','客户品牌','客户名称','品牌名称','品牌','客户']},
  {key:'industry',label:'客户行业',type:'industry',aliases:['客户行业','所属行业','行业']},
  {key:'budget',label:'含税总预算（万元）',type:'budget',aliases:['含税总预算','投放预算','预算金额','含税预算','总预算','预算']},
  {key:'media',label:'投放媒体',type:'media',aliases:['投放媒体','媒体类型','投放形式','媒介类型','媒介','媒体']},
  {key:'start',label:'投放开始日期',type:'date',aliases:['投放开始日期','投放开始','开始日期','起始日期','开始时间']},
  {key:'end',label:'投放结束日期',type:'date',aliases:['投放结束日期','投放结束','结束日期','截止日期','结束时间']},
  {key:'goal',label:'投放目标',type:'textarea',aliases:['投放目标','营销目标','传播目标','活动目标','客户需求','需求描述','需求目标','目标']},
  {key:'audience',label:'目标人群',type:'text',aliases:['目标人群','目标受众','目标客群','受众人群','受众']},
  {key:'areas',label:'重点区域',type:'text',aliases:['投放区域','重点区域','目标区域','覆盖区域','区域']},
  {key:'locations',label:'门店 / 地标要求',type:'textarea',aliases:['门店 / 地标要求','门店地标','门店清单','重点门店','门店','地标']},
  {key:'notes',label:'补充要求',type:'textarea',aliases:['补充要求','特别要求','其他要求','注意事项','备注']}
];
export const BRIEF_TEMPLATE_HEADERS=['客户品牌','客户行业','含税总预算（万元）','投放媒体','投放开始日期','投放结束日期','投放目标','目标人群','重点区域','门店清单','补充要求'];
const scheduleAliases=['投放档期','投放周期','投放时间','档期','排期'];
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
  const text=normalize(raw);if(/或|待选|二选一|择一/.test(text))return null;
  const media=[];
  for(const [key,pattern]of [['bus',/公交(?:车身)?|巴士|\bbus\b/gi],['metro',/地铁(?:出入口|口)?|\bmetro\b/gi]]){
    const matches=[...text.matchAll(pattern)].filter(m=>!/(?:不投放|不投|不要|不用|不考虑|排除|暂不|不含)[^,，;；、。]{0,4}$/.test(text.slice(Math.max(0,m.index-10),m.index)));
    if(matches.length)media.push(key);
  }
  return media.length?media:null;
}
function convert(key,value,label){
  if(blank(value))return null;
  if(key==='industry')return industryValue(value);
  if(key==='budget')return budgetValue(value,label);
  if(key==='media')return mediaValue(value);
  if(key==='start'||key==='end')return dateValue(value);
  return normalize(value);
}
export function extractBrief(rawText,source='粘贴的客户需求'){
  const text=String(rawText??'').replace(/^\uFEFF/,'').trim();
  if(!text)throw new Error('请先粘贴客户需求或选择有内容的文件');
  if(text.length>50000)throw new Error('单份需求超过 50,000 字符，请按客户拆分后导入');
  const values={},snippets={},warnings=[],candidates={},invalid=new Set();
  const labels=[...BRIEF_FIELDS.flatMap(f=>f.aliases),...scheduleAliases].sort((a,b)=>b.length-a.length).map(escapeRE).join('|');
  const regex=new RegExp('(^|[\\n;；,，。]|[\\t ]{2,})[\\t ]*('+labels+')([\\t ]*[（(](?:人民币|万元|元|万|RMB|CNY)[）)])?[\\t ]*[:：=][\\t ]*','g');
  const hits=[...text.matchAll(regex)];
  function add(key,raw,label){
    if(blank(raw))return;
    snippets[key]=[snippets[key],label+'：'+raw].filter(Boolean).join('\n');
    const value=convert(key,raw,label);
    if(value===null){invalid.add(key);return;}
    (candidates[key]||=[]).push(value);
  }
  function schedule(raw,label){
    const dates=[...normalize(raw).matchAll(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g)].map(m=>m[0]);
    if(dates.length===2){add('start',dates[0],label);add('end',dates[1],label);}else warnings.push('投放档期未明确两端的完整日期，请人工填写开始与结束日期。');
  }
  hits.forEach((m,i)=>{
    const label=m[2]+(m[3]||''),key=keyFor(label);
    // A single labeled line ends at newline; free-form goal/notes retain following lines.
    let raw=text.slice(m.index+m[0].length,hits[i+1]?.index??text.length).trim().replace(/[;；，。]+$/,'');
    if(!['goal','notes','locations'].includes(key))raw=raw.split('\n')[0].trim();
    else raw=raw.split(/\n(?=[^:\n：]{1,30}[:：])/)[0].trim();
    if(key==='schedule')schedule(raw,label);else if(key)add(key,raw,label);
  });
  // Conservative fallback for an unlabeled email sentence. Ambiguous amounts remain blank.
  if(!snippets.budget){
    const matches=[...text.matchAll(/(?:总预算|投放预算|预算)(?:为|是|约为|约|不超过|控制在)?\s*[:：]?\s*([^\n，;；。]{1,45})/g)];
    for(const m of matches){const candidate=m[1].match(/^([\d,]+(?:\.\d+)?|[零〇一二两三四五六七八九十百千]+)\s*(万元|万|元|w)(?![\d])/i);if(candidate&&!/[~～至到-]|或者|或/.test(m[1]))add('budget',candidate[0],'预算');else {snippets.budget=m[0];invalid.add('budget');}}
  }
  if(!snippets.industry){const m=text.match(/(?:属于|来自|我们是)?(食品饮料|银行保险|私立医院|民营医院|保健品|主题公园|乐园|食品|饮料|银行|保险)行业/);if(m)add('industry',m[1],'行业');}
  if(!snippets.media){const m=text.match(/(?:希望|计划|仅|只)?投放\s*([^\n，;；。]{1,50})/);if(m&&/公交|地铁|巴士/.test(m[1]))add('media',m[1],'投放媒体');}
  if(!snippets.start&&!snippets.end){const m=text.match(/(?:档期|排期|投放时间)(?:为|是)?\s*[:：]?\s*([^\n;；。]+)/);if(m)schedule(m[1],'投放档期');}
  for(const field of BRIEF_FIELDS){
    const list=candidates[field.key]||[],distinct=[...new Map(list.map(v=>[JSON.stringify(v),v])).values()];
    if(invalid.has(field.key)||distinct.length>1){warnings.push(field.label+'存在冲突、范围、单位缺失或无法识别的内容，未自动选取，请人工确认。');continue;}
    if(distinct.length===1)values[field.key]=distinct[0];
  }
  return {source,text,values,snippets,warnings};
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
    if(field.key==='industry'){if(!INDUSTRIES[value])errors.push('请选择支持的客户行业');else clean.industry=value;}
    else if(field.key==='budget'){if(!Number.isFinite(value)||value<1000000||value>5000000)errors.push('预算须在 100–500 万元之间');else clean.budget=value;}
    else if(field.key==='media'){if(!Array.isArray(value)||!value.length||value.some(m=>!['bus','metro'].includes(m)))errors.push('至少确认一种有效投放媒体');else clean.media=[...new Set(value)];}
    else if(field.type==='date'){if(!validDate(value)||!value.startsWith('2027-'))errors.push(field.label+'须为 2027 年内有效日期');else clean[field.key]=value;}
    else{const text=String(value??'').trim(),limit=field.type==='textarea'?4000:200;if(!text||text.length>limit)errors.push(field.label+'请填写 1–'+limit+' 个字符');else clean[field.key]=text;}
  }
  const merged={...current,...clean};
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
  return {brief:{...current,...patch},patch,warnings};
}
