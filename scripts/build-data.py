"""Read user source workbooks and produce browser data. Source files are never edited."""
from pathlib import Path
import sys, json, re, hashlib, warnings
from collections import Counter, defaultdict
import importlib.util
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'python'))
import openpyxl
import xlrd
DATA = ROOT / 'data'

def number(value):
    if value is None or str(value).strip() == '':
        return None
    if isinstance(value, (int, float)):
        return int(value) if int(value) == value else value
    text = str(value).replace(',', '').strip()
    match = re.fullmatch(r'([\d.]+)(万)?(?:人次|人)?', text)
    if not match:
        return None
    result = float(match[1]) * (10000 if match[2] else 1)
    return int(round(result)) if abs(result-round(result)) < 0.0001 else result

def route_key(value):
    return re.sub(r'路$', '', str(value).strip())

files, records, insights, issues = [], [], [], []
source = DATA / '公交车身媒体库存.xlsx'
with warnings.catch_warnings():
    warnings.simplefilter('ignore', UserWarning)
    book = openpyxl.load_workbook(source, data_only=True, read_only=True)
sheet = book.worksheets[0]
rows = list(sheet.iter_rows(values_only=True))
headers = list(rows[0])
required = ['resourceType','线路','运营公司','线路等级','媒体类型','总车辆数（可售）','保养影响容量','合同车数','预定车数','空位数','可能续约数']
if headers != required:
    raise ValueError('库存字段与已核实结构不一致：' + repr(headers))
ids = Counter()
for index, row in enumerate(rows[1:], 2):
    if all(v is None for v in row):
        continue
    raw = dict(zip(headers, row))
    if row[0] != 'BUS_VEHICLE':
        raise ValueError('未知 resourceType，行 ' + str(index))
    key = hashlib.sha1('|'.join(str(v) for v in row[:5]).encode()).hexdigest()[:12]
    ids[key] += 1
    resource_id = 'BUS-' + key + ('-'+str(ids[key]) if ids[key]>1 else '')
    available = number(raw['空位数'])
    if not isinstance(available, int) or available < 0:
        issues.append('库存第 '+str(index)+' 行空位数异常，保留原值并禁止报价')
    records.append(dict(id=resource_id, name=str(raw['线路']), media='bus', operator=raw['运营公司'], format=raw['媒体类型'], grade=raw['线路等级'], district='', available=available, capacity=number(raw['总车辆数（可售）']),maintenance=number(raw['保养影响容量']),contracted=number(raw['合同车数']),reserved=number(raw['预定车数']),renewal=number(raw['可能续约数']),unitPrice=None,production=None,priceIncludesTax=None,periodDays=None,availableStart='',availableEnd='',lat=None,lon=None,tags=[],source=source.name,sourceSheet=sheet.title,sourceRow=index,sourceRef=sheet.title+'!A'+str(index)+':K'+str(index),snapshotDate='',priceSource='',traffic=None,trafficMonth='',insightIds=[],idOrigin='由线路、运营公司、等级与媒体形式生成的本地技术键；非红豆编号'))
