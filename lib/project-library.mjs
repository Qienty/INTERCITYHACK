export function projectDelta(base,records){
  const originals=new Map(base.map(r=>[r.id,r])),patches=[],extra=[];
  for(const row of records){const before=originals.get(row.id);if(!before){extra.push(row);continue;}const values={};for(const key of new Set([...Object.keys(before),...Object.keys(row)]))if(JSON.stringify(row[key])!==JSON.stringify(before[key]))values[key]=row[key]===undefined?null:row[key];if(Object.keys(values).length)patches.push({id:row.id,values});}
  return {patches,extra,ids:records.map(r=>r.id)};
}
export function projectId(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const bytes=new Uint8Array(16);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);return Date.now().toString(36)+'-'+Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');}
export function restoreProjectRecords(base,delta){const rows=new Map(base.map(r=>[r.id,structuredClone(r)]));for(const patch of delta.patches)rows.set(patch.id,{...rows.get(patch.id),...patch.values});for(const row of delta.extra)rows.set(row.id,structuredClone(row));return delta.ids.map(id=>rows.get(id)).filter(Boolean);}
export function projectCopy(state){const copy=structuredClone(state);delete copy.projectMeta;delete copy.briefImport;delete copy.briefDraft;copy.records=copy.records.map(r=>({...r,quoteReconfirmationRequired:true,inventoryReconfirmationRequired:true}));copy.execution={...(copy.execution||{}),tasks:[],basis:''};copy.monitoring={...(copy.monitoring||{}),nodes:[],basis:''};return copy;}
export function similarProjects(projects,brief){return projects.map(p=>({...p,similarity:(p.industry===brief.industry?2:0)+Math.max(0,1-Math.abs(p.budget-brief.budget)/Math.max(1,brief.budget))})).sort((a,b)=>b.similarity-a.similarity||b.updatedAt.localeCompare(a.updatedAt));}
export function createProjectLibrary(){
  let opened;
  const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  async function db(){if(!opened)opened=new Promise((resolve,reject)=>{const r=indexedDB.open('xinyun-proposals',1);r.onupgradeneeded=()=>{for(const name of ['projects','sourceVersions','attachments'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('方案库升级被其他窗口占用，请关闭旧窗口后重试'));});return opened;}
  async function get(store,id){return request((await db()).transaction(store).objectStore(store).get(id));}
  async function put(store,value){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  return {
    async list(){return request((await db()).transaction('projects').objectStore('projects').getAll());},
    async save(state,{name,id=state.projectMeta?.id||projectId(),archive=false,baseline,sourceVersion}={}){
      const old=await get('projects',id);if(old?.status==='archived')throw new Error('归档版本不可改写，请复制为新方案');
      let sourceId=state.projectMeta?.sourceVersion||sourceVersion||state.sourceVersion;
      let source=await get('sourceVersions',sourceId),candidate=source?.records||(sourceId===sourceVersion?baseline:null);
      const signature=rows=>(rows||[]).map(r=>r.id).sort().join('|');
      if(!candidate||signature(candidate)!==signature(state.records)){
        // A newly imported stock collection is stored once, independently of each quote's edits.
        const sourceRecords=state.records.map(record=>{const row=structuredClone(record);for(const key of ['unitPrice','production','priceIncludesTax','periodDays','taxRate'])row[key]=null;for(const key of ['priceSource','billingUnit','billingSource'])row[key]='';for(const key of ['conditionsConfirmedAt','quoteReconfirmationRequired','inventoryReconfirmationRequired','updatedFields','updateSource'])delete row[key];return row;}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
        const canonical=JSON.stringify(sourceRecords);let a=2166136261,z=5381;for(let i=0;i<canonical.length;i++){a=Math.imul(a^canonical.charCodeAt(i),16777619);z=Math.imul(z,33)^canonical.charCodeAt(i);}const key='stock-'+(a>>>0).toString(16)+(z>>>0).toString(16)+'-'+canonical.length;let suffix=0;
        while(true){sourceId=key+(suffix?'-'+suffix:'');source=await get('sourceVersions',sourceId);if(!source||JSON.stringify(source.records)===canonical)break;suffix++;}
        if(!source){source={id:sourceId,originVersion:state.sourceVersion,records:sourceRecords};await put('sourceVersions',source);}
      }else if(!source){source={id:sourceId,records:structuredClone(candidate)};await put('sourceVersions',source);}
      const snapshot=structuredClone(state);delete snapshot.records;delete snapshot.projectMeta;
      const entry={id,name:String(name||old?.name||state.projectMeta?.name||state.brief.brand||'未命名方案').trim().slice(0,100),status:archive?'archived':'draft',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),revision:(old?.revision||0)+1,sourceId,industry:state.brief.industry,budget:state.brief.budget,snapshot,delta:projectDelta(source.records,state.records)};
      await put('projects',entry);return entry;
    },
    async open(id){const entry=await get('projects',id);if(!entry)throw new Error('方案不存在');const source=await get('sourceVersions',entry.sourceId);if(!source)throw new Error('历史源快照缺失，已阻止用新库存替换');return {...structuredClone(entry.snapshot),records:restoreProjectRecords(source.records,entry.delta),sourceVersion:entry.sourceId,projectMeta:{id:entry.id,name:entry.name,sourceVersion:entry.sourceId,status:entry.status,revision:entry.revision}};},
    async rename(id,name){const entry=await get('projects',id);if(!entry)throw new Error('方案不存在');if(!String(name).trim())throw new Error('方案名称不能为空');return put('projects',{...entry,name:String(name).trim().slice(0,100),updatedAt:new Date().toISOString()});},
    async trash(id){const entry=await get('projects',id);if(!entry)throw new Error('方案不存在');return put('projects',{...entry,priorStatus:entry.status,status:'trash'});},
    async restore(id){const entry=await get('projects',id);return put('projects',{...entry,status:entry.priorStatus||'draft'});},
    async addAttachment(file){if(file.size>10*1024*1024)throw new Error('单个证据附件限10MB');if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))throw new Error('证据附件仅支持PNG、JPEG、WebP或PDF');const item={id:projectId(),name:file.name,size:file.size,type:file.type,blob:file,at:new Date().toISOString()};await put('attachments',item);return {id:item.id,name:item.name,size:item.size,type:item.type,at:item.at};},
    async attachment(id){const item=await get('attachments',id);if(!item)throw new Error('本浏览器缺少该证据文件，项目JSON只包含附件引用');return item;}
  };
}
