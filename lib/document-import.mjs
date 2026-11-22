import {unzip} from './xlsx.mjs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
function xmlText(value){return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,x)=>x[0]==='#'?String.fromCodePoint(x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):Number(x.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]));}
export async function extractDocument(bytes,filename){
  if(bytes.length>10*1024*1024)throw new Error('需求文件超过10MB');
  const ext=filename.toLowerCase().split('.').pop(),locations=[],warnings=[];
  if(ext==='docx'){
    const zip=unzip(bytes),xml=zip['word/document.xml'];if(!xml)throw new Error('不是有效的Word DOCX文件；旧版DOC请另存为DOCX');
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('不支持含外部实体定义的Word文件');
    let index=0;for(const match of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)){index++;const text=[...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br)\b[^>]*\/?\s*>/g)].map(m=>m[2]?(m[2]==='tab'?'\t':'\n'):xmlText(m[1])).join('').trim();if(text)locations.push({location:'段落 '+index,text});}
    warnings.push('Word按正文段落提取；图片、文本框、页眉页脚及复杂表格阅读顺序需人工对照原件');
  }else if(ext==='pdf'){
    if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('不是有效的PDF文件');
    const require=createRequire(import.meta.url);let target;try{target=require.resolve('pdfjs-dist/legacy/build/pdf.mjs');}catch{target=resolve(dirname(dirname(process.execPath)),'node_modules/pdfjs-dist/legacy/build/pdf.mjs');}
    let pdfjs;try{pdfjs=await import(pathToFileURL(target));}catch{throw new Error('服务器缺少PDF解析依赖，请运行 npm install --omit=dev 后重启');}
    const task=pdfjs.getDocument({standardFontDataUrl:resolve(dirname(target),'../../standard_fonts').replaceAll(String.fromCharCode(92),'/')+'/',cMapUrl:resolve(dirname(target),'../../cmaps').replaceAll(String.fromCharCode(92),'/')+'/',cMapPacked:true,data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,disableStream:true,stopAtErrors:true});
    const timeout=setTimeout(()=>task.destroy(),20000);
    try{const document=await task.promise;if(document.numPages>150)throw new Error('PDF超过150页，请按客户拆分');for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),content=await page.getTextContent(),text=content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':' ')).join('').trim();if(text)locations.push({location:'第 '+i+' 页',text});page.cleanup();}if(locations.length<document.numPages)warnings.push('部分页面无可复制文字，可能包含扫描图像，未进行OCR');}finally{clearTimeout(timeout);await task.destroy();}
  }else throw new Error('仅支持DOCX和可复制文字的PDF；不执行宏，不模拟OCR');
  const text=locations.map(p=>'【'+p.location+'】\n'+p.text).join('\n\n');if(text.length>50000)throw new Error('提取文字超过50,000字符，请拆分后导入');
  if(!text.trim())return {text:'',locations:[],warnings:['未提取到正文文字。扫描PDF或图片需要OCR，当前未配置OCR，不会生成模拟需求。'],needsOCR:ext==='pdf',sha256:createHash('sha256').update(bytes).digest('hex')};
  return {text,locations,warnings,needsOCR:false,sha256:createHash('sha256').update(bytes).digest('hex'),method:ext==='pdf'?'PDF.js真实文字提取':'DOCX正文XML真实提取'};
}
