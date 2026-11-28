#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨题 · 身份层导入（阶段二）
SQLite quiz.db 的 users / auth_tokens → MariaDB moti。

铁律（见任务单 5.2）：
- id 原样，不重排
- pass_hash / salt **原样字符串**，不重算、不改算法（这是「账号原样登录」的唯一保证）
- role 由 is_admin 映射，OWNER_ID 必须人工指定，脚本不猜
- 全部有效 token 都要搬（少一条就是一个人被强制重登）

用法：PYTHONPATH=/tmp/pym python3 db/import_identity.py [--dry-run]
"""
import json, re, subprocess, sys, datetime

DB = dict(host='127.0.0.1', port=3306, user='moti_app',
          password='MotiApp#2026-x7Kq9', database='moti', charset='utf8mb4')
OWNER_ID = 3          # liumos —— 站长本人（由执行者按 SQLite 查询结果确认）
DRY = '--dry-run' in sys.argv
NOW = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def dump_sqlite():
    """从容器里读 SQLite（属主 root，宿主读不了），输出 JSON"""
    code = '''
import sqlite3, json
c = sqlite3.connect('/data/quiz.db'); c.row_factory = sqlite3.Row
users = [dict(r) for r in c.execute(
    "SELECT id,username,pass_hash,salt,created_at,last_login,is_admin,quota FROM users ORDER BY id")]
tokens = [dict(r) for r in c.execute(
    "SELECT token,user_id,created_at,expires_at FROM auth_tokens ORDER BY token")]
print(json.dumps({'users': users, 'tokens': tokens}, ensure_ascii=False))
'''
    r = subprocess.run(['docker', 'exec', 'moti', 'python3', '-c', code],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('读 SQLite 失败: ' + r.stderr[:400])
    return json.loads(r.stdout)


def main():
    d = dump_sqlite()
    users, tokens = d['users'], d['tokens']

    # 校验源数据
    print('=== 源库（SQLite）===')
    print('  users %d / auth_tokens %d' % (len(users), len(tokens)))
    bad_hash = [u['username'] for u in users if len(u['pass_hash'] or '') != 64]
    bad_salt = [u['username'] for u in users if len(u['salt'] or '') != 32]
    if bad_hash or bad_salt:
        raise SystemExit('❌ 源库哈希长度异常：hash %s / salt %s' % (bad_hash, bad_salt))

    # 角色映射
    admins = [u for u in users if u['is_admin'] == 1]
    print('  管理员 %d 人：%s' % (len(admins), [u['username'] for u in admins]))
    if not any(u['id'] == OWNER_ID for u in users):
        raise SystemExit('❌ OWNER_ID=%s 不在源库里' % OWNER_ID)

    rows = []
    for u in users:
        if u['is_admin'] == 1:
            role = 'owner' if u['id'] == OWNER_ID else 'admin'
        else:
            role = 'user'
        rows.append((u['id'], u['username'], u['pass_hash'], u['salt'], role, 'active',
                     int(u['quota'] or 0), None, u['created_at'] or NOW,
                     (u['last_login'] or None), NOW))

    # token：只搬 48 字符的（8 字符的是历史测试残留，见报告）
    good_tokens, dropped = [], []
    for t in tokens:
        if len(t['token']) == 48:
            good_tokens.append((t['token'], t['user_id'], t['created_at'], t['expires_at']))
        else:
            dropped.append(t)

    print('\n=== 待导入 ===')
    for r in rows:
        print('  id=%-3s %-14s role=%-6s quota=%s' % (r[0], r[1], r[4], r[6]))
    print('  tokens %d 条（丢弃 %d 条非 48 字符的：%s）' % (
        len(good_tokens), len(dropped), [x['token'] for x in dropped]))

    if DRY:
        print('\n(dry-run，未写库)')
        return

    import pymysql
    con = pymysql.connect(**DB, autocommit=False)
    try:
        with con.cursor() as cur:
            # users 用 UPSERT：它被 admin_notes / feedback / quiz_sessions 引用，
            # DELETE 会触发外键错误，重跑身份层也不该清空下游数据
            cur.execute('DELETE FROM auth_tokens')
            cur.executemany('''INSERT INTO users
                (id,username,pass_hash,salt,role,status,quota,remark,created_at,last_login,updated_at)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE username=VALUES(username), pass_hash=VALUES(pass_hash),
                salt=VALUES(salt), role=VALUES(role), status=VALUES(status), quota=VALUES(quota),
                created_at=VALUES(created_at), last_login=VALUES(last_login), updated_at=VALUES(updated_at)''', rows)
            cur.executemany('''INSERT INTO auth_tokens(token,user_id,created_at,expires_at)
                VALUES(%s,%s,%s,%s)''', good_tokens)
        con.commit()
        print('\n✅ 身份层导入完成')
    except Exception as e:
        con.rollback()
        print('\n❌ 失败，已回滚:', e)
        raise
    finally:
        con.close()


if __name__ == '__main__':
    main()
