#!/usr/bin/env node
// 红豆广告媒体管理系统 · 库存 API 同步脚本
// 只读接口：公交 / 地铁出入口库存分页查询。
// 支持两种鉴权：直接提供 HONGDOU_TOKEN，或用 OAuth2 客户端 + 个人账号密码自动登录。
// 令牌/密码只在本机使用，不写入仓库、不打印。
//
// 用法：
//   node scripts/hongdou-inventory.mjs login
//   node scripts/hongdou-inventory.mjs inspect
//   node scripts/hongdou-inventory.mjs sync --start 2027-01-01 --end 2027-03-31
//   node scripts/hongdou-inventory.mjs sync --type metro --keyword 上海南站 --start 2027-01-01 --end 2027-03-31
//   node scripts/hongdou-inventory.mjs sync --type both --start 2027-01-01 --end 2027-03-31 --out-dir data
//
// 环境变量：
//   HONGDOU_USERNAME / HONGDOU_PASSWORD   平台个人账号（OAuth2 password 模式）
//   HONGDOU_TOKEN                         可选，直接指定 accessToken（优先于登录）
//   HONGDOU_CLIENT_ID / HONGDOU_CLIENT_SECRET  可选，默认共用测试客户端 inventory-agent-test
//   HONGDOU_BASE                          可选，默认 https://flairmedia.com.cn:881
//   HONGDOU_TENANT                        可选，默认 1

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INVENTORY_HEADERS, toCSV } from '../lib/engine.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_DELAY_MS = 300;
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 30000;
const TOKEN_PATH = '/admin-api/system/oauth2/token';
const TOKEN_CACHE = join(ROOT, 'data/private/hongdou/token.json');


async function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const text = await readFile(join(ROOT, file), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || !match[1].startsWith('HONGDOU_')) continue;
        if (!process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    } catch { /* 文件不存在时忽略 */ }
  }
}

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

function fail(message, code = 1) {
  console.error('错误：' + message);
  process.exitCode = code;
  throw new Error(message);
}

function help() {
  console.log(`红豆库存 API 同步

用法：
  node scripts/hongdou-inventory.mjs login [--fresh]
  node scripts/hongdou-inventory.mjs inspect [--type bus|metro|both] [--start YYYY-MM-DD --end YYYY-MM-DD]
  node scripts/hongdou-inventory.mjs sync --start YYYY-MM-DD --end YYYY-MM-DD [选项]

选项：
  --type bus|metro|both   默认 both
  --start / --end         查询的可售日期范围，sync 必填；inspect 默认今天
  --line NAME             公交线路名称过滤（可选）
  --keyword TEXT          地铁站名 / 出入口名称过滤（可选）
  --page-size N           每页条数，默认 ${DEFAULT_PAGE_SIZE}（接口实测 1000 可一次取回）
  --delay MS              翻页间隔，默认 ${DEFAULT_DELAY_MS}ms
  --out-dir DIR           输出目录，默认 data
  --no-raw                不保存原始 JSON 快照
  --no-dates              不把查询窗口写成可售起止日期（默认写入查询窗口，仅作快照口径）
  --fresh                 忽略令牌缓存，重新登录

环境变量：
  HONGDOU_USERNAME        平台个人用户名（OAuth2 password 模式）
  HONGDOU_PASSWORD        平台个人密码
  HONGDOU_TOKEN           可选，直接指定 accessToken（优先级最高）
  HONGDOU_CLIENT_ID       可选，默认 inventory-agent-test
  HONGDOU_CLIENT_SECRET   可选，默认 inventory-agent-test
  HONGDOU_BASE            默认 https://flairmedia.com.cn:881
  HONGDOU_TENANT          默认 1

登录方式（OAuth2 password）：
  POST ${process.env.HONGDOU_BASE || 'https://flairmedia.com.cn:881'}${TOKEN_PATH}
  HTTP Basic：共用测试客户端；表单 grant_type=password + 个人用户名/密码；不需要图形验证码。
  登录成功后令牌缓存到 data/private/hongdou/token.json（gitignore，服务端不可访问），
  有效期按接口 expires_in 自动续期；也可以只用 HONGDOU_TOKEN 跳过登录。

PowerShell：
  $env:HONGDOU_USERNAME="平台用户名"
  $env:HONGDOU_PASSWORD="平台密码"
  node scripts/hongdou-inventory.mjs login
macOS/Linux：export HONGDOU_USERNAME=... HONGDOU_PASSWORD=...
也可以写进项目根目录 .env.local（已被 .gitignore 忽略）。不要提交密码或令牌。

输出：
  data/红豆库存_bus_<开始>_<结束>.csv      可直接在界面「更新库存」导入（首次建议整体替换）
  data/private/hongdou/<时间>-<类型>.json   原始返回，仅本机保留
`);
}

