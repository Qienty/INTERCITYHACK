import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writePptx } from '../lib/pptx.mjs';
import { unzip } from '../lib/xlsx.mjs';
import { server } from '../server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const PYTHON = 'C:\\Users\\李昊岭\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const sample = overrides => Object.assign({
  title: '某品牌 · 投放结案报告',
  subtitle: '2026-11-22 · 上海新云传媒',
  slides: [
    {
      title: '项目内容概况',
      blocks: [
        { type: 'bullets', items: ['投放主体：某品牌 & 华东区域', '投放区域：上海 <核心> 商圈', '投放周期：2026-10-01 至 2026-11-15'] },
        { type: 'text', text: '说明："口径"以第三方监测为准 & 不含赠播。' },
        { type: 'table', columns: ['期数', '周期', '说明'], rows: [['第1期', '10/01–10/15', '核心商圈 & 灯箱'], ['第2期', '10/16–10/31', '地铁 <通道> 灯箱']] },
        { type: 'note', text: '数据口径："曝光量"为估算值，误差 ±8%。' },
      ],
    },
    { title: '效果数据', blocks: [{ type: 'bullets', items: ['总曝光约 1.2 亿次', '平均触达频次 8.4 次'] }, { type: 'text', text: '整体达成预期。' }] },
  ],
}, overrides);
const slideNames = files => Object.keys(files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

test('PPTX package carries every required OOXML part and relationship', () => {
  const bytes = writePptx(sample());
  assert.ok(Buffer.isBuffer(bytes), 'writePptx 应返回 Buffer');
  const files = unzip(bytes);
  for (const name of [
    '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml',
    'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels',
    'ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/_rels/slide1.xml.rels',
    'ppt/slides/slide2.xml', 'ppt/slides/_rels/slide2.xml.rels',
  ]) assert.ok(files[name], '缺少部件 ' + name);
  const types = files['[Content_Types].xml'];
  for (const ct of ['presentationml.presentation.main+xml', 'presentationml.slideMaster+xml', 'presentationml.slideLayout+xml', 'presentationml.slide+xml', 'theme+xml']) assert.ok(types.includes(ct), '内容类型缺失 ' + ct);
  const presentation = files['ppt/presentation.xml'];
  assert.match(presentation, /<p:sldSz cx="12192000" cy="6858000"\/>/);
  assert.equal((presentation.match(/<p:sldId /g) || []).length, 2);
  assert.equal((presentation.match(/<p:sldMasterId /g) || []).length, 1);
  assert.match(files['ppt/slideLayouts/slideLayout1.xml'], /type="blank"/);
  assert.match(files['ppt/slideMasters/slideMaster1.xml'], /<p:sldLayoutId id="2147483649" r:id="rId1"\/>/);
  assert.equal((files['ppt/theme/theme1.xml'].match(/typeface="Microsoft YaHei"/g) || []).length >= 2, true);
  assert.match(files['ppt/slides/slide1.xml'], /typeface="Microsoft YaHei"/);
  assert.match(files['docProps/app.xml'], /<Slides>2<\/Slides>/);
});

test('slide XML keeps Chinese text, escapes XML metacharacters and keeps layout metrics', () => {
  const xml = unzip(writePptx(sample()))['ppt/slides/slide1.xml'];
  for (const piece of [
    '项目内容概况',
    '投放主体：某品牌 &amp; 华东区域',
    '投放区域：上海 &lt;核心&gt; 商圈',
    '说明：&quot;口径&quot;以第三方监测为准 &amp; 不含赠播。',
    '核心商圈 &amp; 灯箱',
    '地铁 &lt;通道&gt; 灯箱',
    '数据口径：&quot;曝光量&quot;为估算值，误差 ±8%。',
  ]) assert.ok(xml.includes(piece), '缺少文本 ' + piece);
  assert.ok(!xml.includes('某品牌 & 华东'), '原文 & 未转义');
  assert.ok(!xml.includes('上海 <核心>'), '原文 < > 未转义');
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml), 'XML 含非法控制字符');
  assert.match(xml, /<a:t xml:space="preserve">/);
  for (const sz of ['sz="2800"', 'sz="1600"', 'sz="1400"', 'sz="1050"', 'sz="1000"']) assert.ok(xml.includes(sz), '字号缺失 ' + sz);
  assert.match(xml, /<a:lnSpc><a:spcPts val="3024"\/><\/a:lnSpc>/, '要点行距不是 0.42 英寸');
  assert.match(xml, /<a:buChar char="•"\/>/);
  assert.match(xml, /<a:tbl>/, '缺少表格');
  assert.match(xml, /<a:tblGrid>/);
  assert.match(xml, /<a:tcPr [^>]*anchor="ctr"/);
  assert.match(xml, /<a:normAutofit\/>/);
  const clean = unzip(writePptx(sample({ slides: [{ title: '控制字符\u0001测试', blocks: [{ type: 'text', text: 'A\u0000B\u0007C' }] }] })))['ppt/slides/slide1.xml'];
  assert.ok(clean.includes('<a:t xml:space="preserve">ABC</a:t>'), '控制字符未被清理');
  const multi = unzip(writePptx({ slides: [{ title: '换行表格', blocks: [{ type: 'table', columns: ['A', 'B'], rows: [['第一行\n第二行', 'x\u0001y']] }] }] }))['ppt/slides/slide1.xml'];
  assert.ok(multi.includes('<a:t xml:space="preserve">第一行</a:t>') && multi.includes('<a:t xml:space="preserve">第二行</a:t>'), '表格换行未拆分为独立段落');
  assert.ok(multi.includes('<a:t xml:space="preserve">xy</a:t>'), '表格控制字符未被清理');
});

