"""Align file names with the authoritative route cells; never change workbook bytes."""
from pathlib import Path
import sys, re, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
DATA=(ROOT/'data').resolve()
sys.path.insert(0,str(ROOT/'.tools'/'python'))
import xlrd
log_file=DATA/'source-renames.json'
log=json.loads(log_file.read_text(encoding='utf-8')) if log_file.exists() else []
changes=[]
for source in sorted(DATA.glob('*.xls')):
    book=xlrd.open_workbook(source)
    routes=set()
    for sheet in book.sheets():
        start=next((i for i in range(sheet.nrows) if sheet.row_values(i)[:3]==['一级标签','二级标签','三级标签']),None)
        if start is not None:
            for i in range(start+3,sheet.nrows):
                row=sheet.row_values(i)
                if len(row)>2 and row[0] in ['公交','地铁'] and str(row[2]).strip():
                    routes.add(str(row[2]).strip())
    if len(routes)!=1:
        continue
    actual=next(iter(routes))
    label=re.sub(r'^.*?公交_?','',source.stem).split('__')[0]
    if re.sub(r'路$','',label)==re.sub(r'路$','',actual):
        continue
    prefix=re.split(r'公交',source.stem,maxsplit=1)[0]+'公交_'
    safe=re.sub(r'[\\/:*?"<>|]','-',actual)
    target=DATA/(prefix+safe+'.xls')
    if target.exists():
        old_label=re.sub(r'[\\/:*?"<>|]','-',label)
        target=DATA/(prefix+safe+'__原名'+old_label+'.xls')
        seq=2
        while target.exists():
            target=DATA/(prefix+safe+'__原名'+old_label+'_'+str(seq)+'.xls')
            seq+=1
    if source.resolve().parent!=DATA or target.resolve().parent!=DATA:
        raise ValueError('拒绝操作 data 目录以外的路径')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    original=source.name
    source.rename(target)
    after=hashlib.sha256(target.read_bytes()).hexdigest()
    if before!=after:
        raise ValueError('文件内容校验失败：'+target.name)
    item=dict(original=original,name=target.name,route=actual,sha256=before,contentUnchanged=True)
    log.append(item);changes.append(item)
log_file.write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'renamed':len(changes),'files':changes},ensure_ascii=False,indent=2))