files.append(dict(name=source.name,type='公交库存',count=len(records),sheet=sheet.title))
book.close()
age_labels = ['20岁以下','20~30','30~40','40~50','50以上']
slots = ['7点-10点','10点-16点','16点-20点','20点-22点']
seen_reports = {}
for file in sorted(DATA.rglob('*.xls'), key=lambda p:(len(p.relative_to(DATA).parts),p.as_posix())):
    if any(part=='private' or part.startswith('.') for part in file.relative_to(DATA).parts):
        continue
    source_path = file.relative_to(DATA).as_posix()
    wb = xlrd.open_workbook(file)
    count = 0
    month = ''
    for sh in wb.sheets():
        data = [sh.row_values(i) for i in range(sh.nrows)]
        start = next((i for i,r in enumerate(data) if r[:3]==['一级标签','二级标签','三级标签']), None)
        if start is None:
            issues.append(source_path+'：未识别到所选明细值表，未绑定媒体')
            continue
        month_row = next((r for r in data[:start] if re.fullmatch(r'2023\d{2}',str(r[0]))), None)
        if month_row is None:
            raise ValueError(file.name+'：缺少已核实的 2023 年月份')
        month = str(month_row[0])[:4]+'-'+str(month_row[0])[4:]
        title = str(data[0][0])
        # Kept only as a compatibility key below; route cells remain authoritative.
        for row_num, row in enumerate(data[start+3:], start+4):
            if len(row)<44 or row[0] not in ['公交','地铁','地铁出入口'] or not str(row[2]).strip():
                continue
            route = str(row[2]).strip()
            filename_route = route
            ident = 'INS-'+hashlib.sha1((source_path+'|'+str(row_num)).encode()).hexdigest()[:12]
            problems=[]
            # User confirmed that workbook contents are authoritative. Names never override route cells.
            digest=hashlib.sha256(json.dumps([month,row],ensure_ascii=False).encode()).hexdigest()
            duplicate = seen_reports.get(digest)
            if not duplicate:
                seen_reports[digest]=ident
            poi={str(data[start+1][i]):number(row[i]) for i in range(31,min(44,len(row))) if str(data[start+1][i]).strip()}
            insight=dict(id=ident,media='bus' if row[0]=='公交' else 'metro',mediaType=row[0],grade=str(row[1]),source=file.name,sourceSheet=sh.name,sourceRow=row_num,sourceRef=sh.name+'!A'+str(row_num)+':AR'+str(row_num),sourceTitle=title,month=month,route=route,filenameRoute=filename_route,visits=number(row[3]),visitsDisplay=str(row[3]),people=number(row[4]),peopleDisplay=str(row[4]),timeSlots=[dict(label=k,value=number(row[5+i])) for i,k in enumerate(slots)],areaTypes={k:number(row[9+i]) for i,k in enumerate(['学校','医疗','小区','景点','餐饮'])},age=[dict(label=k,value=number(row[14+i])) for i,k in enumerate(age_labels)],gender=[dict(label=k,value=number(row[19+i])) for i,k in enumerate(['男性','女性'])],consumption=[dict(label=k,value=number(row[25+i])) for i,k in enumerate(['高','较高','中','较低','低'])],housing=[dict(label=k,value=number(row[21+i])) for i,k in enumerate(['无房','1套房','2套房','多套房'])],phoneBrand=str(row[30]),poi=poi,issues=problems,duplicateOf=duplicate,matchedIds=[])
            for resource in records:
                aliases = [route_key(x) for x in resource['name'].split('/')]
                if resource['media']==insight['media'] and route_key(route) in aliases:
                    resource['insightIds'].append(ident)
                    insight['matchedIds'].append(resource['id'])
            if not insight['matchedIds'] and not problems:
                insight['issues'].append('当前库存文件没有同名线路，保留独立报告')
            insights.append(insight)
            count+=1
    wb.release_resources()
    for item in insights[-count:] if count else []:
        item['source'] = source_path
    files.append(dict(name=source_path,type='历史人流画像',count=count,month=month))

for resource in records:
    resource['rateIds']=[]
    linked=[i for i in insights if i['id'] in resource['insightIds']]
    resource['trafficReportCount']=len(linked)
    if len(linked)==1:
        resource['traffic']=linked[0]['people']
        resource['trafficMonth']=linked[0]['month']
        resource['trafficStatus']='单报告原表人数；历史数据，非广告曝光'
    elif linked:
        resource['trafficStatus']='多报告不取单一数值；请分别查看原表，不累加、不任意选取'
    else:
        resource['trafficStatus']='无同名报告，未填人流量'
    resource['trafficSources']=[i['source'] for i in linked]
