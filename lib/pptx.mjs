// 零依赖 PPTX（Office Open XML + ZIP）导出：自建 16:9 版式，仅用标准库。
const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};
const RT = {
  officeDocument: NS.r + '/officeDocument',
  slide: NS.r + '/slide',
  slideMaster: NS.r + '/slideMaster',
  slideLayout: NS.r + '/slideLayout',
  theme: NS.r + '/theme',
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: NS.r + '/extended-properties',
};
const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};
const FONT = 'Microsoft YaHei';
const SLIDE_W = 12192000, SLIDE_H = 6858000, PT = 12700; // 16:9，EMU / 1pt
const MARGIN = 548640, TITLE_Y = 457200, TITLE_H = 777240, BODY_TOP = 1463040;
const BOTTOM = MARGIN, GAP = 91440, NOTE_GAP = 91440, BULLET_LINE = 384048; // 0.6" / 0.1" / 0.42"
const BODY_W = SLIDE_W - 2 * MARGIN;
const COLOR = { title: '1F3B38', body: '2B2B2B', text: '3A3A3A', note: '8A8A8A', line: 'D9DEDB', headerBg: '1F3B38', headerText: 'FFFFFF', band: 'F4F7F5', cell: '333333', white: 'FFFFFF' };
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const clean = s => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
const linesOf = s => clean(s).split('\n');
const widthOf = s => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c >= 0x2E80 || (c >= 0x1100 && c <= 0x115F) ? 1 : 0.55; } return n; };
const wrapCount = (line, size, width) => Math.max(1, Math.ceil(widthOf(line) / Math.max(4, (width / PT) / size)));
const textChars = block => block.type === 'bullets' ? (Array.isArray(block.items) ? block.items.map(clean).join('\n') : '')
  : block.type === 'text' || block.type === 'note' ? clean(block.text)
  : block.type === 'table' ? [(Array.isArray(block.columns) ? block.columns : []).join('\n'), ...(Array.isArray(block.rows) ? block.rows : []).map(r => Array.isArray(r) ? r.join('\n') : '')].join('\n')
  : '';