function parseArgs(argv) {
  const options = { command: argv[0], type: 'both', start: '', end: '', line: '', keyword: '', pageSize: DEFAULT_PAGE_SIZE, delay: DEFAULT_DELAY_MS, outDir: 'data', raw: true, fresh: false, noDates: false };
  if (!options.command || options.command === '--help' || options.command === '-h') { help(); process.exit(0); }
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { const value = argv[++i]; if (value === undefined) fail(arg + ' 缺少值'); return value; };
    if (arg === '--type') options.type = next();
    else if (arg === '--start') options.start = next();
    else if (arg === '--end') options.end = next();
    else if (arg === '--line') options.line = next();
    else if (arg === '--keyword') options.keyword = next();
    else if (arg === '--page-size') options.pageSize = Math.max(1, Math.trunc(Number(next())) || DEFAULT_PAGE_SIZE);
    else if (arg === '--delay') options.delay = Math.max(0, Math.trunc(Number(next())) || 0);
    else if (arg === '--out-dir') options.outDir = next();
    else if (arg === '--no-raw') options.raw = false;
    else if (arg === '--no-dates') options.noDates = true;
    else if (arg === '--fresh') options.fresh = true;
    else if (arg === '--help' || arg === '-h') { help(); process.exit(0); }
    else fail('未知参数 ' + arg);
  }
  if (!['bus', 'metro', 'both'].includes(options.type)) fail('--type 只能是 bus / metro / both');
  for (const edge of ['start', 'end']) {
    if (options[edge] && !/^\d{4}-\d{2}-\d{2}$/.test(options[edge])) fail('--' + edge + ' 须为 YYYY-MM-DD');
  }
  if (options.command === 'sync' && (!options.start || !options.end)) fail('sync 需要 --start 和 --end');
  if (!['login', 'inspect', 'sync'].includes(options.command)) fail('未知命令 ' + options.command + '，可用 login / inspect / sync');
  return options;
}

let BASE, TENANT, TOKEN = '', TOKEN_EXPIRES_AT = 0, TOKEN_FROM = '';

function credentials() {
  return {
    username: process.env.HONGDOU_USERNAME || '',
    password: process.env.HONGDOU_PASSWORD || '',
    clientId: process.env.HONGDOU_CLIENT_ID || 'inventory-agent-test',
    clientSecret: process.env.HONGDOU_CLIENT_SECRET || 'inventory-agent-test'
  };
}

function tokenHelp() {
  return `获取令牌的两种方式：
  A. OAuth2 登录（推荐）
     设置个人账号后运行 login：
       PowerShell: $env:HONGDOU_USERNAME="平台用户名"; $env:HONGDOU_PASSWORD="平台密码"
       macOS/Linux: export HONGDOU_USERNAME=... HONGDOU_PASSWORD=...
       node scripts/hongdou-inventory.mjs login
     共用测试客户端默认 inventory-agent-test / inventory-agent-test，可用 HONGDOU_CLIENT_ID / HONGDOU_CLIENT_SECRET 覆盖。
  B. 直接提供 accessToken
     登录 ${BASE} 后台，开发者工具 Network → 任一 admin-api 请求 → 复制 Authorization: Bearer 后面的字符串，
     设置 HONGDOU_TOKEN 或写进 .env.local。
令牌/密码只在本机使用，不要提交 Git、不要发到聊天；令牌过期后重新 login。`;
}

class ApiError extends Error {
  constructor(message, code) { super(message); this.name = 'ApiError'; this.code = code; }
}

