from pathlib import Path
import json
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.tools' / 'python'))
import xlrd
import openpyxl
root = Path(__file__).resolve().parents[1] / 'data'
inventory = root / '公交车身媒体库存.xlsx'
wb = openpyxl.load_workbook(inventory, read_only=True, data_only=True)
for sheet in wb:
    rows = list(sheet.iter_rows(values_only=True))
    print(json.dumps({'file': inventory.name, 'sheet': sheet.title, 'rows': len(rows), 'columns': sheet.max_column, 'head': rows[:9], 'tail': rows[-3:]}, ensure_ascii=False, default=str))
files = sorted(root.glob('*.xls'))
print('XLS_COUNT', len(files))
for file in files[:2]:
    raw = file.read_bytes()
    print('XLS_SIGNATURE', file.name, raw[:24].hex())
    if raw.startswith(bytes.fromhex('d0cf11e0')):
        book = xlrd.open_workbook(file)
        for sh in book.sheets():
            rows = [[(i + 1, str(v)) for i, v in enumerate(sh.row_values(r)) if v != ''] for r in range(sh.nrows)]
            print(json.dumps({'file':file.name,'sheet':sh.name,'rows':sh.nrows,'cols':sh.ncols,'cells':[(i+1,r) for i,r in enumerate(rows) if r]},ensure_ascii=False))
    else:
        for enc in ['utf-8-sig', 'utf-16', 'gb18030']:
            try:
                print('XLS_TEXT', enc, raw.decode(enc)[:9000])
                break
            except UnicodeError:
                pass
rows = list(wb.worksheets[0].iter_rows(values_only=True))
print('INVENTORY_TOTALS',json.dumps({rows[0][col]:sum(float(r[col] or 0) for r in rows[1:]) for col in range(5,11)},ensure_ascii=False))
print('DUPLICATE_ROUTES', [name for name in set(r[1] for r in rows[1:]) if sum(r[1]==name for r in rows[1:])>1])
