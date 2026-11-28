#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨题 · 交互层验收（阶段三）—— 任务单第 8 节 ①～⑮"""
import sys

DB = dict(host='127.0.0.1', port=3306, user='moti_app',
          password='MotiApp#2026-x7Kq9', database='moti', charset='utf8mb4')
import pymysql

con = pymysql.connect(**DB)
cur = con.cursor()
fails = []


def q1(sql):
    cur.execute(sql)
    return cur.fetchone()


def qa(sql):
    cur.execute(sql)
    return cur.fetchall()


def say(no, name, ok=None, detail=''):
    mark = '✅' if ok is True else ('⚠️' if ok is None else '❌')
    print('%s %s %s%s' % (mark, no, name, ('  ' + detail) if detail else ''))
    if ok is False:
        fails.append('%s %s %s' % (no, name, detail))


# ① 场次
n = q1('SELECT COUNT(*) FROM quiz_sessions')[0]
say('①', '场次数', n == 53, '实际 %d（5 个用户 sessions 52 + 1 个未完成 current）' % n)

# ② items 与 qcount 对齐
s1 = q1('SELECT SUM(qcount) FROM quiz_sessions')[0]
s2 = q1('SELECT COUNT(*) FROM quiz_items')[0]
say('②', 'items = SUM(qcount)', s1 == s2, '%s vs %s' % (s1, s2))

# ③ 权重行数
n = q1('SELECT COUNT(*) FROM q_weight')[0]
say('③', 'q_weight 行数', n > 0, '实际 %d（有作答记录的 user×题 组合）' % n)

# ④ AI 消息
cur.execute("SELECT scope, COUNT(*) FROM ai_messages GROUP BY scope")
d = dict(cur.fetchall())
say('④', 'ai_messages', sum(d.values()) == 280,
    'ask %d / review %d（合计 %d）' % (d.get('ask', 0), d.get('review', 0), sum(d.values())))

# ⑤ 计费
n = q1('SELECT COUNT(*) FROM ask_usage')[0]
say('⑤', 'ask_usage', n == 78, '实际 %d' % n)

# ⑥ 反馈
n = q1('SELECT COUNT(*) FROM feedback')[0]
say('⑥', 'feedback', n == 35, '实际 %d' % n)

# ⑦ 想法记录
n = q1('SELECT COUNT(*) FROM admin_notes')[0]
say('⑦', 'admin_notes', n == 22, '实际 %d' % n)

# ⑧ answered 与实际作答行数一致
rows = qa('''SELECT s.sid, s.answered, COUNT(i.seq) AS cnt
             FROM quiz_sessions s
             JOIN quiz_items i ON i.sid=s.sid AND i.chosen IS NOT NULL
             GROUP BY s.sid, s.answered HAVING s.answered <> cnt''')
say('⑧', '每场 answered 一致', not rows, str(rows[:5]) if rows else '')

# ⑨ correct 与实际答对行数一致
rows = qa('''SELECT s.sid, s.correct, SUM(i.correct) AS cnt
             FROM quiz_sessions s LEFT JOIN quiz_items i ON i.sid=s.sid
             GROUP BY s.sid, s.correct HAVING s.correct <> IFNULL(cnt,0)''')
say('⑨', '每场 correct 一致', not rows, str(rows[:5]) if rows else '')

# ⑩ items 连续覆盖 1..qcount
rows = qa('''SELECT s.sid, s.qcount, COUNT(i.seq), MIN(i.seq), MAX(i.seq)
             FROM quiz_sessions s LEFT JOIN quiz_items i ON i.sid=s.sid
             GROUP BY s.sid, s.qcount
             HAVING COUNT(i.seq) <> s.qcount OR MIN(i.seq) <> 1 OR MAX(i.seq) <> s.qcount''')
say('⑩', 'items 连续 1..qcount', not rows, str(rows[:5]) if rows else '')

# ⑪ ai_messages.sid 能对上
rows = qa('''SELECT m.id FROM ai_messages m LEFT JOIN quiz_sessions s ON s.sid=m.sid
             WHERE m.sid IS NOT NULL AND s.sid IS NULL''')
say('⑪', 'ai_messages.sid 有效', not rows, str(rows[:5]) if rows else '')

# ⑫ weight 范围
rows = qa('SELECT user_id,qid,weight FROM q_weight WHERE weight<0 OR weight>100')
say('⑫', 'weight 在 0-100', not rows, str(rows[:5]) if rows else '')

# ⑬ last5 格式
rows = qa("SELECT user_id,qid,last5 FROM q_weight WHERE last5 NOT REGEXP '^[01]{0,5}$'")
say('⑬', 'last5 格式合法', not rows, str(rows[:5]) if rows else '')

# ⑭ 权重抽样
print('\n⑭ 权重抽样（attempts>=3 的前 5 条，可手工按公式验算）：')
rows = qa('''SELECT user_id,qid,last5,streak_correct,streak_wrong,attempts,correct_total,weight
             FROM q_weight WHERE attempts>=3 ORDER BY attempts DESC LIMIT 5''')
for r in rows:
    print('    user=%s %-6s last5=%-6s 连对=%s 连错=%s 次数=%s 对=%s → weight=%s' % r)

# ⑮ admin_notes 反查失败
rows = qa('SELECT id,note FROM admin_notes WHERE user_id IS NULL AND note IS NOT NULL')
say('⑮', 'admin_notes 用户名反查', not rows, str([r[0] for r in rows][:5]) if rows else '全部对上')

print()
if fails:
    print('❌ 未通过 %d 项：' % len(fails))
    for f in fails:
        print('   ', f)
    sys.exit(1)
print('✅ 交互层验收全部通过')
