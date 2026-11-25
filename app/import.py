#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 questions.json 导入 SQLite（幂等，保留作答记录）"""
import json, sqlite3, os, sys

DATA = os.environ.get('DATA_DIR', '/data')
DB = f'{DATA}/quiz.db'
SRC = f'{DATA}/questions.json'
SAMPLE = f'{DATA}/questions.sample.json'


def pick_src():
    """正式题库优先；没有就退回示例题库，保证克隆下来能直接跑起来。"""
    if os.path.exists(SRC):
        return SRC
    if os.path.exists(SAMPLE):
        print('提示：没找到 questions.json，先用 questions.sample.json 的示例题运行')
        return SAMPLE
    return SRC

SCHEMA = """
CREATE TABLE IF NOT EXISTS banks(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short TEXT,
  subtitle TEXT,
  ai_context TEXT,
  review_context TEXT,
  chapters_json TEXT,
  papers_json TEXT,
  copyright_note TEXT,
  copyright TEXT,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS questions(
  id TEXT PRIMARY KEY,
  bank_id TEXT DEFAULT 'ctfl',
  chapter TEXT,
  papers TEXT NOT NULL,
  no TEXT NOT NULL,
  is_extra INTEGER DEFAULT 0,
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  lo TEXT, k_level TEXT, pts INTEGER DEFAULT 1,
  explain TEXT, kind TEXT, image TEXT, stem_hash TEXT,
  refs_json TEXT
);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qid TEXT NOT NULL,
  paper TEXT,
  no TEXT,
  kind TEXT,
  note TEXT,
  created_at TEXT,
  status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS auth_tokens(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS user_state(
  user_id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS image_desc(
  qid TEXT PRIMARY KEY,
  desc_text TEXT NOT NULL,
  model TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS figures(
  qid TEXT PRIMARY KEY,
  kind TEXT,
  html TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ask_usage(  user_id INTEGER NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',   -- 练习场次（s+时间戳），空串=老数据
  qid TEXT NOT NULL,
  model TEXT NOT NULL,
  cnt INTEGER DEFAULT 0,
  first_ts TEXT,
  last_ts TEXT,
  PRIMARY KEY(user_id, session_id, qid, model)
);
"""

# 老库升级：给 users 补列
MIGRATIONS = [
    ('users', 'is_admin', 'INTEGER DEFAULT 0'),
    ('users', 'quota', 'INTEGER DEFAULT 0'),   # 新账号默认没有 DeepSeek 额度，由管理员按需发放
]


def migrate(con):
    for tbl, col, decl in MIGRATIONS:
        cols = [r[1] for r in con.execute('PRAGMA table_info(%s)' % tbl)]
        if col not in cols:
            con.execute('ALTER TABLE %s ADD COLUMN %s %s' % (tbl, col, decl))
            con.commit()
            print('迁移：%s 增加列 %s' % (tbl, col))
    # ask_usage 主键升级：对话与计费按「场次 + 题目」区分（老数据 session_id 记为空串）
    cols = [r[1] for r in con.execute('PRAGMA table_info(ask_usage)')]
    if 'session_id' not in cols:
        con.executescript('''
            ALTER TABLE ask_usage RENAME TO ask_usage_old;
            CREATE TABLE ask_usage(
              user_id INTEGER NOT NULL,
              session_id TEXT NOT NULL DEFAULT '',
              qid TEXT NOT NULL,
              model TEXT NOT NULL,
              cnt INTEGER DEFAULT 0,
              first_ts TEXT,
              last_ts TEXT,
              PRIMARY KEY(user_id, session_id, qid, model)
            );
            INSERT INTO ask_usage(user_id,session_id,qid,model,cnt,first_ts,last_ts)
              SELECT user_id,'',qid,model,cnt,first_ts,last_ts FROM ask_usage_old;
            DROP TABLE ask_usage_old;
        ''')
        con.commit()
        print('迁移：ask_usage 主键改为（用户, 场次, 题目, 模型）')
    # 保证至少有一个管理员：优先 liumos，否则最早注册的那个
    has_admin = con.execute('SELECT COUNT(*) FROM users WHERE is_admin=1').fetchone()[0]
    if not has_admin:
        r = con.execute("SELECT id FROM users WHERE username='liumos'").fetchone()
        if not r:
            r = con.execute('SELECT id FROM users ORDER BY id LIMIT 1').fetchone()
        if r:
            con.execute('UPDATE users SET is_admin=1 WHERE id=?', (r[0],))
            con.commit()
            print('已把用户 id=%d 设为管理员' % r[0])