const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(buf) { let crc = 0xffffffff; for (const b of buf) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const fname = Buffer.from(name), data = Buffer.from(text, 'utf8'), crc = crc32(data), local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
    parts.push(local, fname, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(fname.length, 28); c.writeUInt32LE(offset, 42); central.push(c, fname);
    offset += 30 + fname.length + data.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

function rPr({ sz = 1600, bold = false, color = COLOR.body } = {}) {
  return '<a:rPr lang="zh-CN" altLang="en-US" sz="' + Math.round(sz) + '"' + (bold ? ' b="1"' : '') + ' dirty="0"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:latin typeface="' + FONT + '"/><a:ea typeface="' + FONT + '"/><a:cs typeface="' + FONT + '"/></a:rPr>';
}
function para(text, opts = {}) {
  const { sz = 1600, bold = false, color = COLOR.body, align = 'l', marL = 0, indent = 0, bullet = '', lnSpc = '', spcBef = 0, spcAft = 0 } = opts;
  const pPr = '<a:pPr algn="' + align + '"' + (marL ? ' marL="' + marL + '"' : '') + (indent ? ' indent="' + indent + '"' : '') + '>'
    + lnSpc + (spcBef ? '<a:spcBef><a:spcPts val="' + Math.round(spcBef) + '"/></a:spcBef>' : '') + (spcAft ? '<a:spcAft><a:spcPts val="' + Math.round(spcAft) + '"/></a:spcAft>' : '')
    + (bullet ? '<a:buFont typeface="Arial"/><a:buChar char="' + esc(bullet) + '"/>' : '<a:buNone/>') + '</a:pPr>';
  const run = text === '' ? '<a:endParaRPr lang="zh-CN" sz="' + Math.round(sz) + '" dirty="0"/>'
    : '<a:r>' + rPr({ sz, bold, color }) + '<a:t xml:space="preserve">' + esc(text) + '</a:t></a:r>';
  return '<a:p>' + pPr + run + '</a:p>';
}
function shape({ id, x, y, cx, cy, name = '文本框', paras = '', anchor = 't' }) {
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
    + '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>'
    + '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="' + anchor + '"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paras + '</p:txBody></p:sp>';
}
function rect({ id, x, y, cx, cy, name, color }) {
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
    + '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>'
    + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>';
}
function measureBlock(block, fonts, scale) {
  const type = block.type;
  if (type === 'bullets') {
    const items = (Array.isArray(block.items) ? block.items : []).map(clean).map(v => v.trim()).filter(Boolean);
    if (!items.length) return null;
    const lines = items.reduce((n, item) => n + linesOf(item).reduce((k, l) => k + wrapCount(l, fonts.bullet, BODY_W), 0), 0);
    return { type, items, font: fonts.bullet, linePts: 3024 * scale, h: lines * BULLET_LINE * scale + 45720 };
  }
  if (type === 'text') {
    const text = clean(block.text).trim();
    if (!text) return null;
    const lines = linesOf(text).reduce((n, l) => n + wrapCount(l, fonts.text, BODY_W), 0);
    return { type, text, font: fonts.text, h: lines * fonts.text * 1.2 * PT + 45720 };
  }
  if (type === 'table') {
    const header = (Array.isArray(block.columns) ? block.columns : []).map(clean);
    const rows = (Array.isArray(block.rows) ? block.rows : []).filter(Array.isArray).map(r => r.map(clean));
    const cols = Math.max(header.length, ...rows.map(r => r.length), 0);
    if (!cols) return null;
    const head = Array.from({ length: cols }, (_, i) => header[i] ?? '');
    const body = rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
    const weights = head.map((h, i) => Math.max(6, ...[h, ...body.map(r => r[i])].flatMap(linesOf).map(widthOf)));
    const total = weights.reduce((a, b) => a + b, 0);
    const minW = Math.min(1005840, Math.floor(BODY_W / cols));
    const widths = weights.map(w => Math.max(minW, Math.floor(BODY_W * w / total)));
    widths[widths.length - 1] += BODY_W - widths.reduce((a, b) => a + b, 0);
    const linesOfCell = (text, i) => Math.max(1, ...linesOf(text).map(l => wrapCount(l, fonts.table, widths[i] - 91440)));
    const rowH = (cells, isHead) => {
      const n = Math.max(1, ...cells.map((t, i) => linesOfCell(t, i)));
      return Math.max((isHead ? 0.36 : 0.32) * 914400 * scale, n * fonts.table * 1.2 * PT + 2 * 27432);
    };
    const heights = [rowH(head, true), ...body.map(r => rowH(r, false))];
    return { type, head, rows: body, widths, heights, size: fonts.table, h: heights.reduce((a, b) => a + b, 0) };
  }
  return null;
}
function cellXml(text, { header, size, fill }) {
  const paras = linesOf(text).map(line => para(line, { sz: size * 100, bold: header, color: header ? COLOR.headerText : COLOR.cell })).join('');
  const border = tag => '<a:' + tag + ' w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="' + COLOR.line + '"/></a:solidFill><a:prstDash val="solid"/></a:' + tag + '>';
  return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + paras + '</a:txBody>'
    + '<a:tcPr marL="45720" marR="45720" marT="27432" marB="27432" anchor="ctr">' + border('lnL') + border('lnR') + border('lnT') + border('lnB')
    + '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill></a:tcPr></a:tc>';
}
function tableXml(m, { id, x, y }) {
  const rows = ['<a:tr h="' + Math.round(m.heights[0]) + '">' + m.head.map((t, i) => cellXml(t, { header: true, size: m.size, fill: COLOR.headerBg })).join('') + '</a:tr>'];
  m.rows.forEach((r, ri) => {
    rows.push('<a:tr h="' + Math.round(m.heights[ri + 1]) + '">' + r.map((t, i) => cellXml(t, { header: false, size: m.size, fill: ri % 2 ? COLOR.band : COLOR.white })).join('') + '</a:tr>');
  });
  return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="表格 ' + id + '"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
    + '<p:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + m.widths.reduce((a, b) => a + b, 0) + '" cy="' + Math.round(m.h) + '"/></p:xfrm>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>'
    + '<a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>'
    + '<a:tblGrid>' + m.widths.map(w => '<a:gridCol w="' + w + '"/>').join('') + '</a:tblGrid>' + rows.join('') + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
}
function renderBlock(m, { x, y, id }) {
  if (m.type === 'bullets') {
    const paras = m.items.flatMap(item => linesOf(item).map(line => para(line, {
      sz: m.font * 100, color: COLOR.body, marL: 274320, indent: -274320, bullet: '•',
      lnSpc: '<a:lnSpc><a:spcPts val="' + Math.round(m.linePts) + '"/></a:lnSpc>',
    }))).join('');
    return shape({ id, name: '要点 ' + id, x, y, cx: BODY_W, cy: Math.round(m.h), paras, anchor: 't' });
  }
  if (m.type === 'text') {
    const paras = linesOf(m.text).map(line => para(line, { sz: m.font * 100, color: COLOR.text, lnSpc: '<a:lnSpc><a:spcPct val="120000"/></a:lnSpc>' })).join('');
    return shape({ id, name: '正文 ' + id, x, y, cx: BODY_W, cy: Math.round(m.h), paras, anchor: 't' });
  }
  return tableXml(m, { id, x, y });
}
function slideXml(slide, index, deck) {
  const title = linesOf(slide.title).filter((l, i, a) => !(i === 0 && a.length === 1 && !l.trim())) ;
  const titleText = title.length ? title : ['未命名页面'];
  const noteText = slide.blocks.filter(b => b.type === 'note').map(b => clean(b.text).trim()).filter(Boolean).join('\n');
  const noteLines = noteText ? linesOf(noteText).reduce((n, l) => n + wrapCount(l, 10, BODY_W), 0) : 0;
  const noteH = noteText ? Math.min(1371600, Math.max(457200, noteLines * 10 * 1.2 * PT + 36576)) : 0;
  const noteY = SLIDE_H - BOTTOM - noteH;
  const bodyBottom = noteText ? noteY - NOTE_GAP : SLIDE_H - BOTTOM;
  const visual = slide.blocks.filter(b => b.type !== 'note');
  let fonts = { bullet: 16, text: 14, table: 10.5 };
  let items = visual.map(b => measureBlock(b, fonts, 1)).filter(Boolean);
  const total = () => items.reduce((n, m) => n + m.h, 0) + Math.max(0, items.length - 1) * GAP;
  if (items.length && total() > bodyBottom - BODY_TOP) {
    const scale = Math.max(0.6, (bodyBottom - BODY_TOP) / total());
    fonts = { bullet: 16 * scale, text: 14 * scale, table: 10.5 * scale };
    items = visual.map(b => measureBlock(b, fonts, scale)).filter(Boolean);
  }
  let shapes = '', id = 2;
  const titleH = Math.max(TITLE_H, Math.min(1097280, titleText.length * 28 * 1.2 * PT + 45720));
  shapes += shape({ id: id++, name: '标题', x: MARGIN, y: TITLE_Y, cx: BODY_W, cy: Math.round(titleH), paras: titleText.map(line => para(line, { sz: 2800, bold: true, color: COLOR.title })).join('') });
  shapes += rect({ id: id++, name: '标题分隔线', x: MARGIN, y: Math.round(TITLE_Y + titleH + 45720), cx: BODY_W, cy: 18288, color: COLOR.title });
  let y = BODY_TOP;
  for (const m of items) { shapes += renderBlock(m, { x: MARGIN, y: Math.round(y), id: id++ }); y += m.h + GAP; }
  if (noteText) shapes += shape({ id: id++, name: '注释', x: MARGIN, y: Math.round(noteY), cx: BODY_W, cy: Math.round(noteH), paras: linesOf(noteText).map(line => para(line, { sz: 1000, color: COLOR.note })).join('') });
  return HEADER + '<p:sld xmlns:a="' + NS.a + '" xmlns:r="' + NS.r + '" xmlns:p="' + NS.p + '"><p:cSld><p:spTree>' + GRP + shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}
function rels(items) {
  return HEADER + '<Relationships xmlns="' + NS.rel + '">' + items.map(([id, type, target]) => '<Relationship Id="' + id + '" Type="' + type + '" Target="' + target + '"/>').join('') + '</Relationships>';
}
function themeXml() {
  const clr = '<a:clrScheme name="Xinyun"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3B38"/></a:dk2><a:lt2><a:srgbClr val="F2F4F2"/></a:lt2><a:accent1><a:srgbClr val="2E6B62"/></a:accent1><a:accent2><a:srgbClr val="8C6A3F"/></a:accent2><a:accent3><a:srgbClr val="4F6D7A"/></a:accent3><a:accent4><a:srgbClr val="A3573C"/></a:accent4><a:accent5><a:srgbClr val="6B7F5E"/></a:accent5><a:accent6><a:srgbClr val="7A5C73"/></a:accent6><a:hlink><a:srgbClr val="1F5FA8"/></a:hlink><a:folHlink><a:srgbClr val="6A4C93"/></a:folHlink></a:clrScheme>';
  const font = '<a:fontScheme name="Xinyun"><a:majorFont><a:latin typeface="' + FONT + '"/><a:ea typeface="' + FONT + '"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="' + FONT + '"/><a:ea typeface="' + FONT + '"/><a:cs typeface=""/></a:minorFont></a:fontScheme>';
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const ln = '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
  const fmt = '<a:fmtScheme name="Xinyun"><a:fillStyleLst>' + fill + fill + fill + '</a:fillStyleLst><a:lnStyleLst>' + ln + ln + ln + '</a:lnStyleLst>'
    + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    + '<a:bgFillStyleLst>' + fill + fill + fill + '</a:bgFillStyleLst></a:fmtScheme>';
  return HEADER + '<a:theme xmlns:a="' + NS.a + '" name="新云提案"><a:themeElements>' + clr + font + fmt + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
}
function masterXml() {
  const style = (sz, bold) => '<a:lvl1pPr><a:defRPr sz="' + sz + '"' + (bold ? ' b="1"' : '') + '><a:solidFill><a:srgbClr val="' + COLOR.title + '"/></a:solidFill><a:latin typeface="' + FONT + '"/><a:ea typeface="' + FONT + '"/><a:cs typeface="' + FONT + '"/></a:defRPr></a:lvl1pPr>';
  return HEADER + '<p:sldMaster xmlns:a="' + NS.a + '" xmlns:r="' + NS.r + '" xmlns:p="' + NS.p + '"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + GRP + '</p:spTree></p:cSld>'
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    + '<p:txStyles><p:titleStyle>' + style(2800, true) + '</p:titleStyle><p:bodyStyle>' + style(1600, false) + '</p:bodyStyle><p:otherStyle>' + style(1400, false) + '</p:otherStyle></p:txStyles></p:sldMaster>';
}
function layoutXml() {
  return HEADER + '<p:sldLayout xmlns:a="' + NS.a + '" xmlns:r="' + NS.r + '" xmlns:p="' + NS.p + '" type="blank" preserve="1"><p:cSld name="空白"><p:spTree>' + GRP + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
}
function presentationXml(count) {
  const ids = Array.from({ length: count }, (_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('');
  return HEADER + '<p:presentation xmlns:a="' + NS.a + '" xmlns:r="' + NS.r + '" xmlns:p="' + NS.p + '" saveSubsetFonts="1">'
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + '<p:sldIdLst>' + ids + '</p:sldIdLst><p:sldSz cx="' + SLIDE_W + '" cy="' + SLIDE_H + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
}
function normalizeDeck(input) {
  const data = input && typeof input === 'object' ? input : {};
  const title = clean(data.title).trim().slice(0, 200) || '结案报告';
  const subtitle = clean(data.subtitle).trim().slice(0, 200);
  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (!slides.length) throw new Error('结案报告没有可导出的页面');
  if (slides.length > 40) throw new Error('结案报告最多导出 40 页，当前 ' + slides.length + ' 页');
  return {
    title, subtitle,
    slides: slides.map((raw, i) => {
      const slide = raw && typeof raw === 'object' ? raw : {};
      const blocks = (Array.isArray(slide.blocks) ? slide.blocks : []).filter(b => b && typeof b === 'object');
      const chars = blocks.reduce((n, b) => n + textChars(b).length, 0);
      if (chars > 8000) throw new Error('第 ' + (i + 1) + ' 页文本约 ' + chars + ' 字符，超过单页 8000 字符上限，请拆分页面后再导出');
      const title = clean(slide.title).trim() || (i === 0 ? '' : '第 ' + (i + 1) + ' 页');
      return { title, blocks };
    }),
  };
}
export function writePptx(presentation) {
  const deck = normalizeDeck(presentation);
  if (deck.title) deck.slides[0].title = deck.slides[0].title || deck.title;
  const n = deck.slides.length, now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const files = {};
  files['[Content_Types].xml'] = HEADER + '<Types xmlns="' + NS.ct + '"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/ppt/presentation.xml" ContentType="' + CT.presentation + '"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + CT.slideMaster + '"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + CT.slideLayout + '"/><Override PartName="/ppt/theme/theme1.xml" ContentType="' + CT.theme + '"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="' + CT.core + '"/><Override PartName="/docProps/app.xml" ContentType="' + CT.app + '"/>'
    + deck.slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="' + CT.slide + '"/>').join('') + '</Types>';
  files['_rels/.rels'] = rels([['rId1', RT.officeDocument, 'ppt/presentation.xml'], ['rId2', RT.core, 'docProps/core.xml'], ['rId3', RT.app, 'docProps/app.xml']]);
  files['docProps/core.xml'] = HEADER + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + '<dc:title>' + esc(deck.title) + '</dc:title><dc:subject>' + esc(deck.subtitle) + '</dc:subject><dc:creator>上海新云传媒 · 提案工作台</dc:creator><cp:lastModifiedBy>上海新云传媒 · 提案工作台</cp:lastModifiedBy>'
    + '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
  files['docProps/app.xml'] = HEADER + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>新云传媒 · 提案工作台</Application><PresentationFormat>全屏显示(16:9)</PresentationFormat><Slides>' + n + '</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><Company>上海新云传媒</Company><AppVersion>1.0</AppVersion></Properties>';
  files['ppt/presentation.xml'] = presentationXml(n);
  files['ppt/_rels/presentation.xml.rels'] = rels([['rId1', RT.slideMaster, 'slideMasters/slideMaster1.xml'], ...deck.slides.map((_, i) => ['rId' + (i + 2), RT.slide, 'slides/slide' + (i + 1) + '.xml']), ['rId' + (n + 2), RT.theme, 'theme/theme1.xml']]);
  files['ppt/slideMasters/slideMaster1.xml'] = masterXml();
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([['rId1', RT.slideLayout, '../slideLayouts/slideLayout1.xml'], ['rId2', RT.theme, '../theme/theme1.xml']]);
  files['ppt/slideLayouts/slideLayout1.xml'] = layoutXml();
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([['rId1', RT.slideMaster, '../slideMasters/slideMaster1.xml']]);
  files['ppt/theme/theme1.xml'] = themeXml();
  deck.slides.forEach((slide, i) => {
    const no = i + 1;
    files['ppt/slides/slide' + no + '.xml'] = slideXml(slide, i, deck);
    files['ppt/slides/_rels/slide' + no + '.xml.rels'] = rels([['rId1', RT.slideLayout, '../slideLayouts/slideLayout1.xml']]);
  });
  return zip(files);
}
