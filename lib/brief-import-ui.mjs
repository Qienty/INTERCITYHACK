import {parseCSV,toCSV} from './engine.mjs';
import {BRIEF_FIELDS,BRIEF_TEMPLATE_HEADERS,extractBrief,briefCandidatesFromRows} from './brief-import.mjs';

export function installBriefImport({getState,stage,modal,toast,download,esc,icon}){
  const $=s=>document.querySelector(s);
  let sourceText='',sourceName='粘贴的客户需求',sheets=null,candidates=[],generation=0;
  const pretty=(key,value)=>{
    if(value==null||value===''||(Array.isArray(value)&&!value.length))return '未填写';
    if(key==='budget')return Number(value).toLocaleString('zh-CN')+' 元';
    if(key==='media')return value.map(m=>m==='bus'?'公交车身':'地铁出入口').join('、');
    return String(value);
  };
  function steps(review=false){return `<div class="intake-steps"><span class="${review?'done':'active'}">1 · 导入需求</span><i>→</i><span class="${review?'active':''}">2 · 自动填入</span><i>→</i><span>3 · 整体确认</span></div>`;}
  function inputScreen(){
    modal('导入客户需求',`<div class="brief-intake">${steps()}<p>粘贴客户邮件 / brief，或上传 TXT、CSV、XLSX。导入后直接填入左侧客户投放需求，可在那里修改，最后整体确认一次。</p><div class="intake-upload"><button class="btn dark" type="button" data-intake-action="choose-file">${icon('upload',14)}选择需求文件</button><button class="btn" type="button" data-intake-action="template">${icon('download',13)}下载空白需求模板</button><span>TXT / CSV ≤ 1MB · XLSX ≤ 10MB</span></div><input id="brief-intake-file" type="file" accept=".txt,.csv,.xlsx" hidden><div id="brief-file-options"></div><div class="field"><label for="brief-source-text">客户需求原文 <small>最多 50,000 字符</small></label><textarea id="brief-source-text" maxlength="50000" rows="9" placeholder="粘贴客户的品牌、行业、预算（注明单位）、媒体、完整投放日期和目标。">${esc(sourceText)}</textarea><div class="field-hint" id="brief-source-name">来源：${esc(sourceName)} · 字段提取在浏览器本地完成</div></div><div id="brief-intake-error" class="intake-errors" role="alert" hidden></div><div class="note-box">已识别内容自动填入，缺失字段保留原值；有冲突的内容会在左侧提示。Excel 文件只发送至本应用解析，不调用外部模型。</div><div class="modal-actions"><button class="btn" type="button" data-intake-action="cancel">取消</button><button class="btn dark" type="button" data-intake-action="parse">生成并填入需求 ${icon('arrow',13)}</button></div></div>`);
  }
  function fail(message){const box=$('#brief-intake-error');if(box){box.hidden=false;box.textContent=message;}else toast(message);}
  function open(){generation++;sourceText='';sourceName='粘贴的客户需求';sheets=null;candidates=[];inputScreen();}
  function showSheet(index){
    candidates=[];
    try{candidates=briefCandidatesFromRows(sheets[index].rows,sourceName+' / '+sheets[index].name);}catch(e){fail(e.message);}
    let html=`<div class="two-fields"><div class="field"><label for="brief-intake-sheet">工作表</label><select id="brief-intake-sheet">${sheets.map((s,i)=>`<option value="${i}" ${i===index?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label for="brief-intake-record">选择一份客户需求</label><select id="brief-intake-record"><option value="">请先选择客户需求（共 ${candidates.length} 份）</option>${candidates.map((c,i)=>`<option value="${i}">${i+1} · ${esc(c.values.brand||'未填写品牌')}</option>`).join('')}</select></div></div>`;
    $('#brief-file-options').innerHTML=html;$('#brief-source-text').value='';sourceText='';
    if(candidates.length===1){$('#brief-intake-record').value='0';selectCandidate(0);}
  }
  function selectCandidate(index){
    if(!candidates[index])return;
    sourceText=candidates[index].text;
    $('#brief-source-text').value=sourceText;
    try{fillDraft(sourceText,candidates[index].source);}catch(e){fail(e.message);}
  }
  async function loadFile(file){
    if(!file)return;
    const job=++generation;
    const isCurrent=()=>job===generation&&$('#modal').open&&!!$('#brief-source-text');
    const button=$('[data-intake-action="parse"]');button.disabled=true;
    try{
      const ext=file.name.toLowerCase().split('.').pop();
      if(!['txt','csv','xlsx'].includes(ext))throw new Error('仅支持 TXT、CSV、XLSX；Word / PDF 可先复制文字到输入框，旧版 XLS 请另存为 XLSX');
      if(file.size>(ext==='xlsx'?10:1)*1024*1024)throw new Error('文件超过大小限制，请按客户拆分后上传');
      let loadedSheets=null,text='';
      if(ext==='xlsx'){
        const res=await fetch('/api/import-xlsx',{method:'POST',body:file});const result=await res.json();
        if(!res.ok)throw new Error(result.error||'Excel 解析失败');loadedSheets=result.sheets;
      }else{
        text=await file.text();if(text.includes('\uFFFD'))text=new TextDecoder('gb18030').decode(await file.arrayBuffer());
        if(ext==='csv')loadedSheets=[{name:'CSV',rows:parseCSV(text)}];
        else if(text.length>50000)throw new Error('需求文字超过 50,000 字符，请拆分后导入');
      }
      if(!isCurrent())return;
      sourceName=file.name;sourceText='';sheets=loadedSheets;candidates=[];inputScreen();
      if(sheets){if(!sheets.length)throw new Error('文件没有可读取的工作表');showSheet(0);}else{sourceText=text;$('#brief-source-text').value=text;fillDraft(text,sourceName);}
    }catch(e){if(isCurrent())fail(e.message);}finally{if(isCurrent())$('[data-intake-action="parse"]').disabled=false;}
  }
  function fillDraft(text,source){
    const extracted=extractBrief(text,source);
    if(!Object.keys(extracted.values).length)throw new Error('未识别到明确的需求字段，请补充字段名称，或使用空白需求模板。');
    stage(extracted);generation++;$('#modal').close();
    document.querySelector('.brief')?.scrollIntoView({block:'start',behavior:'smooth'});
    toast('已自动填入左侧客户投放需求，可直接修改，最后整体确认');
  }
  function showDraftSource(){
    const pending=getState().briefDraft;if(!pending)return;
    modal('导入的客户需求原文','<div class="brief-intake"><p>来源：'+esc(pending.source)+'</p><div class="intake-original"><pre>'+esc(pending.rawText)+'</pre></div></div>');
  }
  function showReceipt(){
    const receipt=getState().briefImport;if(!receipt)return;
    modal('客户需求导入记录',`<div class="brief-intake"><span class="tag">已人工确认</span><p>来源：${esc(receipt.source)}<br>确认时间：${esc(new Date(receipt.confirmedAt).toLocaleString('zh-CN'))}</p><div class="detail-grid">${BRIEF_FIELDS.filter(f=>Object.hasOwn(receipt.applied,f.key)).map(f=>`<div><small>${f.label}</small><strong>${esc(pretty(f.key,receipt.applied[f.key]))}</strong><small>原值：${esc(pretty(f.key,receipt.before[f.key]))}</small></div>`).join('')}</div><details class="intake-original"><summary>查看导入原文</summary><pre>${esc(receipt.rawText)}</pre></details><p>此处记录当次确认的值；当前需求可能已被后续编辑。</p></div>`);
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-intake-action]');if(!button||button.disabled)return;
    const action=button.dataset.intakeAction;
    if(action==='open')open();
    if(action==='receipt')showReceipt();
    if(action==='source')showDraftSource();
    if(action==='choose-file')$('#brief-intake-file').click();
    if(action==='cancel'){generation++;$('#modal').close();}
    if(action==='template'){
      const notes=['填写实际客户品牌','银行保险 / 食品饮料 / 保健品 / 私立医院 / 乐园（主题公园）','单位为万元，范围 100–500','公交车身 / 地铁出入口，可组合','YYYY-MM-DD，2027 年内','YYYY-MM-DD，2027 年内','客户明确的投放目标','客户确认的目标受众','客户要求覆盖的区域','仅填写已确认门店名称，不推算坐标','其他约束或交付要求'];
      download('客户需求导入模板.csv',toCSV([['字段','填写内容','填写说明'],...BRIEF_TEMPLATE_HEADERS.map((h,i)=>[h,'',notes[i]])]),'text/csv;charset=utf-8');
    }
    if(action==='parse'){
      sourceText=$('#brief-source-text').value;
      try{const selected=$('#brief-intake-record')?.value;const source=selected!==undefined&&selected!==''?candidates[Number(selected)]?.source:sourceName;fillDraft(sourceText,source||sourceName);}catch(e){fail(e.message);}
    }
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='brief-intake-file'){const file=el.files[0];el.value='';loadFile(file);}
    if(el.id==='brief-intake-sheet')showSheet(Number(el.value));
    if(el.id==='brief-intake-record'){if(el.value!=='')selectCandidate(Number(el.value));else {sourceText='';$('#brief-source-text').value='';}}
  });
  return {open,showReceipt};
}
