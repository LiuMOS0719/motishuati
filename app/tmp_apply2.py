import json, re

QP = '/vol2/1000/Hermes/moti/data/questions.json'
data = json.load(open(QP, encoding='utf-8'))

FL = re.compile(r'\s*FL-\d\.\d(?:\.\d+)?\s*K[1-3]\s*\d+.*\Z', re.S)
ITEM = re.compile(r'(?<=[。；！？：）)\]】])\s*(?=(?:[a-hA-H][)）]|(?:i{1,3}|iv|v|vi{1,3}|ix|x)\.))')
NUMITEM = re.compile(r'(?<=[。；])\s*(?=\d{1,2}[.、)]\s*\S)')
ROMAN_ND = re.compile(r'(?<=[。；：])\s*(?=(?:i{1,3}|iv|v|vi{1,3})[\s、])')
ROMAN_MID = re.compile(r'(?<=[\u4e00-\u9fa5）])\s+(?=(?:i|ii|iii|iv|v|vi)[\s、])')
CAPITEM = re.compile(r'(?<=[。；])\s*(?=[A-H]\.[^\n]{2,})')
TH1 = re.compile(r'\s*(?=因此[:：]\s*[a-hA-H][)）])')
TH2 = re.compile(r'\s*(?=因此\s*[a-hA-H]\s*是正确的?)')
# 新增：正文后直接跟 a) 正确/不正确（等价类题那种）
OPT_INLINE = re.compile(r'(?<=[\u4e00-\u9fa5A-Za-z0-9）)】])\s+(?=[a-h][)）]\s*(?:正确|不正确))')
# 新增：L1：/D1：/G1： 这种等价类定义分行
DIV_DEF = re.compile(r'(?<=[\u4e00-\u9fa5：:])\s+(?=[LDG]\d[：:])')

def fix_explain(e):
    if not e: return e
    e = FL.sub('', e)
    e = ITEM.sub('\n', e)
    e = OPT_INLINE.sub('\n', e)
    e = NUMITEM.sub('\n', e)
    e = ROMAN_ND.sub('\n', e)
    e = ROMAN_MID.sub('\n', e)
    e = CAPITEM.sub('\n', e)
    e = DIV_DEF.sub('\n', e)
    e = TH1.sub('\n', e)
    e = TH2.sub('\n', e)
    e = re.sub(r'因此\s*([a-hA-H])\s*是正确的?', lambda m: '因此 %s 是正确的' % m.group(1).upper(), e)
    return '\n'.join(l.strip() for l in e.split('\n') if l.strip())

changed = []
for q in data:
    old = q.get('explain') or ''
    new = fix_explain(old)
    if new != old:
        changed.append((q['id'], len(old), len(new)))
        q['explain'] = new

print('本轮又改动 %d 题: %s' % (len(changed), changed))
no_nl = [q['id'] for q in data if '\n' not in (q.get('explain') or '') and len(q.get('explain') or '') > 120]
print('仍无换行且>120字:', no_nl or '无')
open(QP, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1))

q20 = next(x for x in data if x['id'] == 'C-20')
print('\n=== C-20 结果 ===')
print(q20['explain'][:700])
