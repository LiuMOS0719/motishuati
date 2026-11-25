#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并 4 卷 -> 去重后的 questions.json，并为表格/图题生成原题版面截图"""
import json, glob, re, hashlib, os

SRC = '/vol1/@appdata/trim.hermes/workspace/ctfl_data'
OUT = '/vol2/1000/Hermes/ctfl-quiz/data'
os.makedirs(OUT, exist_ok=True)

def norm(s):
    return re.sub(r'[\s，。、；：？！“”‘’（）()\[\]【】,.;:!?"\'-]', '', s)

def guess_kind(stem, answer):
    return 'multi' if len(answer) > 1 else 'single'

def main():
    raw = []
    for f in sorted(glob.glob(SRC + '/*.json')):
        d = json.load(open(f))
        for it in d['items']:
            it['paper'] = d['paper']
            raw.append(it)

    merged = {}
    order = []
    for it in raw:
        h = hashlib.md5(norm(it['stem']).encode()).hexdigest()
        if h in merged:
            merged[h]['papers'].add(it['paper'])
            merged[h]['refs'].append(f"{it['paper']}{it['no']}")
            continue
        it['papers'] = {it['paper']}
        it['refs'] = [f"{it['paper']}{it['no']}"]
        merged[h] = it
        order.append(h)

    out = []
    for h in order:
        it = merged[h]
        papers = sorted(it['papers'])
        qid = f"{papers[0]}-{it['no']}"
        out.append({
            'id': qid,
            'papers': ','.join(papers),
            'no': it['no'],
            'is_extra': 1 if it['no'].startswith('A') else 0,
            'stem': it['stem'].strip(),
            'options': it['options'],
            'answer': it['answer'],
            'lo': it['lo'],
            'k_level': it['k'],
            'pts': it['pts'],
            'explain': it['explain'].strip(),
            'kind': guess_kind(it['stem'], it['answer']),
            'image': '',
            'stem_hash': h,
        })

    json.dump(out, open(f'{OUT}/questions.json', 'w'), ensure_ascii=False, indent=1)
    print('题库条数:', len(out))
    print('单选题:', sum(1 for q in out if q['kind'] == 'single'),
          '多选题:', sum(1 for q in out if q['kind'] == 'multi'))

if __name__ == '__main__':
    main()
