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
export function searchMaterials({ records, insights, files, imports, evidence }, query, kind = "all") {
  if (!String(query).trim()) return [];
  const reportSources = new Set(insights.map(r => r.source));
  const sources = [...new Map([...files, ...imports].map(f => [f.name, f])).values()];
  const items = [
    ...records.map(r => ({ kind: "inventory", id: r.id, title: r.name, subtitle: [r.operator, r.grade, r.format].filter(Boolean).join(" · "), source: r.source || "用户导入库存", terms: [r.id, r.district, r.media === "bus" ? "公交车身" : "地铁出入口", "库存 线路 媒体"] })),
    ...insights.map(r => ({ kind: "insight", id: r.id, title: r.route + " · 历史人流画像", subtitle: [r.month, r.matchedIds.length ? "已关联库存" : "独立报告"].join(" · "), source: r.source, terms: [r.sourceRef, r.sourceTitle, "人流 受众 年龄 性别 消费 时段 覆盖 报告", ...Object.keys(r.poi || {})] })),
    ...sources.filter(f => !reportSources.has(f.name)).map(f => ({ kind: "file", id: f.name, title: f.name, subtitle: [f.type, f.count != null ? f.count + " 条记录" : "", f.month].filter(Boolean).join(" · "), source: "已导入来源文件", terms: [f.sheet, f.at] })),
    ...evidence.map((e, i) => ({ kind: "evidence", id: String(i), title: e.title, subtitle: e.note, source: e.url || "手动录入的调研依据", terms: ["品牌 需求 调研 依据"] }))
  ];
  return items.filter(item => (kind === "all" || kind === item.kind) && matchesQuery([item.title, item.subtitle, item.source, ...item.terms], query));
}
