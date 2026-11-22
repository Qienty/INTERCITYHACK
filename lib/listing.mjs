import {CHANNELS,channelName} from './campaign.mjs';
export function paginate(items, requestedPage = 1, pageSize = 10) {
  const size = Math.max(1, Math.trunc(Number(pageSize)) || 10);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(requestedPage)) || 1));
  const offset = (page - 1) * size;
  return { items: items.slice(offset, offset + size), total, pages, page, size, start: total ? offset + 1 : 0, end: Math.min(offset + size, total) };
}

export function matchesQuery(values, query) {
  const text = values.filter(v => v != null).join(" ").normalize("NFKC").toLowerCase();
  return String(query).normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean).every(token => text.includes(token));
}

// Search only loaded data and material descriptions; no invented document contents.
export function searchMaterials({ records, insights, files, imports, evidence, rates=[], pois=[], searches=[], coverage=[] }, query, kind = "all") {
  if (!String(query).trim()) return [];
  const reportSources = new Set(insights.map(r => r.source));
  const sources = [...new Map([...files, ...imports].map(f => [f.name, f])).values()];
  const items = [
    ...coverage.map(r=>({kind:'coverage',id:r.id,title:r.name+' · 媒体覆盖分析',subtitle:r.summary.length+' 条覆盖结果 · 关联 '+r.matchedIds.length+' 条库存',source:r.source,terms:['地标 线路 半径 覆盖',...r.summary.map(x=>x.name+' '+x.station)]})),
    ...records.map(r => ({ kind: "inventory", id: r.id, title: r.name, subtitle: [r.operator, r.grade, r.format].filter(Boolean).join(" · "), source: r.source || "用户导入库存", terms: [r.id, r.district, channelName(r.media),...(CHANNELS.find(c=>c.id===r.media)?.aliases||[]), "库存 线路 媒体"] })),
    ...insights.map(r => ({ kind: "insight", id: r.id, title: r.route + " · 历史人流画像", subtitle: [r.month, r.matchedIds.length ? "已关联库存" : "独立报告"].join(" · "), source: r.source, terms: [r.sourceRef, r.sourceTitle, "人流 受众 年龄 性别 消费 时段 覆盖 报告", ...Object.keys(r.poi || {})] })),
    ...rates.map(r=>({kind:'rate',id:r.id,title:r.name+' · 刊例参考',subtitle:[r.mediaType,r.priceText,r.periodText,r.productionText].join(' · '),source:r.source+' / '+r.sourceRef,terms:['刊例 报价 价格 制作费',r.mediaType]})),
    ...pois.map(p=>({kind:'place',id:p.id,title:p.name,subtitle:[p.category,p.district,p.address].filter(Boolean).join(' · '),source:p.source,terms:[p.center,p.entity,'周边 点位 坐标 经度 纬度',p.lon,p.lat]})),
    ...searches.map(s=>({kind:'search',id:s.id,title:s.district+' · '+s.category+'检索汇总',subtitle:'原表检索数量 '+s.count+'；不含逐项清单',source:s.source,terms:[s.mode,'检索 汇总 数量']})),
    ...sources.filter(f => !reportSources.has(f.name)).map(f => ({ kind: "file", id: f.name, title: f.name, subtitle: [f.type, f.count != null ? f.count + " 条记录" : "", f.month,f.note].filter(Boolean).join(" · "), source: "已导入来源文件", terms: [f.sheet, f.at,...(f.sourceNotes||[])] })),
    ...evidence.map((e, i) => ({ kind: "evidence", id: String(i), title: e.title, subtitle: e.note, source: e.url || "手动录入的调研依据", terms: ["品牌 需求 调研 依据"] }))
  ];
  return items.filter(item => (kind === "all" || kind === item.kind) && matchesQuery([item.title, item.subtitle, item.source, ...item.terms], query));
}
