"""Read user source workbooks and produce browser data. Source files are never edited."""
from pathlib import Path
import sys, json, re, hashlib, warnings
from collections import Counter, defaultdict
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
for file in sorted(DATA.glob('*.xls')):
    wb = xlrd.open_workbook(file)
    count = 0
    for sh in wb.sheets():
        data = [sh.row_values(i) for i in range(sh.nrows)]
        start = next((i for i,r in enumerate(data) if r[:3]==['一级标签','二级标签','三级标签']), None)
        if start is None:
            issues.append(file.name+'：未识别到所选明细值表，未绑定媒体')
            continue
        month_row = next((r for r in data[:start] if re.fullmatch(r'2023\d{2}',str(r[0]))), None)
        if month_row is None:
            raise ValueError(file.name+'：缺少已核实的 2023 年月份')
        month = str(month_row[0])[:4]+'-'+str(month_row[0])[4:]
        title = str(data[0][0])
        filename_route = re.sub(r'^.*?公交_?', '', file.stem)
        expected = route_key(filename_route) if re.fullmatch(r'\d+路?', filename_route) else None
        for row_num, row in enumerate(data[start+3:], start+4):
            if len(row)<44 or row[0] not in ['公交','地铁'] or not str(row[2]).strip():
                continue
            route = str(row[2]).strip()
            ident = 'INS-'+hashlib.sha1((file.name+'|'+str(row_num)).encode()).hexdigest()[:12]
            problems=[]
            # User confirmed that workbook contents are authoritative. Names never override route cells.
            digest=hashlib.sha256(json.dumps([month,row],ensure_ascii=False).encode()).hexdigest()
            duplicate = seen_reports.get(digest)
            if not duplicate:
                seen_reports[digest]=ident
            poi={str(data[start+1][i]):number(row[i]) for i in range(31,min(44,len(row))) if str(data[start+1][i]).strip()}
            insight=dict(id=ident,source=file.name,sourceSheet=sh.name,sourceRow=row_num,sourceRef=sh.name+'!A'+str(row_num)+':AR'+str(row_num),sourceTitle=title,month=month,route=route,filenameRoute=filename_route,visits=number(row[3]),visitsDisplay=str(row[3]),people=number(row[4]),peopleDisplay=str(row[4]),timeSlots=[dict(label=k,value=number(row[5+i])) for i,k in enumerate(slots)],areaTypes={k:number(row[9+i]) for i,k in enumerate(['学校','医疗','小区','景点','餐饮'])},age=[dict(label=k,value=number(row[14+i])) for i,k in enumerate(age_labels)],gender=[dict(label=k,value=number(row[19+i])) for i,k in enumerate(['男性','女性'])],consumption=[dict(label=k,value=number(row[25+i])) for i,k in enumerate(['高','较高','中','较低','低'])],housing=[dict(label=k,value=number(row[21+i])) for i,k in enumerate(['无房','1套房','2套房','多套房'])],phoneBrand=str(row[30]),poi=poi,issues=problems,duplicateOf=duplicate,matchedIds=[])
            for resource in records:
                aliases = [route_key(x) for x in resource['name'].split('/')]
                if route_key(route) in aliases:
                    resource['insightIds'].append(ident)
                    insight['matchedIds'].append(resource['id'])
            if not insight['matchedIds'] and not problems:
                insight['issues'].append('当前库存文件没有同名线路，保留独立报告')
            insights.append(insight)
            count+=1
    files.append(dict(name=file.name,type='历史人流画像',count=count,month=month))

for resource in records:
    linked=[i for i in insights if i['id'] in resource['insightIds']]
    if len(linked)==1:
        resource['traffic']=linked[0]['people']
        resource['trafficMonth']=linked[0]['month']
    # Separate reports for a combined route are never summed into one audience number.
issues += ['库存文件没有可售起止日期和查询日期，无法核定 2027 档期。','尚无刊例价、制作费和含税口径，所有报价保持待补充。','未提供经纬度、门店清单或线路轨迹，地图不生成位置或覆盖圈。','2023-05 人流为历史所选区域数据，不能直接当作 2027 广告曝光或跨线路去重人数。']
summary=dict(totalCapacity=sum(r['capacity'] or 0 for r in records),available=sum(r['available'] or 0 for r in records),contracted=sum(r['contracted'] or 0 for r in records),reserved=sum(r['reserved'] or 0 for r in records),maintenance=sum(r['maintenance'] or 0 for r in records),withVacancy=sum((r['available'] or 0)>0 for r in records),withInsights=sum(bool(r['insightIds']) for r in records),linkedInsights=sum(bool(i['matchedIds']) for i in insights),unlinkedInsights=sum(not i['matchedIds'] for i in insights))
version=hashlib.sha256(b''.join((DATA/f['name']).read_bytes() for f in files)).hexdigest()[:16]
rename_file=DATA/'source-renames.json'
renames=json.loads(rename_file.read_text(encoding='utf-8')) if rename_file.exists() else []
manifest=dict(version=version,files=files,inventoryCount=len(records),insightCount=len(insights),summary=summary,issues=issues,renames=renames,sourcePolicy='表内数据为准；只按表内线路调整冲突文件名；不填写不存在的价格、日期、坐标或业务事实')
out='// Generated by scripts/build-data.py from user-provided files. Do not edit the source workbooks.\n'
for name,value in [('realInventory',records),('realInsights',insights),('dataManifest',manifest)]:
    out+='export const '+name+'='+json.dumps(value,ensure_ascii=False,separators=(',',':'))+';\n'
(DATA/'real-data.mjs').write_text(out,encoding='utf-8')
print(json.dumps({'inventoryCount':len(records),'insightCount':len(insights),'summary':summary,'issues':[{'file':i['source'],'route':i['route'],'issues':i['issues']} for i in insights if i['issues']]},ensure_ascii=False,indent=2))