spec=importlib.util.spec_from_file_location('source_materials',ROOT/'scripts'/'source-materials.py')
materials=importlib.util.module_from_spec(spec);spec.loader.exec_module(materials)
rates,pois,searches,templates,extra_files,extra_issues,snapshots=materials.read_materials(DATA,records)
files.extend(extra_files);issues.extend(extra_issues)
coverage_spec=importlib.util.spec_from_file_location('coverage_materials',ROOT/'scripts'/'coverage-materials.py')
coverage_module=importlib.util.module_from_spec(coverage_spec);coverage_spec.loader.exec_module(coverage_module)
coverage,coverage_files,coverage_issues=coverage_module.read_coverage(DATA,records)
files.extend(coverage_files);issues.extend(coverage_issues)
for file in files:file['sha256']=hashlib.sha256((DATA/file['name']).read_bytes()).hexdigest()
issues += ['库存文件没有可售起止日期和查询日期，无法核定 2027 档期。','刊例价为脱敏区间，含税口径及精确成交价未提供；原始发布期不自动折算成 28 天。','来源点位坐标系未注明；不是客户门店或广告库存，不自动参与距离配单。','2023-05 人流为历史所选区域数据，不能直接当作 2027 广告曝光或跨线路去重人数。']
summary=dict(totalCapacity=sum(r['capacity'] or 0 for r in records),available=sum(r['available'] or 0 for r in records),contracted=sum(r['contracted'] or 0 for r in records),reserved=sum(r['reserved'] or 0 for r in records),maintenance=sum(r['maintenance'] or 0 for r in records),withVacancy=sum((r['available'] or 0)>0 for r in records),withInsights=sum(bool(r['insightIds']) for r in records),linkedInsights=sum(bool(i['matchedIds']) for i in insights),unlinkedInsights=sum(not i['matchedIds'] for i in insights))
payload=json.dumps([records,insights,rates,pois,searches,templates,coverage,snapshots,files],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
version=hashlib.sha256(payload).hexdigest()[:16]
rename_file=DATA/'source-renames.json'
renames=json.loads(rename_file.read_text(encoding='utf-8')) if rename_file.exists() else []
renames=[dict(entry,sourcePresent=(DATA/entry['name']).is_file(),currentSHA256=hashlib.sha256((DATA/entry['name']).read_bytes()).hexdigest() if (DATA/entry['name']).is_file() else None) for entry in renames]
for entry in renames:entry['sourceContentUnchanged']=entry['currentSHA256']==entry['sha256']
summary.update(rateReferences=len(rates),withRateReferences=sum(bool(r.get('rateIds')) for r in records),sourcePlaces=len(pois),metroInsights=sum(i['media']=='metro' for i in insights),busInsights=sum(i['media']=='bus' for i in insights),searchSummaries=len(searches),blankTemplates=sum(not t['filledCount'] for t in templates))
report_hashes=[f['sha256'] for f in files if f['type']=='历史人流画像']
summary.update(reportSourceFiles=len(report_hashes),byteDuplicateReports=len(report_hashes)-len(set(report_hashes)),distinctInsightGroups=sum(not i['duplicateOf'] for i in insights),duplicateInsights=sum(bool(i['duplicateOf']) for i in insights),unlinkedDuplicateInsights=sum(not i['matchedIds'] and bool(i['duplicateOf']) for i in insights),unlinkedDistinctGroups=len(set(i['duplicateOf'] or i['id'] for i in insights if not i['matchedIds'])),singleReportInventory=sum(len(r['insightIds'])==1 for r in records),multiReportInventory=sum(len(r['insightIds'])>1 for r in records),linkedRateReferences=sum(bool(r['matchedIds']) for r in rates),unlinkedRateReferences=sum(not r['matchedIds'] for r in rates))
manifest=dict(version=version,files=files,inventoryCount=len(records),insightCount=len(insights),summary=summary,issues=issues,renames=renames,sourcePolicy='表内数据为准；只按表内线路调整冲突文件名；价格区间与原始周期独立保留，不代填精确报价、税费、可售档期或坐标系')
summary.update(coverageReports=len(coverage),coverageSummaryRows=sum(len(r['summary']) for r in coverage),coverageDetailRows=sum(len(r['details']) for r in coverage),withCoverage=sum(bool(r['coverageIds']) for r in records),coverageLinkedRows=sum(bool(r['matchedIds']) for report in coverage for r in report['summary']),coverageDuplicateReports=sum(bool(r['duplicateOf']) for r in coverage))
out='// Generated by scripts/build-data.py from user-provided files. Do not edit the source workbooks.\n'
for name,value in [('realInventory',records),('realInsights',insights),('realRates',rates),('realPOIs',pois),('realSearches',searches),('realBriefSources',templates),('realCoverage',coverage),('realInventorySnapshots',snapshots),('dataManifest',manifest)]:
    out+='export const '+name+'='+json.dumps(value,ensure_ascii=False,separators=(',',':'))+';\n'
(DATA/'real-data.mjs').write_text(out,encoding='utf-8')
print(json.dumps({'inventoryCount':len(records),'insightCount':len(insights),'summary':summary,'issues':[{'file':i['source'],'route':i['route'],'issues':i['issues']} for i in insights if i['issues']]},ensure_ascii=False,indent=2))
