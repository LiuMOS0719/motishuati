#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨题 · 内容层验收（阶段一）
对应任务单第 7 节 ①～⑬。用法：PYTHONPATH=/tmp/pym python3 db/verify.py
"""
import re, sys, json

DB = dict(host='127.0.0.1', port=3306, user='moti_app',
          password='MotiApp#2026-x7Kq9', database='moti', charset='utf8mb4')
FIG_REF = re.compile(r'\{\{FIG:([\w.\-]+)\}\}')
UNICODE_MATH = '½⅓¼⅔⅕√∑∏∫∞'

import pymysql
con = pymysql.connect(**DB)
cur = con.cursor()
fails = []


def one(sql, args=None):
    cur.execute(sql, args or ())
    return cur.fetchone()


def all_(sql, args=None):
    cur.execute(sql, args or ())
    return cur.fetchall()


def check(no, name, ok, detail=''):
    print('%s %s %s%s' % ('✅' if ok else '❌', no, name, ('  ' + detail) if detail else ''))
    if not ok:
        fails.append('%s %s %s' % (no, name, detail))


# ① 题目数
n = one('SELECT COUNT(*) FROM questions')[0]
check('①', '题目数', n == 184, '实际 %d（期望 184）' % n)

# ② 图表数
n = one('SELECT COUNT(*) FROM figures')[0]
check('②', '图表数', n == 19, '实际 %d（期望 19）' % n)

# ③ 每题都有大纲节点
rows = all_('''SELECT q.id FROM questions q
               LEFT JOIN question_syllabus qs ON qs.course_id=q.course_id AND qs.qid=q.id
               WHERE qs.qid IS NULL''')
check('③', '无大纲节点的题', not rows, '缺 %d 道 %s' % (len(rows), [r[0] for r in rows][:8]) if rows else '')

# ④ 每题至少在某一卷
rows = all_('''SELECT q.id FROM questions q
               LEFT JOIN question_papers qp ON qp.course_id=q.course_id AND qp.qid=q.id
               WHERE qp.qid IS NULL''')
check('④', '无卷归属的题', not rows, '缺 %d 道 %s' % (len(rows), [r[0] for r in rows][:8]) if rows else '')

# ⑤ 卷内题号不重复
rows = all_('''SELECT paper_id, no, COUNT(*) c FROM question_papers
               GROUP BY paper_id, no HAVING c > 1''')
check('⑤', '卷内题号重复', not rows, str(rows[:6]) if rows else '')

# ⑥ A 卷题集
rows = all_('''SELECT qp.qid, qp.no FROM question_papers qp
               WHERE qp.paper_id='A' ORDER BY CAST(qp.no AS UNSIGNED)''')
print('⑥ A 卷题数 %d（期望 40），前 5 题：%s' % (len(rows), [r[0] for r in rows[:5]]))
check('⑥', 'A 卷题数', len(rows) == 40, '实际 %d' % len(rows))

# ⑦ 第 2 章题集（含子节点）
rows = all_('''WITH RECURSIVE sub AS (
                 SELECT id FROM syllabus_nodes WHERE id='ctfl.ch2'
                 UNION ALL SELECT n.id FROM syllabus_nodes n JOIN sub s ON n.parent_id=s.id
               )
               SELECT DISTINCT qs.qid FROM question_syllabus qs JOIN sub ON qs.node_id=sub.id''')
print('⑦ 第 2 章题数 %d（期望 27）' % len(rows))
check('⑦', '第 2 章题数', len(rows) == 27, '实际 %d' % len(rows))

# ⑧ A 卷 × 第 2 章交集
rows = all_('''SELECT DISTINCT a.qid FROM
                 (SELECT qid FROM question_papers WHERE paper_id='A') a
                 JOIN (SELECT qid FROM question_syllabus WHERE node_id='ctfl.ch2') b USING(qid)''')
print('⑧ A 卷∩第 2 章 %d 题（期望 6）：%s' % (len(rows), sorted(r[0] for r in rows)))
check('⑧', 'A∩第2章', len(rows) == 6, '实际 %d' % len(rows))

# ⑨ 每卷 qcount 与实际
rows = all_('''SELECT p.id, p.qcount, COUNT(qp.qid) actual
               FROM papers p LEFT JOIN question_papers qp ON qp.paper_id=p.id
               GROUP BY p.id, p.qcount ORDER BY p.id''')
print('⑨ 各卷题数：')
for pid, qc, actual in rows:
    print('    %-6s qcount=%s actual=%s %s' % (pid, qc, actual, '✅' if qc == actual else '❌'))
bad = [r for r in rows if r[1] != r[2]]
check('⑨', 'papers.qcount 与实际一致', not bad, str(bad) if bad else '')

# ⑩ {{FIG:id}} 引用完整性
cur.execute('SELECT course_id, id, stem, `explain` FROM questions')
qrows = cur.fetchall()          # 先把结果取完，避免后面复用同一游标把结果集覆盖
figs = {(r[0], r[1]) for r in all_('SELECT course_id, id FROM figures')}
missing = []
used = 0
for cid, qid, stem, expl in qrows:
    for text in (stem or '', expl or ''):
        for fid in FIG_REF.findall(text):
            used += 1
            if (cid, fid) not in figs:
                missing.append((qid, fid))
print('⑩ {{FIG:id}} 引用 %d 处，缺失 %d 处 %s' % (used, len(missing), missing[:6]))
check('⑩', '图表引用完整', not missing, str(missing[:6]) if missing else '')

# ⑪ stem_plain 非空
rows = all_("SELECT id FROM questions WHERE stem_plain IS NULL OR TRIM(stem_plain)=''")
check('⑪', 'stem_plain 非空', not rows, str([r[0] for r in rows][:8]) if rows else '')

# ⑫ 无残留裸 {{FIG}}
rows = all_("""SELECT id FROM questions
               WHERE stem LIKE '%%{{FIG}}%%' OR `explain` LIKE '%%{{FIG}}%%'""")
check('⑫', '无残留裸 {{FIG}}', not rows, str([r[0] for r in rows][:8]) if rows else '')

# ⑬ Unicode 数学字符（含数学字母 U+1D400-1D7FF、运算符、分数、上下标；≤≥≠ 允许保留）
ALLOWED = set('≤≥≠±≈')
hits = {}
cur.execute('SELECT id, stem, `explain` FROM questions')
for qid, stem, expl in cur.fetchall():
    found = []
    for text in (stem or '', expl or ''):
        for ch in text:
            o = ord(ch)
            if (0x1D400 <= o <= 0x1D7FF or 0x2200 <= o <= 0x22FF or o in (0xBD, 0xBC, 0xBE)
                    or 0x2150 <= o <= 0x215F or 0x2070 <= o <= 0x209F) and ch not in ALLOWED:
                found.append(ch)
    if found:
        hits[qid] = ''.join(sorted(set(found)))
print('⑬ 含需转换的 Unicode 数学字符的题 %d 道：%s' % (
    len(hits), ', '.join('%s(%s)' % (k, v) for k, v in sorted(hits.items()))))

print()
if fails:
    print('❌ 未通过 %d 项：' % len(fails))
    for f in fails:
        print('   ', f)
    sys.exit(1)
print('✅ 全部必须项通过（①-⑤、⑨-⑫）')
