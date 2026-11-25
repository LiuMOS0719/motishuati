#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CTFL 模拟卷全量解析：问题 PDF 文本 + 答案 PDF 文本 -> 结构化 JSON"""
import re, json, os, glob

TXT = '/vol1/@appdata/trim.hermes/workspace/ctfl_txt'
OUT = '/vol1/@appdata/trim.hermes/workspace/ctfl_data'

def lines_of(p):
    return [l.rstrip() for l in open(p, encoding='utf-8').read().split('\n')]

def is_noise(s):
    s = s.strip()
    if not s: return True
    if re.match(r'^\d{1,3}\s*/\s*\d{1,3}$', s): return True
    if s.startswith('CT-FL') or s.startswith('CT_FL'): return True
    if s.startswith('©') or s.startswith('（大纲'): return True
    if s.startswith('题目编号(#)'): return True
    if re.match(r'^（大纲 ?4\.0', s): return True
    return False

ANS_ROW = re.compile(r'^([A]?\d{1,2})\s+([a-e](?:\s*,\s*[a-e])*)\s+(FL-\d\.\d\.\d)\s+(K[1-4])\s+(\d+)\s*$')

def parse_answer_table(path):
    rows = {}
    for l in lines_of(path):
        s = l.strip()
        if not s: continue
        for part in re.split(r'\s{2,}(?=[A]?\d{1,2}\s+[a-e])', s):
            m = ANS_ROW.match(part.strip())
            if m:
                rows[m.group(1)] = {'ans': [x.strip().upper() for x in m.group(2).split(',')],
                                    'lo': m.group(3), 'k': m.group(4), 'pts': int(m.group(5))}
    return rows

Q_HEAD = re.compile(r'^([A]?\d{1,2})\.\s*(.*)$')
OPT_HEAD = re.compile(r'^([A-E])(?:[\.、,，)]\s*|\s+)(.*)$')
OPT_ONLY = re.compile(r'^([A-E])\s*[\.、,，]?$')

def parse_questions(path, order):
    """order: 期望题号顺序列表"""
    lines = [l.strip() for l in lines_of(path)]
    # 找到第一个 question 起点：跳过封面/目录，从 '问题' 章节开始
    start_idx = 0
    for i, l in enumerate(lines):
        if l == '问题':
            start_idx = i
    idx = start_idx
    items = []
    ptr = 0
    while ptr < len(order):
        target = order[ptr]
        found = -1
        for i in range(idx, len(lines)):
            m = Q_HEAD.match(lines[i])
            if m and m.group(1) == target:
                found = i
                break
        if found < 0:
            ptr += 1
            continue
        # 找下一题起点
        nxt = len(lines)
        if ptr + 1 < len(order):
            nt = order[ptr + 1]
            for i in range(found + 1, len(lines)):
                m = Q_HEAD.match(lines[i])
                if m and m.group(1) == nt:
                    nxt = i
                    break
        body = [l for l in lines[found:nxt] if not is_noise(l)]
        items.append(parse_item(target, body))
        idx = found + 1
        ptr += 1
    return items

def parse_item(no, body):
    stem = []
    opts = []
    if not body:
        return {'no': no, 'stem': '', 'options': []}
    m = Q_HEAD.match(body[0])
    stem.append(m.group(2) if m else body[0])

    def backtrack():
        # 选项字母重复出现：之前那组其实是题干里的对照表，退回题干
        stem.extend(f"{o['k']} {o['t']}" for o in opts)
        opts.clear()

    for l in body[1:]:
        if OPT_ONLY.match(l):
            if any(o['k'] == l[0] for o in opts):
                backtrack()
            opts.append({'k': l[0], 't': ''})
            continue
        mo = OPT_HEAD.match(l)
        if mo:
            if any(o['k'] == mo.group(1) for o in opts):
                backtrack()
            opts.append({'k': mo.group(1), 't': mo.group(2).strip()})
        else:
            if opts:
                opts[-1]['t'] += l
            else:
                stem.append(l)
    return {'no': no, 'stem': '\n'.join(stem), 'options': opts}

# ---------- 答案解析（详细解析章节） ----------
EXP_HEAD = re.compile(r'^([A]?\d{1,2})\s+([a-e](?:\s*,\s*[a-e])*)\s*(.*)$')

def parse_explanations(path):
    """扫描全文：形如 '12 c a) 不正确。…' 的行是逐题解析的起点"""
    lines = [l.strip() for l in lines_of(path)]
    out = {}
    cur = None
    for l in lines:
        if not l or is_noise(l) or '....' in l:
            continue
        m = EXP_HEAD.match(l)
        if m and re.fullmatch(r'A?\d{1,2}', m.group(1)) and not m.group(3).startswith('FL-'):
            no = m.group(1)
            cur = no
            out.setdefault(no, []).append(m.group(3))
        elif cur and m:
            out[cur].append(l)
        elif cur and not re.fullmatch(r'A?\d{1,2}\s*[\u4e00-\u9fff]*', l):
            out[cur].append(l)
    return {k: ' '.join(v) for k, v in out.items()}

def main():
    os.makedirs(OUT, exist_ok=True)
    papers = {}
    for qf in sorted(glob.glob(TXT + '/*问题*.txt')):
        tag = re.search(r'模拟卷([A-D])', qf).group(1)
        papers[tag] = {'q': qf}
    for af in sorted(glob.glob(TXT + '/*答案*.txt')):
        tag = re.search(r'模拟卷 ?([A-D])', af).group(1)
        papers.setdefault(tag, {})['a'] = af

    for tag, p in sorted(papers.items()):
        if 'q' not in p or 'a' not in p:
            print('缺文件:', tag, p.keys()); continue
        table = parse_answer_table(p['a'])
        order = [str(i) for i in range(1, 41)] + [f'A{i}' for i in range(1, 40)]
        order = [o for o in order if o in table] or order
        items = parse_questions(p['q'], order)
        exp = parse_explanations(p['a'])
        for it in items:
            t = table.get(it['no'], {})
            it['answer'] = t.get('ans', [])
            it['lo'] = t.get('lo', '')
            it['k'] = t.get('k', '')
            it['pts'] = t.get('pts', 1)
            it['explain'] = re.sub(r'\s*FL-\d\.\d\.\d\s+K[1-4]\s+\d+\s*$', '',
                                   exp.get(it['no'], ''))
        json.dump({'paper': tag, 'items': items}, open(f'{OUT}/{tag}.json', 'w'),
                  ensure_ascii=False, indent=1)
        bad = [(it['no'], len(it['options'])) for it in items if len(it['options']) < 4]
        noexp = [it['no'] for it in items if not it['explain']]
        print(f'{tag}卷: {len(items)}题  选项异常={bad}  缺解析={noexp}')

if __name__ == '__main__':
    main()
