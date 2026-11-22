"""Read exported coverage relationships without turning them into sellable stock."""
import csv, hashlib, json, re

SUMMARY = ['媒体类型','媒体名称','覆盖点数','覆盖中心点','覆盖半径','最近距离','最近命中中心点','最近站点','站点距离','站点经度','站点纬度']
DETAIL = ['中心点名称','中心点经度','中心点纬度','覆盖半径','媒体类型','媒体名称','最近距离','最近站点','站点距离','站点经度','站点纬度','最近轨迹点经度','最近轨迹点纬度']

def route_key(value):
    return re.sub(r'路$', '', str(value).strip())

def number(value):
    value = str(value).strip()
    if not re.fullmatch(r'[+-]?[0-9]+(?:[.][0-9]+)?', value): return None
    value = float(value)
    return int(value) if value.is_integer() else value

def read_coverage(data, inventory):
    reports, files, issues, seen = [], [], [], {}
    for record in inventory: record['coverageIds'] = []
    for file in sorted(data.rglob('*.csv')):
        if any(part=='private' or part.startswith('.') for part in file.relative_to(data).parts): continue
        content = None
        for encoding in ['utf-8-sig', 'gb18030']:
            try: content = file.read_text(encoding=encoding); break
            except UnicodeDecodeError: pass
        if content is None: continue
        matrix = list(csv.reader(content.splitlines()))
        if not matrix or matrix[0] != ['汇总分析']: continue
        path = file.relative_to(data).as_posix()
        section, headers, summaries, details, valid = '', [], [], [], True
        for row_number, row in enumerate(matrix, 1):
            if not row: continue
            if row in [['汇总分析'], ['明细分析']]:
                section, headers = row[0], []
                continue
            if not headers:
                headers = row
                if headers != (SUMMARY if section == '汇总分析' else DETAIL):
                    valid = False
                    issues.append(path+'：覆盖分析列结构变化，保留来源，不自动解释未知列。')
                    break
                continue
            if len(row) != len(headers):
                raise ValueError(path+' 第 '+str(row_number)+' 行列数与表头不符')
            raw = dict(zip(headers, row))
            media = {'公交线路':'bus', '地铁出入口':'metro'}.get(raw['媒体类型'])
            name = raw['媒体名称']
            matched = [r['id'] for r in inventory if r['media'] == media and route_key(name) in [route_key(a) for a in r['name'].split('/')]]
            entry = dict(media=media, mediaType=raw['媒体类型'], name=name, center=raw.get('中心点名称',raw.get('覆盖中心点','')), radius=number(raw['覆盖半径']), distance=number(raw['最近距离']), station=raw['最近站点'], stationDistance=number(raw['站点距离']), stationLon=number(raw['站点经度']), stationLat=number(raw['站点纬度']), matchedIds=matched, sourceRow=row_number, sourceRef='CSV!A'+str(row_number)+':'+('K' if section=='汇总分析' else 'M')+str(row_number), raw=raw)
            if section == '明细分析':
                entry.update(centerLon=number(raw['中心点经度']),centerLat=number(raw['中心点纬度']),trackLon=number(raw['最近轨迹点经度']),trackLat=number(raw['最近轨迹点纬度']))
            else:
                entry.update(coverageCount=number(raw['覆盖点数']),hitCenter=raw['最近命中中心点'])
            (summaries if section == '汇总分析' else details).append(entry)
        if not valid:
            files.append(dict(name=path,type='未识别覆盖分析',count=0))
            continue
        ident = 'COV-'+hashlib.sha1(path.encode()).hexdigest()[:12]
        digest = hashlib.sha256(json.dumps(matrix,ensure_ascii=False).encode()).hexdigest()
        duplicate = seen.get(digest)
        if not duplicate: seen[digest] = ident
        centers = list(dict.fromkeys(r['center'] for r in details+summaries if r['center']))
        matched = sorted(set(i for r in summaries+details for i in r['matchedIds']))
        report = dict(id=ident,centers=centers,name='、'.join(centers),source=path,summary=summaries,details=details,matchedIds=matched,coordinateSystem=None,queryDate='',duplicateOf=duplicate,referenceOnly=True)
        reports.append(report)
        for record in inventory:
            if record['id'] in matched: record['coverageIds'].append(ident)
        files.append(dict(name=path,type='媒体覆盖分析',count=len(summaries),detailCount=len(details),note='汇总和明细为同一查询的两个视图，不叠加为库存；坐标系、查询日期及可售情况未注明'))
    return reports, files, issues
