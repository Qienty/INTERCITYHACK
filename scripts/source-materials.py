"""Read additional source tables verbatim. Never edit source workbook or CSV contents."""
from pathlib import Path
import csv,hashlib,re,json,warnings
import openpyxl

def money_range(value):
    text=str('' if value is None else value).strip()
    match=re.fullmatch(r'约?\s*(\d+(?:\.\d+)?)\s*[–—~～\-至]\s*(\d+(?:\.\d+)?)\s*(万|千|元)?',text)
    if not match:return None,None
    scale={'万':10000,'千':1000,'元':1,None:1}[match[3]]
    return float(match[1])*scale,float(match[2])*scale

def literal_number(value):
    text=str('' if value is None else value).strip()
    # CSV exporter wraps numeric strings as ="...". Only unwrap a complete literal; never evaluate formulas.
    match=re.fullmatch(r'="([+-]?\d+(?:\.\d+)?)"',text)
    if match:text=match[1]
    if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?',text):return None
    number=float(text)
    return int(number) if number.is_integer() else number

def read_materials(data,inventory):
    rates,pois,searches,templates,files,issues,snapshots=[],[],[],[],[],[],[]
    for file in sorted(data.glob('*.xlsx')):
        if file.name=='公交车身媒体库存.xlsx':continue
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',UserWarning)
            book=openpyxl.load_workbook(file,read_only=True,data_only=True)
        file_count=0;source_notes=[]
        for sheet in book:
            rows=list(sheet.iter_rows(values_only=True))
            source_notes.extend(str(row[0]) for row in rows if row and row[0] is not None and str(row[0]).strip().startswith('注'))
            header=next((i for i,row in enumerate(rows) if len(row)>5 and str(row[0]).strip()=='媒体类型' and '刊例价' in str(row[2])),None)
            if header is None:
                issues.append(file.name+' / '+sheet.title+'：未识别工作表，已登记来源但未编造结构。')
                continue
            media_type=''
            for n,row in enumerate(rows[header+1:],header+2):
                if row[0] is not None:media_type=str(row[0]).strip()
                if len(row)<6 or row[1] is None or row[2] is None:continue
                name=str(row[1]).strip();price=str(row[2]).strip();production=str(row[5] or '').strip()
                low,high=money_range(price);prod_low,prod_high=money_range(production)
                media='bus' if media_type in ['公交车','双层巴士','南京路铛铛车'] else 'metro' if '地铁出入口' in media_type else None
                ident='RATE-'+hashlib.sha1((file.name+'|'+sheet.title+'|'+str(n)).encode()).hexdigest()[:12]
                refs=[]
                for resource in inventory:
                    if media=='bus' and media_type=='公交车' and resource['media']=='bus' and resource['grade']==name:refs.append(resource['id'])
                    elif media=='metro' and resource['media']=='metro' and (resource['name']==name or resource['grade']==name):refs.append(resource['id'])
                rates.append(dict(id=ident,media=media,mediaType=media_type,name=name,priceText=price,priceLow=low,priceHigh=high,quantity=literal_number(row[3]),periodText=str(row[4] or ''),productionText=production,productionLow=prod_low,productionHigh=prod_high,priceIncludesTax=None,periodDays=None,source=file.name,sourceSheet=sheet.title,sourceRow=n,sourceRef=sheet.title+'!A'+str(n)+':F'+str(n),matchedIds=refs,referenceOnly=True))
                for resource in inventory:
                    if resource['id'] in refs:resource.setdefault('rateIds',[]).append(ident)
                file_count+=1
        book.close()
        files.append(dict(name=file.name,type='区间刊例价',count=file_count,note='保留原始区间、发布期与制作费，不自动取中值或转换计价周期',sourceNotes=source_notes))
    for file in sorted(data.glob('*.csv')):
        for encoding in ['utf-8-sig','gb18030']:
            try:content=file.read_text(encoding=encoding);break
            except UnicodeDecodeError:continue
        matrix=list(csv.reader(content.splitlines()))
        if not matrix:files.append(dict(name=file.name,type='空 CSV',count=0));continue
        headers=matrix[0];rows=[dict(zip(headers,row)) for row in matrix[1:] if any(str(c).strip() for c in row)]
        if all(key in headers for key in ['媒体编号','媒体名称','媒体类型','空车数','可售开始','可售结束']):
            path=file.relative_to(data).as_posix()
            snapshots.append(dict(id='SNAP-'+hashlib.sha1(path.encode()).hexdigest()[:12],source=path,rows=matrix))
            files.append(dict(name=path,type='按档期库存导出',count=len(rows),note='保留独立日期快照，由用户明确载入；公交、地铁与合并文件不可累加为三批库存'))
        elif all(key in headers for key in ['名称','经度','纬度']):
            for n,row in enumerate(rows,2):
                lon,lat=literal_number(row['经度']),literal_number(row['纬度'])
                if lon is not None and not -180<=lon<=180:lon=None
                if lat is not None and not -90<=lat<=90:lat=None
                ident='POI-'+hashlib.sha1((file.name+'|'+str(n)).encode()).hexdigest()[:12]
                pois.append(dict(id=ident,name=row['名称'],category=row.get('类型',''),entity=row.get('主体名称',''),mergedCount=literal_number(row.get('合并数量')),address=row.get('地址',''),distanceText=row.get('距离中心点',''),center=row.get('中心点',''),district=row.get('行政区',''),lon=lon,lat=lat,coordinateSystem=None,source=file.name,sourceRow=n,sourceRef='CSV!A'+str(n)+':'+chr(64+len(headers))+str(n),raw=row))
            files.append(dict(name=file.name,type='周边点位明细',count=len(rows),note='坐标系未注明，作为来源参考点位，不自动作为客户门店或可售库存'))
        elif '检索数量' in headers:
            for n,row in enumerate(rows,2):searches.append(dict(id='SEARCH-'+hashlib.sha1((file.name+'|'+str(n)).encode()).hexdigest()[:12],mode=row.get('检索模式',''),district=row.get('行政区',''),category=row.get('点位类型',''),count=literal_number(row.get('检索数量')),center=row.get('中心点名称',''),lon=literal_number(row.get('中心点经度')),lat=literal_number(row.get('中心点纬度')),radiusText=row.get('搜索半径',''),source=file.name,sourceRow=n,raw=row))
            files.append(dict(name=file.name,type='区域检索汇总',count=len(rows),note='只有检索总数，不包含逐项点位或坐标清单'))
        elif '字段' in headers and '填写内容' in headers:
            filled=[r for r in rows if str(r.get('填写内容','')).strip()]
            templates.append(dict(id='BRIEF-'+hashlib.sha1(file.name.encode()).hexdigest()[:12],name=file.name,headers=headers,rows=rows,filledCount=len(filled),source=file.name))
            files.append(dict(name=file.name,type='客户需求模板' if not filled else '客户需求材料',count=len(rows),note='空白填写模板，无客户记录' if not filled else '包含填写内容，需在客户需求中整体确认后使用'))
        else:files.append(dict(name=file.name,type='CSV 原始资料',count=len(rows),headers=headers,rows=rows,note='保留原始列，未映射成库存或客户需求'))
    return rates,pois,searches,templates,files,issues,snapshots