def main():
    src = pick_src()
    if not os.path.exists(src):
        print('缺少 questions.json', file=sys.stderr)
        sys.exit(1)
    con = sqlite3.connect(DB)
    con.execute('DROP TABLE IF EXISTS attempts')    # 早期废弃表，清掉
    con.execute('DROP TABLE IF EXISTS ask_log')
    con.execute('DROP TABLE IF EXISTS questions')   # 题库为静态数据，每次重建（答题记录在账号里）
    con.executescript(SCHEMA)
    migrate(con)
    # 题库（科目）定义
    banks_path = f'{DATA}/banks.json'
    if os.path.exists(banks_path):
        for b in json.load(open(banks_path, encoding='utf-8')):
            con.execute('''INSERT OR REPLACE INTO banks
                (id,name,short,subtitle,ai_context,review_context,chapters_json,papers_json,
                 copyright_note,copyright,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                (b['id'], b['name'], b.get('short', ''), b.get('subtitle', ''),
                 b.get('ai_context', ''), b.get('review_context', ''),
                 json.dumps(b.get('chapters', []), ensure_ascii=False),
                 json.dumps(b.get('papers', []), ensure_ascii=False),
                 b.get('copyright_note', ''), b.get('copyright', ''), b.get('sort', 0)))
        con.commit()
        print('题库定义：', [r[0] for r in con.execute('SELECT id FROM banks')])
    # 题目图形（表格用 HTML、图形用 SVG，替代位图）
    fig_path = f'{DATA}/figures.json'
    if os.path.exists(fig_path):
        figs = json.load(open(fig_path, encoding='utf-8'))
        con.execute('DELETE FROM figures')
        for qid, v in figs.items():
            con.execute('INSERT OR REPLACE INTO figures(qid,kind,html) VALUES(?,?,?)',
                        (qid, v.get('kind', 'svg'), v['html']))
        con.commit()
        print('题目图形：', len(figs), '个（表格/矢量图）')
    qs = json.load(open(src, encoding='utf-8'))
    cur = con.cursor()
    n_new = n_upd = 0
    for q in qs:
        lo = q.get('lo') or ''
        chap = q.get('chapter')
        if not chap:
            digits = ''.join(c for c in lo if c.isdigit())
            chap = digits[0] if digits else ''
        cur.execute('''INSERT OR REPLACE INTO questions
            (id,bank_id,chapter,papers,no,is_extra,stem,options_json,answer_json,lo,k_level,pts,
             explain,kind,image,stem_hash,refs_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (
            q['id'], q.get('bank_id', 'ctfl'), chap, q['papers'], q['no'], q['is_extra'], q['stem'],
            json.dumps(q['options'], ensure_ascii=False),
            json.dumps(q['answer'], ensure_ascii=False),
            lo, q['k_level'], q['pts'], q['explain'],
            q['kind'], q['image'], q['stem_hash'],
            json.dumps(q.get('refs') or [q['id']], ensure_ascii=False)))
        n_new += 1
    con.commit()
    total = cur.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
    con.close()
    print(f'导入完成：新增 {n_new}，更新 {n_upd}，库内共 {total} 题')

if __name__ == '__main__':
    main()