test('slide count follows the input and guard rails reject empty, oversized and too many pages', () => {
  const deck = sample();
  deck.slides.push({ title: '附录', blocks: [{ type: 'bullets', items: ['附表：媒体清单'] }] });
  const files = unzip(writePptx(deck));
  assert.deepEqual(slideNames(files), ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml']);
  assert.match(files['docProps/app.xml'], /<Slides>3<\/Slides>/);
  for (const bad of [undefined, null, {}, { slides: [] }, { slides: 'x' }]) assert.throws(() => writePptx(bad), /结案报告没有可导出的页面/);
  assert.throws(() => writePptx({ slides: [{ title: '超长', blocks: [{ type: 'text', text: '长'.repeat(8001) }] }] }), /8000 字符/);
  assert.throws(() => writePptx({ slides: Array.from({ length: 41 }, (_, i) => ({ title: '第' + (i + 1) + '页', blocks: [] })) }), /40 页/);
  const many = writePptx({ slides: Array.from({ length: 40 }, (_, i) => ({ title: '第' + (i + 1) + '页', blocks: [{ type: 'text', text: '行' + (i + 1) }] })) });
  assert.equal(slideNames(unzip(many)).length, 40);
});

test('python-pptx opens the generated deck and reads slide count, titles and table cells', t => {
  const probe = spawnSync(PYTHON, ['-c', 'import pptx'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return t.skip('本机 python-pptx 不可用，跳过真实打开校验');
  const dir = resolve(root, 'test-results/pptx-verify');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'pptx-python-check.pptx');
  writeFileSync(file, writePptx(sample()));
  const script = [
    'import sys, json',
    'from pptx import Presentation',
    'p = Presentation(sys.argv[1])',
    "out = {'slides': len(p.slides), 'titles': [], 'tables': 0, 'table0': [], 'texts': [], 'title_core': p.core_properties.title}",
    'for s in p.slides:',
    '    shapes = list(s.shapes)',
    "    if shapes and shapes[0].has_text_frame: out['titles'].append(shapes[0].text_frame.text)",
    '    for sh in shapes:',
    "        if sh.has_text_frame and sh.text_frame.text.strip(): out['texts'].append(sh.text_frame.text)",
    "        if getattr(sh, 'has_table', False):",
    "            out['tables'] += 1",
    "            if not out['table0']: out['table0'] = [[c.text for c in r.cells] for r in sh.table.rows][0]",
    "print('RESULT ' + json.dumps(out, ensure_ascii=False))",
  ].join('\n');
  const result = spawnSync(PYTHON, ['-c', script, file], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
  assert.equal(result.status, 0, 'python-pptx 打开失败：' + (result.stderr || result.stdout));
  const line = result.stdout.split(/\r?\n/).find(item => item.startsWith('RESULT '));
  assert.ok(line, 'python-pptx 没有输出校验结果');
  const data = JSON.parse(line.slice(7));
  assert.equal(data.slides, 2);
  assert.deepEqual(data.titles, ['项目内容概况', '效果数据']);
  assert.equal(data.title_core, '某品牌 · 投放结案报告');
  assert.equal(data.tables, 1);
  assert.deepEqual(data.table0, ['期数', '周期', '说明']);
  assert.ok(data.texts.join('\n').includes('投放主体：某品牌 & 华东区域'), 'python-pptx 未读到转义还原后的正文');
});

test('POST /api/export-pptx returns a valid deck and friendly errors', async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const exported = await fetch(base + '/api/export-pptx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentation: sample() }) });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    assert.match(exported.headers.get('content-disposition'), /^attachment; filename="closing-report\.pptx"$/);
    const files = unzip(Buffer.from(await exported.arrayBuffer()));
    assert.equal(slideNames(files).length, 2);
    assert.ok(files['ppt/slides/slide1.xml'].includes('项目内容概况'));
    const health = await (await fetch(base + '/api/health')).json();
    assert.ok(health.capabilities.includes('closing-report-pptx'));
    const badJson = await fetch(base + '/api/export-pptx', { method: 'POST', body: '{' });
    assert.equal(badJson.status, 400);
    assert.match((await badJson.json()).error, /JSON/);
    const missing = await fetch(base + '/api/export-pptx', { method: 'POST', body: JSON.stringify({ slides: [] }) });
    assert.equal(missing.status, 400);
    assert.match((await missing.json()).error, /presentation/);
    const empty = await fetch(base + '/api/export-pptx', { method: 'POST', body: JSON.stringify({ presentation: { slides: [] } }) });
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).error, /没有可导出的页面/);
    const blocked = await fetch(base + '/api/export-pptx', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(blocked.status, 403);
  } finally {
    await new Promise(done => server.close(done));
  }
});