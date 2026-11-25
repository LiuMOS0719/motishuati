import json, re

QP = '/vol2/1000/Hermes/moti/data/questions.json'
data = json.load(open(QP, encoding='utf-8'))
OPT2 = re.compile(r'(?<=[\u4e00-\u9fa5A-Za-z0-9）)】])\s+(?=[a-h][)）]\s*(?:是)?正确)')

changed = []
for q in data:
    e = q.get('explain') or ''
    if not e: continue
    n = OPT2.sub('\n', e)
    if n != e:
        q['explain'] = '\n'.join(l.strip() for l in n.split('\n') if l.strip())
        changed.append(q['id'])
print('本轮改动:', changed)

# 过度断行检查：行数很多的题
from collections import Counter
cnt = [(q['id'], (q.get('explain') or '').count('\n') + 1) for q in data]
many = [x for x in cnt if x[1] >= 10]
print('行数>=10 的题:', many[:12], '（共 %d 题）' % len(many))
print('平均行数: %.1f' % (sum(c for _, c in cnt) / len(cnt)))
open(QP, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1))
