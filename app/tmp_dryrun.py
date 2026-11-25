import json, re

P = '/vol2/1000/Hermes/moti/data/questions.json'
data = json.load(open(P, encoding='utf-8'))

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

changed = shortened = 0
longlines = []
for q in data:
    old = q.get('explain') or ''
    new = fix_explain(old)
    if new != old:
        changed += 1
        if len(new) < len(old): shortened += 1
        for l in new.split('\n'):
            if len(l) > 240: longlines.append((q['id'], len(l), l[:70]))
print('改动 %d 题（缩短 %d），>240 字长行: %d 题' % (changed, shortened, len(longlines)))
for x in longlines: print('  ', x[0], x[1], '|', x[2])

print('\n=== 修正验证 ===')
for qid in ['A-5', 'A-14', 'C-15']:
    q = next(x for x in data if x['id'] == qid)
    t = fix_explain(q.get('explain') or '')
    print('---', qid, '| 结尾:', repr(t[-60:]))
