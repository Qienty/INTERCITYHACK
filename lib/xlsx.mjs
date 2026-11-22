import { inflateRawSync } from 'node:zlib';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const unesc=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,x)=>x[0]==='#'?String.fromCodePoint(x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):Number(x.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]));
const attr=(s,k)=>unesc((s.match(new RegExp('(?:^|\\s)'+k+'="([^"]*)"'))||[])[1]||'');
const texts=s=>[...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>unesc(x[1])).join('');
export function unzip(bytes) {
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  if(bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)throw new Error('请选择有效的 .xlsx 文件（不支持旧版 .xls）');
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Excel ZIP 目录不完整');
  const count=bytes.readUInt16LE(end+10);if(count>1000)throw new Error('工作簿文件数量过多');
  let at=bytes.readUInt32LE(end+16),total=0;const out={};
  for(let i=0;i<count;i++) {
    if(at+46>bytes.length||bytes.readUInt32LE(at)!==0x02014b50)throw new Error('Excel ZIP 目录损坏');
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),compressed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),n=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42);
    const name=bytes.subarray(at+46,at+46+n).toString('utf8');at+=46+n+extra+comment;
    if(flags&1)throw new Error('不支持加密工作簿');
    total+=size;if(total>32*1024*1024||size>12*1024*1024)throw new Error('工作簿解压后过大');
    if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)throw new Error('ZIP 文件头损坏');
    const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);
    if(start+compressed>bytes.length)throw new Error('ZIP 数据截断');
    const payload=bytes.subarray(start,start+compressed);
    if(![0,8].includes(method))throw new Error('不支持该 Excel 压缩格式');
    const result=method===8?inflateRawSync(payload,{maxOutputLength:12*1024*1024}):payload;
    if(result.length!==size)throw new Error('ZIP 解压尺寸不一致');
    out[name]=result.toString('utf8');
  }
  return out;
}
export function readXlsx(bytes) {
  const files=unzip(bytes), workbook=files['xl/workbook.xml'];
  if(!workbook)throw new Error('缺少 Excel workbook.xml');
  const strings=[...(files['xl/sharedStrings.xml']||'').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>texts(m[1]));
  const styles=files['xl/styles.xml']||'',numFmts={};
  for(const m of styles.matchAll(/<numFmt\s([^>]*?)\/?\s*>/g))numFmts[attr(m[1],'numFmtId')]=attr(m[1],'formatCode');
  const xfs=(styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)||[])[1]||'';
  const dateStyles=[...xfs.matchAll(/<xf\s([^>]*?)\/?\s*>/g)].map(m=>{const id=+attr(m[1],'numFmtId'),fmt=(numFmts[id]||'').replace(/"[^"]*"|\[[^\]]*\]/g,'');return (id>=14&&id<=22)||/[ymd]/i.test(fmt);});
  const relationships={};for(const m of (files['xl/_rels/workbook.xml.rels']||'').matchAll(/<Relationship\s([^>]*?)\/?\s*>/g)){const target=attr(m[1],'Target');relationships[attr(m[1],'Id')]=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');}
  const use1904=/date1904="(?:1|true)"/.test(workbook),sheets=[];
  for(const sm of workbook.matchAll(/<sheet\s([^>]*?)\/?\s*>/g)) {
    const name=attr(sm[1],'name'),target=relationships[attr(sm[1],'r:id')],xml=files[target];if(!xml)continue;
    const rows=[];let cellCount=0;
    for(const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const row=[],rowNumber=Number(attr(rm[1],'r'))||rows.length+1;let nextColumn=1;
      if(!Number.isInteger(rowNumber)||rowNumber<1||rowNumber>20000)throw new Error('工作表行号无效或超过 20000');
      for(const cm of (rm[2]||'').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if(++cellCount>200000)throw new Error('单个工作表单元格过多');
        const ref=attr(cm[1],'r'),letters=(ref.match(/^[A-Z]+/)||[])[0];let col=letters?0:nextColumn;if(letters)for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;nextColumn=col+1;
        if(col>200)throw new Error('导入表格列数超过 200');
        const content=cm[2]||'',type=attr(cm[1],'t'),raw=(content.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)||[])[1];
        let value=type==='inlineStr'?texts(content):type==='s'?(strings[Number(raw)]??''):raw===undefined?'':unesc(raw);
        if(type==='e')throw new Error('工作簿包含错误单元格 '+ref+'，请修复后再导入');
        if(/<f(?:\s|>)/.test(content)&&raw===undefined)throw new Error('公式 '+ref+' 没有缓存值，请在 Excel 计算并保存后导入');
        if(type!=='s'&&type!=='inlineStr'&&type!=='str'&&value!=='') {
          const num=Number(value);if(Number.isFinite(num))value=dateStyles[Number(attr(cm[1],'s')||0)]?new Date((num-(use1904?24107:25569))*86400000).toISOString().slice(0,10):num;
        }
        row[col-1]=value;
      }
      while(rows.length<rowNumber)rows.push([]);
      rows[rowNumber-1]=Array.from(row,v=>v??'');
    }
    while(rows.length&&!rows.at(-1).some(v=>v!==''&&v!==undefined))rows.pop();
    if(rows.length)sheets.push({name,rows});
  }
  if(!sheets.length)throw new Error('没有可读取的数据工作表');return sheets;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buf){let crc=0xffffffff;for(const b of buf)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function zip(files) {
  const parts=[],central=[];let offset=0;
  for(const [name,text]of Object.entries(files)){const fname=Buffer.from(name),data=Buffer.from(text),crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(fname.length,26);parts.push(local,fname,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(fname.length,28);c.writeUInt32LE(offset,42);central.push(c,fname);offset+=30+fname.length+data.length;}
  const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,dir,end]);
}
function colLabel(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export function writeXlsx(sheets) {
  if(!Array.isArray(sheets)||!sheets.length||sheets.length>24)throw new Error('无效的导出工作表');
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const files={'_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'};
  files['xl/styles.xml']='<styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF213B38"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
  sheets.forEach((sheet,i)=>{if(!Array.isArray(sheet.rows)||sheet.rows.length>10000)throw new Error('导出数据过多');const rows=sheet.rows.map((row,r)=>'<row r="'+(r+1)+'">'+row.map((v,c)=>{const ref=colLabel(c)+(r+1);return typeof v==='number'&&Number.isFinite(v)?'<c r="'+ref+'" s="'+(r===0?1:2)+'"><v>'+v+'</v></c>':'<c r="'+ref+'" t="inlineStr" s="'+(r===0?1:0)+'"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';}).join('')+'</row>').join('');files['xl/worksheets/sheet'+(i+1)+'.xml']='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+ns+'"><cols><col min="1" max="50" width="22" customWidth="1"/></cols><sheetData>'+rows+'</sheetData></worksheet>';});
  files['xl/workbook.xml']='<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+esc(String(s.name||'Sheet'+(i+1)).replace(/[\\/?*\[\]:]/g,' ').slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
  files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  files['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
  return zip(files);
}