async function saveTokenCache() {
  try {
    await mkdir(join(ROOT, 'data/private/hongdou'), { recursive: true });
    await writeFile(TOKEN_CACHE, JSON.stringify({ accessToken: TOKEN, expiresAt: TOKEN_EXPIRES_AT, updatedAt: new Date().toISOString(), base: BASE, tenant: TENANT }, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch { /* 缓存失败不影响本次使用 */ }
}

async function loadCachedToken() {
  try {
    const cached = JSON.parse(await readFile(TOKEN_CACHE, 'utf8'));
    if (!cached.accessToken || cached.base !== BASE || String(cached.tenant) !== String(TENANT)) return false;
    if (!Number.isFinite(cached.expiresAt) || cached.expiresAt <= Date.now() + 60000) return false;
    TOKEN = cached.accessToken;
    TOKEN_EXPIRES_AT = cached.expiresAt;
    TOKEN_FROM = 'cache';
    return true;
  } catch { return false; }
}

async function login() {
  const { username, password, clientId, clientSecret } = credentials();
  if (!username || !password) fail('未设置账号：请设置 HONGDOU_USERNAME / HONGDOU_PASSWORD，或直接提供 HONGDOU_TOKEN。\n' + tokenHelp());
  const basic = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const body = new URLSearchParams({ grant_type: 'password', username, password }).toString();
  let response;
  try {
    response = await fetch(BASE + TOKEN_PATH, {
      method: 'POST',
      headers: {
        'tenant-id': TENANT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: 'Basic ' + basic
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    fail('登录请求失败：' + (error.message || error));
  }
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { fail('登录接口返回非 JSON（HTTP ' + response.status + '）：' + text.slice(0, 200)); }
  const code = Number(payload.code);
  if (code === 401 || code === 1002000000) {
    fail('OAuth2 登录失败（code=' + payload.code + '）：' + (payload.msg || '账号或客户端认证不通过') + '\n请核对 HONGDOU_USERNAME / HONGDOU_PASSWORD（个人平台账号），以及共用客户端 inventory-agent-test。\n' + tokenHelp());
  }
  if (code !== 0 && code !== 200) fail('登录失败 code=' + payload.code + '：' + (payload.msg || '未知错误'));
  const data = payload.data || {};
  const token = data.access_token || data.accessToken;
  if (!token) fail('登录响应没有 access_token：' + text.slice(0, 300));
  const expiresIn = Number(data.expires_in ?? data.expiresIn ?? 1800);
  TOKEN = token;
  TOKEN_EXPIRES_AT = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 1800) * 1000;
  TOKEN_FROM = 'oauth2';
  await saveTokenCache();
  return { expiresIn: Math.round((TOKEN_EXPIRES_AT - Date.now()) / 1000) };
}

async function ensureToken({ force = false } = {}) {
  if (force) {
    TOKEN = ''; TOKEN_EXPIRES_AT = 0; TOKEN_FROM = '';
    await rm(TOKEN_CACHE, { force: true }).catch(() => {});
  }
  if (process.env.HONGDOU_TOKEN) {
    TOKEN = process.env.HONGDOU_TOKEN.replace(/^Bearer\s+/i, '').trim();
    TOKEN_FROM = 'env';
    return;
  }
  if (TOKEN && (!TOKEN_EXPIRES_AT || TOKEN_EXPIRES_AT > Date.now() + 60000)) return;
  if (await loadCachedToken()) return;
  const { username, password } = credentials();
  if (!username || !password) fail('未登录：请先运行 login，或设置 HONGDOU_TOKEN。\n' + tokenHelp());
  console.log('正在通过 OAuth2 登录…');
  const result = await login();
  console.log('登录成功，令牌有效期约 ' + result.expiresIn + ' 秒，已缓存到 data/private/hongdou/token.json。');
}

function apiUrl(type, params) {
  const url = new URL(BASE + '/admin-api/orders/media-inventory/' + type + '/page');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchPage(url, token) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'tenant-id': TENANT, Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch { throw new ApiError('HTTP ' + response.status + ' 非 JSON 响应：' + text.slice(0, 200)); }
      const code = Number(payload.code);
      if (code === 401) throw new ApiError('账号未登录或令牌过期（接口 code=401）', 401);
      if (code !== 0 && code !== 200) throw new ApiError('接口返回 code=' + payload.code + '：' + (payload.msg || '未知错误'), code);
      if (payload.data === undefined) throw new ApiError('接口响应缺少 data 字段：' + text.slice(0, 300));
      return payload.data;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError) throw error;
      if (attempt < 3) await sleep(800 * attempt);
    }
  }
  throw new Error('请求失败：' + (lastError?.message || lastError));
}

async function request(type, params) {
  await ensureToken();
  const url = apiUrl(type, params);
  try {
    return await fetchPage(url, TOKEN);
  } catch (error) {
    if (error instanceof ApiError && error.code === 401) {
      if (TOKEN_FROM === 'env' && !credentials().username) fail('HONGDOU_TOKEN 已失效（code=401）。请重新登录或更新令牌。\n' + tokenHelp());
      console.log('令牌已过期，正在重新登录…');
      await login();
      return await fetchPage(url, TOKEN);
    }
    throw error;
  }
}

function pageOf(data) {
  if (Array.isArray(data)) return { list: data, total: data.length };
  const list = data.list || data.records || data.rows || data.items || data.data || [];
  const total = Number(data.total ?? data.totalCount ?? data.count ?? data.totalElements);
  return { list: Array.isArray(list) ? list : [], total: Number.isFinite(total) ? total : null };
}

const ALIASES = {
  id: ['resourceId', 'id', 'inventoryId', 'mediaInventoryId', 'mediaId', 'code', 'resourceCode', 'number', 'serialNo', 'serialNumber'],
  line: ['lineName', 'routeName', 'route', 'line', 'busLineName'],
  station: ['lineName', 'stationName', 'station', 'exitName', 'entranceName', 'entrance', 'pointName', 'name', 'keyword'],
  available: ['freeCount', 'availableCount', 'available', 'vacancyCount', 'vacancy', 'emptyCount', 'empty', 'surplusCount', 'surplus', 'remainCount', 'remaining', 'stockCount', 'stock', 'canSellCount', 'sellableCount'],
  capacity: ['totalCount', 'total', 'capacity', 'vehicleCount', 'busCount', 'mediaCount', 'count'],
  contracted: ['contractCount', 'contracted'],
  reserved: ['reservationCount', 'reserved'],
  maintenance: ['maintenanceForbiddenCount', 'maintenance'],
  renewal: ['renewPossibleCount', 'renewal'],
  grade: ['lineLevel', 'grade', 'level', 'lineGrade', 'lineLevel', 'mediaGrade'],
  operator: ['companyName', 'operatorName', 'operator', 'company', 'busCompany'],
  format: ['mediaName', 'mediatypename', 'mediaTypeName', 'mediaForm', 'mediaFormat', 'format', 'specification', 'stationAttr', 'typeName'],
  district: ['district', 'districtName', 'area', 'areaName', 'region', 'regionName'],
  lat: ['lat', 'latitude'],
  lon: ['lon', 'lng', 'longitude'],
  price: ['unitPrice', 'price', 'listPrice', 'publishPrice', 'rate', 'mediaPrice'],
  production: ['productionFee', 'production', 'makeFee'],
  tax: ['priceIncludesTax', 'taxIncluded', 'includesTax', 'hasTax'],
  periodDays: ['periodDays', 'billingDays', 'period'],
  tags: ['categoryTags', 'businessAreaName', 'tags', 'sceneTags', 'tagNames']
};

function flatRecord(record) {
  return {
    ...record,
    ...(record.media && typeof record.media === 'object' ? record.media : {}),
    ...(record.inventory && typeof record.inventory === 'object' ? record.inventory : {}),
    ...(record.line && typeof record.line === 'object' ? record.line : {}),
    ...(record.metro && typeof record.metro === 'object' ? record.metro : {})
  };
}

function pick(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(/[￥¥,，\s]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function toDate(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') {
    const date = new Date(value > 1e12 ? value : value * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return '';
}

function normalize(type, raw, meta) {
  const record = flatRecord(raw);
  const resourceId = String(pick(record, ALIASES.id) || '').trim();
  const lineName = String(pick(record, ['lineName', 'routeName', 'route', 'line', 'busLineName']) || '').trim();
  const exitName = String(pick(record, ['exitName', 'entranceName', 'entrance']) || '').trim();
  const mediaName = String(pick(record, ['mediaName']) || '').trim();
  const mediaTypeName = String(pick(record, ['mediatypename', 'mediaTypeName']) || '').trim();
  const stationAttr = String(pick(record, ['stationAttr']) || '').trim();
  const fallbackName = String(pick(record, ['name', 'pointName']) || '').trim();
  const displayName = type === 'bus'
    ? (lineName || mediaName || fallbackName)
    : ([lineName, exitName].filter(Boolean).join(' ') || fallbackName);
  const format = type === 'bus' ? (mediaName || mediaTypeName) : (stationAttr || mediaTypeName || mediaName);
  const rawLevel = String(pick(record, ['lineLevel', 'grade', 'level', 'lineGrade', 'mediaGrade']) || '').trim();
  const level = /^(0|null|undefined|无|暂无|-)$/i.test(rawLevel) ? '' : rawLevel;
  const grade = level ? (/^\d+$/.test(level) ? 'L' + level : level) : '';
  const tags = [
    String(pick(record, ['categoryTags']) || '').trim(),
    String(pick(record, ['businessAreaName']) || '').trim()
  ].filter(value => value && !/^(0|null|undefined|无|暂无|-)$/i.test(value)).join('、');
  let id = resourceId;
  let generatedId = false;
  if (!id) {
    id = createHash('sha1').update([displayName, pick(record, ALIASES.operator), format, meta.start].join('|')).digest('hex').slice(0, 12);
    generatedId = true;
  }
  const idBase = type === 'bus'
    ? 'HDBUS-' + id + (mediaName ? '-' + mediaName.replace(/[\\/:*?"<>|\s]/g, '_') : '')
    : 'HDMETRO-' + id;
  const available = toNumber(pick(record, ALIASES.available));
  const capacity = toNumber(pick(record, ALIASES.capacity));
  const price = toNumber(pick(record, ALIASES.price));
  const production = toNumber(pick(record, ALIASES.production));
  const taxValue = String(pick(record, ALIASES.tax)).toLowerCase();
  const tax = taxValue ? /^(true|1|是|含税|yes)$/.test(taxValue) : null;
  const periodDays = toNumber(pick(record, ALIASES.periodDays));
  return {
    id: idBase,
    generatedId,
    name: displayName,
    mediaType: type === 'bus' ? '公交车辆' : '地铁站站口',
    available: Number.isInteger(available) ? available : null,
    capacity,
    contracted: toNumber(pick(record, ALIASES.contracted)),
    reserved: toNumber(pick(record, ALIASES.reserved)),
    maintenance: toNumber(pick(record, ALIASES.maintenance)),
    renewal: toNumber(pick(record, ALIASES.renewal)),
    start: meta.withDates ? meta.start : '',
    end: meta.withDates ? meta.end : '',
    grade,
    operator: String(pick(record, ALIASES.operator) || ''),
    format,
    district: '',
    lat: toNumber(pick(record, ALIASES.lat)),
    lon: toNumber(pick(record, ALIASES.lon)),
    price,
    production,
    tax,
    periodDays,
    tags,
    traffic: null,
    trafficMonth: '',
    trafficStatus: '',
    trafficReportCount: 0,
    trafficSources: [],
    source: '红豆库存API · ' + type + ' · 查询窗口 ' + meta.start + '~' + meta.end + (meta.withDates ? '' : '（未写入可售期）') + ' · 快照，非合同锁档'
  };
}

let sourceInventoryCache = null;

async function enrichBusGrades(records) {
  if (!sourceInventoryCache) {
    try {
      const module = await import('../data/real-data.mjs');
      sourceInventoryCache = Array.isArray(module.realInventory) ? module.realInventory : [];
    } catch { sourceInventoryCache = []; }
  }
  const index = new Map();
  for (const row of sourceInventoryCache) {
    const key = [row.name, row.operator, row.format].join('|');
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  let matched = 0;
  for (const record of records) {
    const list = index.get([record.name, record.operator, record.format].join('|'));
    if (list && list.length === 1) {
      const source = list[0];
      record.grade = source.grade || record.grade;
      record.sourceMatched = true;
      record.traffic = Number.isFinite(source.traffic) ? source.traffic : null;
      record.trafficMonth = source.trafficMonth || '';
      record.trafficStatus = source.trafficStatus || '';
      record.trafficReportCount = Array.isArray(source.insightIds) ? source.insightIds.length : (source.trafficReportCount || 0);
      record.trafficSources = Array.isArray(source.trafficSources) ? source.trafficSources : [];
      matched++;
    }
  }
  return matched;
}

function resolveOutDir(dir) {  return resolve(ROOT, dir);
}

async function saveRaw(type, data, meta) {
  const dir = resolve(ROOT, 'data/private/hongdou');
  await mkdir(dir, { recursive: true });
  const name = new Date().toISOString().replace(/[:.]/g, '-') + '-' + type + '.json';
  const file = join(dir, name);
  await writeFile(file, JSON.stringify({ meta, data }, null, 2), 'utf8');
  return file;
}

async function inspect(options) {
  const types = options.type === 'both' ? ['bus', 'metro'] : [options.type];
  for (const type of types) {
    console.log('\n== ' + type + ' ==');
    const data = await request(type, { pageNo: 1, pageSize: 3, startDate: options.start || today(), endDate: options.end || options.start || today(), lineName: type === 'bus' ? options.line : '', keyword: type === 'metro' ? options.keyword : '' });
    const { list, total } = pageOf(data);
    console.log('data 字段：', data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).join(', ') : Array.isArray(data) ? '(数组)' : String(data));
    console.log('总数：', total ?? '接口未返回，按空页停止');
    console.log('本页条数：', list.length);
    if (!list.length) { console.log('本页为空：检查日期范围或过滤条件。'); continue; }
    console.log('首条字段：', Object.keys(list[0]).join(', '));
    const sample = {};
    for (const [key, value] of Object.entries(list[0])) {
      if (/token|password|secret|authorization/i.test(key)) { sample[key] = '<已隐藏>'; continue; }
      sample[key] = typeof value === 'string' ? value.slice(0, 120) : value;
    }
    console.log('首条样例：', JSON.stringify(sample, null, 2));
  }
  console.log('\n下一步：用 sync 拉全量；若字段与预期不同，把“首条字段/样例”发我，我来补映射。');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function sync(options) {
  const types = options.type === 'both' ? ['bus', 'metro'] : [options.type];
  const outDir = resolveOutDir(options.outDir);
  await mkdir(outDir, { recursive: true });
  const meta = { start: options.start, end: options.end, line: options.line || '', keyword: options.keyword || '', withDates: !options.noDates };
  const combinedRows = [];
  for (const type of types) {
    console.log('\n== 同步 ' + type + ' ==');
    const collected = [];
    let pageNo = 1, total = null, rawPages = [];
    while (true) {
      if (pageNo > MAX_PAGES) fail('超过 ' + MAX_PAGES + ' 页，已停止。请缩小日期范围或添加 --line/--keyword。');
      const data = await request(type, { pageNo, pageSize: options.pageSize, startDate: options.start, endDate: options.end, lineName: type === 'bus' ? options.line : '', keyword: type === 'metro' ? options.keyword : '' });
      const page = pageOf(data);
      if (total === null && page.total !== null) total = page.total;
      rawPages.push(data);
      if (!page.list.length) break;
      collected.push(...page.list);
      console.log('  第 ' + pageNo + ' 页：' + page.list.length + ' 条，累计 ' + collected.length + (total ? '（接口 total=' + total + '）' : ''));
      if (total !== null && collected.length >= total) break;
      // 注意：接口按原始行分页后再过滤，短页不代表结束，必须读到空页或达到 total。
      pageNo++;
      await sleep(options.delay);
    }
    if (options.raw && rawPages.length) {
      const file = await saveRaw(type, rawPages, meta);
      console.log('  原始快照：' + file.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
    }
    if (!collected.length) { console.log('  没有数据。检查日期范围、过滤条件或令牌权限。'); continue; }
    const records = collected.map(raw => normalize(type, raw, meta));
    if (type === 'bus') {
      const matched = await enrichBusGrades(records);
      if (matched) console.log('  与本地源表按 线路+运营公司+媒体规格 匹配 ' + matched + ' 条，沿用源表等级以保留刊例/报告关联。');
    }
    const usedIds = new Set();
    for (const record of records) {
      let id = record.id, suffix = 2;
      while (usedIds.has(id)) id = record.id + '-' + suffix++;
      usedIds.add(id);
      record.id = id;
    }
    const missingName = records.filter(r => !r.name).length;
    const generated = records.filter(r => r.generatedId).length;
    const withAvailable = records.filter(r => r.available !== null).length;
    const withDates = records.filter(r => r.start && r.end).length;
    const withPrice = records.filter(r => r.price !== null).length;
    const index = Object.fromEntries(INVENTORY_HEADERS.map((header, i) => [header, i]));
    const rows = records.map(r => {
      const row = Array(INVENTORY_HEADERS.length).fill('');
      row[index['媒体编号']] = r.id;
      row[index['媒体名称']] = r.name;
      row[index['媒体类型']] = r.mediaType;
      row[index['区域']] = r.district;
      row[index['等级']] = r.grade;
      row[index['空车数']] = r.available ?? '';
      row[index['可售开始']] = r.start;
      row[index['可售结束']] = r.end;
      row[index['28天刊例价']] = r.price ?? '';
      row[index['制作费']] = r.production ?? '';
      row[index['含税']] = r.tax === true ? '是' : r.tax === false ? '否' : '';
      row[index['计价天数']] = r.periodDays ?? '';
      row[index['纬度']] = r.lat ?? '';
      row[index['经度']] = r.lon ?? '';
      row[index['场景标签']] = r.tags;
      row[index['查询日期']] = today();
      row[index['来源']] = r.source;
      row[index['价格来源']] = r.price !== null ? r.source : '';
      row[index['运营公司']] = r.operator;
      row[index['媒体规格']] = r.format;
      row[index['总车辆数（可售）']] = r.capacity ?? '';
      row[index['合同车数']] = r.contracted ?? '';
      row[index['预定车数']] = r.reserved ?? '';
      row[index['保养影响容量']] = r.maintenance ?? '';
      row[index['可能续约数']] = r.renewal ?? '';
      row[index['人流量']] = r.traffic ?? '';
      row[index['人流月份']] = r.trafficMonth || '';
      row[index['人流取值说明']] = r.trafficStatus || '';
      row[index['关联报告数']] = r.trafficReportCount ?? '';
      row[index['人流来源文件']] = (r.trafficSources || []).join('；');
      return row;
    });
    const file = join(outDir, '红豆库存_' + type + '_' + options.start + '_' + options.end + '.csv');
    await writeFile(file, toCSV([INVENTORY_HEADERS, ...rows]), 'utf8');
    combinedRows.push(...rows);
    console.log('  写入：' + file.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
    console.log('  记录 ' + records.length + ' 条；可售数 ' + withAvailable + '；档期 ' + withDates + '；价格 ' + withPrice + '；缺名称 ' + missingName + '；生成临时编号 ' + generated);
    if (total !== null && records.length < total) {
      console.log('  注意：接口 total=' + total + '，实际返回 ' + records.length + ' 条，差额 ' + (total - records.length) + ' 条被接口过滤或当前账号不可见，未写入 CSV。如需核对请换账号或联系新云确认数据权限。');
    }
    if (withPrice === 0) console.log('  提示：库存接口不含 28 天价 / 制作费 / 税费 / 计价天数；这些字段留空，需用刊例或人工核实补齐。');
    if (options.noDates) console.log('  提示：已使用 --no-dates，可售开始/结束留空，不能直接报价。');
    if (missingName) console.log('  警告：有 ' + missingName + ' 条没有识别到名称，请用 inspect 核对字段映射。');
  }
  if (types.length > 1 && combinedRows.length) {
    const file = join(outDir, '红豆库存_both_' + options.start + '_' + options.end + '.csv');
    await writeFile(file, toCSV([INVENTORY_HEADERS, ...combinedRows]), 'utf8');
    console.log('\n合并文件（公交 + 地铁，可直接一次性导入）：' + file.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
    console.log('导入建议：首次用「替换全部」建立红豆库存基线；以后同步用「按编号更新，保留未提供记录」。');
  }
}

(async () => {
  await loadLocalEnv();
  BASE = (process.env.HONGDOU_BASE || 'https://flairmedia.com.cn:881').replace(/\/+$/, '');
  TENANT = process.env.HONGDOU_TENANT || '1';
  const options = parseArgs(process.argv.slice(2));
  const url = new URL(BASE);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) fail('HONGDOU_BASE 须使用 HTTPS（本机 mock 除外）');
  if (options.command === 'login') {
    if (options.fresh) await rm(TOKEN_CACHE, { force: true }).catch(() => {});
    const result = await login();
    console.log('登录成功：令牌有效期约 ' + result.expiresIn + ' 秒，已缓存到 data/private/hongdou/token.json（仅本机，不提交 Git）。');
    try {
      const data = await fetchPage(apiUrl('bus', { pageNo: 1, pageSize: 1, startDate: options.start || today(), endDate: options.end || today() }), TOKEN);
      const probe = pageOf(data);
      console.log('库存接口连通：公交总数 ' + (probe.total ?? '接口未返回') + '。');
    } catch (error) {
      console.log('登录成功，但库存接口试探失败：' + error.message + '（可能是账号权限或日期范围问题）。');
    }
    return;
  }
  await ensureToken({ force: options.fresh });
  if (options.command === 'inspect') await inspect(options);
  else await sync(options);
})().catch(error => {
  if (!process.exitCode) process.exitCode = 1;
  if (process.env.DEBUG) console.error(error);
});