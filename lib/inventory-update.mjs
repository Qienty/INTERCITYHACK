import {mapHeaders,normalizeRows,inventoryMatrix} from './engine.mjs';
export function normalizeInventoryPatch(records,matrix,filename){
  const mapping=mapHeaders(matrix[0]||[]);if(mapping.id===undefined)throw new Error('按编号更新须提供媒体编号');
  const data=[],errors=[],warnings=[],seen=new Set(),byId=new Map(records.map(r=>[r.id,r]));
  const targetHeaders=inventoryMatrix([])[0],target=mapHeaders(targetHeaders);
  matrix.slice(1).forEach((raw,index)=>{
    if(!raw.some(v=>String(v??'').trim()))return;const line=index+2,id=String(raw[mapping.id]??'').trim();
    if(!id){errors.push('第 '+line+' 行缺少媒体编号');return;}
    if(seen.has(id)){errors.push('第 '+line+' 行重复编号 '+id);return;}seen.add(id);
    const current=byId.get(id),row=current?inventoryMatrix([current])[1]:Array(targetHeaders.length).fill('');
    for(const [key,col]of Object.entries(mapping)){if(key==='format'&&mapping.format===mapping.media)continue;if(target[key]!==undefined&&raw[col]!==undefined&&String(raw[col]).trim()!=='')row[target[key]]=raw[col];}
    try{const result=normalizeRows([targetHeaders,row],filename);errors.push(...result.errors.map(s=>s.replace('第 2 行','第 '+line+' 行')));warnings.push(...result.warnings.map(s=>s.replace('第 2 行','第 '+line+' 行')));if(result.data[0])data.push({...result.data[0],sourceRow:line});}catch(error){errors.push('第 '+line+' 行：'+error.message);}
  });
  return {data,errors,warnings,mapping,headers:matrix[0],filename};
}
export function upsertInventory(records,result,matrix){
  const mapping=mapHeaders(matrix[0]),byId=new Map(records.map((r,i)=>[r.id,i])),data=records.map(r=>({...r})),errors=[],updated=[],added=[];
  const supplied=Object.keys(mapping).filter(k=>!(k==='format'&&mapping.format===mapping.media));
  if(mapping.id===undefined)return {data:records,errors:['按编号更新须提供媒体编号；不能用临时行号匹配'],updated:[],added:[]};
  for(const row of result.data){
    if(!byId.has(row.id)){data.push(row);byId.set(row.id,data.length-1);added.push(row.id);continue;}
    const index=byId.get(row.id),before=data[index];
    if(before.media!==row.media){errors.push(row.id+'：媒体类型与现有资源冲突，未覆盖');continue;}
    for(const key of ['operator','format'])if(supplied.includes(key)&&row[key]&&before[key]&&row[key]!==before[key])errors.push(row.id+'：'+key+'与现有资源冲突，请先核对稳定编号');
    const raw=matrix[row.sourceRow-1]||[],patch={};
    for(const key of supplied){if(key==='id')continue;const cell=raw[mapping[key]];if(cell!==undefined&&String(cell).trim()!=='')patch[key]=row[key];}
    if(patch.unitPrice!==undefined&&!patch.priceSource)patch.priceSource=(result.filename||'本次按编号更新')+' · 第'+row.sourceRow+'行';
    data[index]={...before,...patch,updateSource:result.filename||'本次按编号更新',updatedFields:Object.keys(patch)};updated.push(row.id);
  }
  return {data:errors.length?records:data,errors,updated,added};
}
