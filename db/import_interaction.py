#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨题 · 交互层导入（阶段三）
SQLite 的 user_state / ask_usage / feedback / admin_notes → MariaDB 7 张表。

铁律（任务单第 5 节）：
- 不改任何 user_id / qid
- 不丢任何一场、任何一条 AI 消息、任何一条反馈
- quiz_items 按 qids 全量展开（未答的 chosen/correct 为 NULL）
- 权重用 weight.py（Decimal + ROUND_HALF_UP），不用 round()
- 只读 SQLite，不写

用法：PYTHONPATH=/tmp/pym python3 db/import_interaction.py [--dry-run]
"""
import json, subprocess, sys, datetime, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from weight import weight_from_seq, self_test

DB = dict(host='127.0.0.1', port=3306, user='moti_app',
          password='MotiApp#2026-x7Kq9', database='moti', charset='utf8mb4')
COURSE = 'ctfl'
DRY = '--dry-run' in sys.argv


def dump_sqlite():
    code = r'''
import sqlite3, json
c = sqlite3.connect('/data/quiz.db'); c.row_factory = sqlite3.Row
out = {}
out['state'] = [dict(r) for r in c.execute('SELECT user_id, state_json, updated_at FROM user_state ORDER BY user_id')]
out['usage'] = [dict(r) for r in c.execute('SELECT * FROM ask_usage')]
out['fb'] = [dict(r) for r in c.execute('SELECT * FROM feedback ORDER BY id')]
out['notes'] = [dict(r) for r in c.execute('SELECT * FROM admin_notes ORDER BY id')]
print(json.dumps(out, ensure_ascii=False))
'''
    r = subprocess.run(['docker', 'exec', 'moti', 'python3', '-c', code],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('读 SQLite 失败: ' + r.stderr[:400])
    return json.loads(r.stdout)


def ts2str(ms):
    if not ms:
        return None
    try:
        return datetime.datetime.fromtimestamp(ms / 1000).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return None


def main():
    if not self_test():
        raise SystemExit('❌ 权重用例未通过，停止迁移')

    d = dump_sqlite()
    states, usage, fbs, notes = d['state'], d['usage'], d['fb'], d['notes']
    print('\n=== 源数据 ===')
    print('  user_state %d 行 / ask_usage %d / feedback %d / admin_notes %d' % (
        len(states), len(usage), len(fbs), len(notes)))

    # 题干 pts（算 score 用）
    import pymysql
    con = pymysql.connect(**DB, autocommit=False)
    cur = con.cursor()
    cur.execute('SELECT id, pts FROM questions')
    pts = {r[0]: int(r[1] or 1) for r in cur.fetchall()}
    cur.execute('SELECT id FROM users')
    valid_users = {r[0] for r in cur.fetchall()}
    print('  questions.pts %d 条 / 库内 users %d 个' % (len(pts), len(valid_users)))

    sess_rows, item_rows, msg_rows, w_rows = [], [], [], []
    ext_map = {}          # (user_id, ext_id) -> 临时序号（插入后回填 sid）
    problems = {'json_fail': [], 'no_user': [], 'no_qid': [], 'chat_orphan': []}
    seq_sid = 0

    for st in states:
        uid = st['user_id']
        try:
            sj = json.loads(st['state_json'])
        except Exception as e:
            problems['json_fail'].append((uid, str(e)))
            raise SystemExit('❌ user %s 的 state_json 解析失败：%s' % (uid, e))
        if uid not in valid_users:
            problems['no_user'].append(uid)
            continue

        sessions = list(sj.get('sessions') or [])
        cur_s = sj.get('current') or None
        # current 只在其 id 不在 sessions 里时才单独插（否则是上一场的副本）
        if cur_s and cur_s.get('id') and cur_s['id'] not in {s.get('id') for s in sessions}:
            sessions.append(cur_s)

        for s in sessions:
            seq_sid += 1
            tmp = seq_sid
            ext = s.get('id') or ('s%d' % tmp)
            ext_map[(uid, ext)] = tmp
            qids = s.get('qids') or []
            items = {it['qid']: it for it in (s.get('items') or []) if it.get('qid')}
            answered = len(items)
            correct = sum(1 for it in items.values() if it.get('correct'))
            score = sum(int(pts.get(q, 1)) for q, it in items.items() if it.get('correct'))
            sources = s.get('sources') or []
            src_short = 'MULTI' if len(sources) > 1 else (s.get('source') or (sources[0] if sources else None))
            started = ts2str(s.get('ts'))
            finished = 1 if s.get('finished') else 0
            sess_rows.append((tmp, ext, uid, COURSE, int(s.get('ts') or 0),
                              ','.join(sources) or None, src_short, s.get('mode') or None,
                              len(qids), answered, correct, score, finished,
                              started, started if finished else None))
            perms = s.get('perms') or {}
            for i, qid in enumerate(qids, 1):
                it = items.get(qid)
                if qid not in pts:
                    problems['no_qid'].append(qid)
                item_rows.append((tmp, i, COURSE, qid,
                                  json.dumps(it['chosen'], ensure_ascii=False) if it and it.get('chosen') is not None else None,
                                  (1 if it.get('correct') else 0) if it else None,
                                  json.dumps(perms[qid], ensure_ascii=False) if qid in perms else None,
                                  None))
            # 整场评价
            for m in (s.get('review') or []):
                msg_rows.append((uid, COURSE, tmp, None, 'review',
                                 'ai' if m.get('role') == 'ai' else 'me', None,
                                 m.get('content') or '', st.get('updated_at')))

        # 单题答疑
        for key, arr in (sj.get('chats') or {}).items():
            sid_tmp, qid = (None, key)
            if '::' in key:
                a, b = key.split('::', 1)
                sid_tmp, qid = ext_map.get((uid, a)), b
                if sid_tmp is None:
                    problems['chat_orphan'].append(key)
            for m in (arr or []):
                msg_rows.append((uid, COURSE, sid_tmp, qid, 'ask',
                                 'ai' if m.get('role') == 'ai' else 'me', None,
                                 m.get('content') or '', st.get('updated_at')))

    # ---- q_weight：从 quiz_items 回算 ----
    seqs = {}
    for sid_tmp, seq, cid, qid, chosen, correct, order, at in item_rows:
        if correct is None:
            continue
        seqs.setdefault((None, qid, sid_tmp), []).append(correct)   # 用 sid_tmp 保持时间序
    # 需要场次时间排序：用 sess_rows 的 ts
    ts_of = {r[0]: r[4] for r in sess_rows}
    by_q = {}
    for (_, qid, sid_tmp), vals in seqs.items():
        by_q.setdefault(qid, []).append((ts_of.get(sid_tmp, 0), sid_tmp, vals[0]))
    # 重新按 (user, qid) 聚合
    uq = {}
    for sid_tmp, seq, cid, qid, chosen, correct, order, at in item_rows:
        if correct is None:
            continue
        uid = next(r[2] for r in sess_rows if r[0] == sid_tmp)
        uq.setdefault((uid, qid), []).append((ts_of.get(sid_tmp, 0), seq, correct))
    for (uid, qid), lst in uq.items():
        lst.sort(key=lambda x: (x[0], x[1]))
        seq_vals = [x[2] for x in lst]
        last5, sc, sw, w = weight_from_seq(seq_vals)
        w_rows.append((uid, COURSE, qid, last5, sc, sw, len(seq_vals), sum(seq_vals), w, None))

    # ---- ask_usage：session_id → sid ----
    usage_rows = []
    for u in usage:
        uid = u['user_id']
        sj = u.get('session_id') or ''
        if sj:
            tmp = ext_map.get((uid, sj))
            sid = tmp if tmp else 0
        else:
            sid = 0
        usage_rows.append((uid, sid, u['qid'], u['model'], int(u.get('cnt') or 0),
                           u.get('first_ts'), u.get('last_ts')))

    # ---- feedback / admin_notes ----
    # user_id=0 是账号系统上线前的匿名反馈，转 NULL（不丢，也不篡改归属）
    fb_rows = [(f['user_id'] or None, COURSE, f['qid'], f.get('kind') or '其他',
                f.get('note') or '', f.get('status') or 'open', f.get('created_at'))
               for f in fbs]
    name2id = {}
    cur.execute('SELECT id, username FROM users')
    for r in cur.fetchall():
        name2id[r[1]] = r[0]
    import sqlite3  # noqa
    note_rows, note_orphan = [], []
    for n in notes:
        uid = name2id.get(n.get('username'))
        if uid is None:
            note_orphan.append(n.get('username'))
        qid = n.get('qid') or None
        note_rows.append((uid, n.get('page'), COURSE if qid else None, qid,
                          n.get('kind'), n.get('note') or '', n.get('status') or 'open',
                          n.get('created_at'), n.get('done_at')))

    print('\n=== 待导入 ===')
    print('  quiz_sessions %d / quiz_items %d / q_weight %d' % (len(sess_rows), len(item_rows), len(w_rows)))
    print('  ai_messages %d（ask %d / review %d）' % (
        len(msg_rows), sum(1 for m in msg_rows if m[4] == 'ask'), sum(1 for m in msg_rows if m[4] == 'review')))
    print('  ask_usage %d / feedback %d / admin_notes %d' % (len(usage_rows), len(fb_rows), len(note_rows)))
    if problems['chat_orphan']:
        print('  ⚠ 找不到场次的 chat 键:', problems['chat_orphan'][:5])
    if problems['no_qid']:
        print('  ⚠ 题号不在 questions 里（软引用，保留）:', sorted(set(problems['no_qid']))[:8])
    if note_orphan:
        print('  ⚠ 用户名反查失败的 admin_notes:', note_orphan)

    if DRY:
        print('\n(dry-run，未写库)')
        con.close()
        return

    try:
        cur.execute('DELETE FROM ai_messages')
        cur.execute('DELETE FROM quiz_items')
        cur.execute('DELETE FROM q_weight')
        cur.execute('DELETE FROM ask_usage')
        cur.execute('DELETE FROM feedback')
        cur.execute('DELETE FROM admin_notes')
        cur.execute('DELETE FROM quiz_sessions')
        cur.execute('ALTER TABLE quiz_sessions AUTO_INCREMENT = 1')
        cur.execute('ALTER TABLE ai_messages AUTO_INCREMENT = 1')
        cur.execute('ALTER TABLE feedback AUTO_INCREMENT = 1')
        cur.execute('ALTER TABLE admin_notes AUTO_INCREMENT = 1')

        cur.executemany('''INSERT INTO quiz_sessions
            (sid,ext_id,user_id,course_id,ts,sources,source,mode,qcount,answered,correct,score,
             finished,started_at,finished_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            sess_rows)
        cur.executemany('''INSERT INTO quiz_items
            (sid,seq,course_id,qid,chosen,correct,option_order,answered_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s)''', item_rows)
        cur.executemany('''INSERT INTO q_weight
            (user_id,course_id,qid,last5,streak_correct,streak_wrong,attempts,correct_total,weight,updated_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', w_rows)
        cur.executemany('''INSERT INTO ai_messages
            (user_id,course_id,sid,qid,scope,role,model,content,created_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''', msg_rows)
        cur.executemany('''INSERT INTO ask_usage(user_id,sid,qid,model,cnt,first_ts,last_ts)
            VALUES(%s,%s,%s,%s,%s,%s,%s)''', usage_rows)
        cur.executemany('''INSERT INTO feedback(user_id,course_id,qid,kind,note,status,created_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s)''', fb_rows)
        cur.executemany('''INSERT INTO admin_notes(user_id,page,course_id,qid,kind,note,status,created_at,done_at)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''', note_rows)
        con.commit()
        print('\n✅ 交互层导入完成')
    except Exception as e:
        con.rollback()
        print('\n❌ 失败，已回滚:', e)
        raise
    finally:
        con.close()


if __name__ == '__main__':
    main()
