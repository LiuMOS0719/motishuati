import json, re, shutil, sys

QP = '/vol2/1000/Hermes/moti/data/questions.json'
FP = '/vol2/1000/Hermes/moti/data/figures.json'
shutil.copy(QP, QP + '.bak-20261125-explain')
shutil.copy(FP, FP + '.bak-20261125-a23')

data = json.load(open(QP, encoding='utf-8'))
orig = json.loads(json.dumps(data))          # 深拷贝用于 diff

FL = re.compile(r'\s*FL-\d\.\d(?:\.\d+)?\s*K[1-3]\s*\d+.*\Z', re.S)
ITEM = re.compile(r'(?<=[。；！？：）)\]】])\s*(?=(?:[a-hA-H][)）]|(?:i{1,3}|iv|v|vi{1,3}|ix|x)\.))')
NUMITEM = re.compile(r'(?<=[。；])\s*(?=\d{1,2}[.、)]\s*\S)')
ROMAN_ND = re.compile(r'(?<=[。；：])\s*(?=(?:i{1,3}|iv|v|vi{1,3})[\s、])')
ROMAN_MID = re.compile(r'(?<=[\u4e00-\u9fa5）])\s+(?=(?:i|ii|iii|iv|v|vi)[\s、])')
CAPITEM = re.compile(r'(?<=[。；])\s*(?=[A-H]\.[^\n]{2,})')
TH1 = re.compile(r'\s*(?=因此[:：]\s*[a-hA-H][)）])')
TH2 = re.compile(r'\s*(?=因此\s*[a-hA-H]\s*是正确的?)')

def fix_explain(e):
    if not e: return e
    e = FL.sub('', e)
    e = ITEM.sub('\n', e)
    e = NUMITEM.sub('\n', e)
    e = ROMAN_ND.sub('\n', e)
    e = ROMAN_MID.sub('\n', e)
    e = CAPITEM.sub('\n', e)
    e = TH1.sub('\n', e)
    e = TH2.sub('\n', e)
    e = re.sub(r'因此\s*([a-hA-H])\s*是正确的?', lambda m: '因此 %s 是正确的' % m.group(1).upper(), e)
    return '\n'.join(l.strip() for l in e.split('\n') if l.strip())

def fix_opt_text(t):
    m = re.match(r'^只有\s*(.+)$', (t or '').strip())
    if not m: return t
    nums = re.findall(r'\d+', m.group(1))
    return ('只有 ' + '、'.join(nums)) if nums else t

n_explain = n_opt = 0
for q in data:
    new = fix_explain(q.get('explain') or '')
    if new != q.get('explain'):
        q['explain'] = new; n_explain += 1
    if q['id'] == 'A-14':
        for o in q['options']:
            nt = fix_opt_text(o['t'])
            if nt != o['t']:
                o['t'] = nt; n_opt += 1

# 校验：题数、字段只动了 explain / A-14 options
assert len(data) == len(orig) == 184, '题数变了'
touched = []
for a, b in zip(orig, data):
    for k in set(a) | set(b):
        if a.get(k) != b.get(k):
            touched.append((b['id'], k))
print('改动字段:', sorted(set(k for _, k in touched)), '| 题数', len(touched))
assert set(k for _, k in touched) <= {'explain', 'options'}, '动到了不该动的字段'

no_nl = sum(1 for q in data if '\n' not in (q.get('explain') or '') and len(q.get('explain') or '') > 120)
print('写回后「无换行且>120字」的题:', no_nl)
print('解析改动 %d 题，A-14 选项改动 %d 个' % (n_explain, n_opt))
open(QP, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1))

# A-23 图：error 箭头改为 IN OPERATION -> DEBUG MODE（原图箭尖朝上）
figs = json.load(open(FP, encoding='utf-8'))
html = figs['A-23']['html']
old_path = 'M220,64 L220,132'
if old_path in html:
    figs['A-23']['html'] = html.replace(old_path, 'M220,140 L220,72')
    open(FP, 'w', encoding='utf-8').write(json.dumps(figs, ensure_ascii=False, indent=1))
    print('A-23: error 边 %s -> M220,140 L220,72' % old_path)
else:
    print('A-23: 未找到待替换的 path，需人工检查')
