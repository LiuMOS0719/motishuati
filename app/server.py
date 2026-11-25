#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CTFL 刷题服务：题库 API + DeepSeek 答疑/整体评价。
答题记录与对话全部存在浏览器端（localStorage），服务端不落库答题数据。"""
import http.server, socketserver, json, os, sqlite3, urllib.request, urllib.error
import datetime, sys, hashlib, secrets, re, gzip, base64, time

DATA = os.environ.get('DATA_DIR', '/data')
DB = f'{DATA}/quiz.db'
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
PORT = int(os.environ.get('PORT', '8090'))
DEEPSEEK_KEY = os.environ.get('DEEPSEEK_API_KEY', '').strip()
DEEPSEEK_BASE = os.environ.get('DEEPSEEK_BASE', 'https://api.deepseek.com/v1').rstrip('/')
DEEPSEEK_MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
ZAI_KEY = os.environ.get('ZAI_API_KEY', '').strip()
GLM_BASE = os.environ.get('GLM_BASE', 'https://api.z.ai/api/paas/v4').rstrip('/')
GLM_MODEL = os.environ.get('GLM_MODEL', 'glm-4-flash-250414')
VLM_MODEL = os.environ.get('VLM_MODEL', 'glm-4v-flash')   # 读图用，免费
MAX_HISTORY = 8
LETTERS = 'ABCDEFGH'   # 选项字母表（CTFL 有 4 选项和 5 选项两种题）


def get_bank(bank_id='ctfl'):
    """取题库定义（名称、章节、卷、AI 背景、版权）"""
    con = db()
    r = con.execute('SELECT * FROM banks WHERE id=?', (bank_id,)).fetchone()
    con.close()
    if not r:
        return None
    d = dict(r)
    d['chapters'] = json.loads(d['chapters_json'] or '[]')
    d['papers'] = json.loads(d['papers_json'] or '[]')
    return d


def bank_of_question(qid):
    con = db()
    r = con.execute('SELECT bank_id FROM questions WHERE id=?', (qid,)).fetchone()
    con.close()
    return (r['bank_id'] if r and r['bank_id'] else 'ctfl')


def now():
    return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def db():
    con = sqlite3.connect(DB, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def load_questions(ids=None):
    """整库下发（含答案与解析）：判题在浏览器端完成，服务端不记录作答。
    ids 不为空时只返回这些题目（懒加载用）。"""
    con = db()
    if ids:
        marks = ','.join('?' * len(ids))
        rows = con.execute(
            f"SELECT * FROM questions WHERE id IN ({marks}) "
            f"ORDER BY substr(id,1,1), is_extra, CAST(substr(id, instr(id,'-')+1) AS INTEGER), id",
            list(ids)).fetchall()
    else:
        rows = con.execute(
            "SELECT * FROM questions ORDER BY substr(id,1,1), is_extra, "
            "CAST(substr(id, instr(id,'-')+1) AS INTEGER), id").fetchall()
    con.close()
    c2 = db()
    figs = {fr['qid']: {'kind': fr['kind'], 'html': fr['html']}
            for fr in c2.execute('SELECT qid,kind,html FROM figures')}
    c2.close()
    out = []
    for r in rows:
        out.append({
            'id': r['id'], 'papers': r['papers'], 'no': r['no'], 'is_extra': r['is_extra'],
            'stem': r['stem'], 'options': json.loads(r['options_json']),
            'answer': json.loads(r['answer_json']), 'explain': r['explain'],
            'lo': r['lo'], 'k_level': r['k_level'], 'pts': r['pts'],
            'kind': r['kind'], 'image': r['image'],
            'figure': figs.get(r['id']),
            'refs': json.loads(r['refs_json']) if r['refs_json'] else [r['id']],
        })
    return out


def load_index(bank_id=None):
    """首屏用的轻量索引：不含题干/选项/答案/解析，字段短、体积小"""
    con = db()
    sql = ("SELECT id,bank_id,chapter,papers,no,is_extra,lo,k_level,kind,image,refs_json FROM questions ")
    args = []
    if bank_id:
        sql += 'WHERE bank_id=? '
        args.append(bank_id)
    sql += ("ORDER BY substr(id,1,1), is_extra, CAST(substr(id, instr(id,'-')+1) AS INTEGER), id")
    rows = con.execute(sql, args).fetchall()
    con.close()
    return [{'id': r['id'], 'bank_id': r['bank_id'], 'chapter': r['chapter'],
             'papers': r['papers'], 'no': r['no'], 'is_extra': r['is_extra'],
             'lo': r['lo'], 'k_level': r['k_level'], 'kind': r['kind'], 'image': r['image'],
             'refs': json.loads(r['refs_json']) if r['refs_json'] else [r['id']]}
            for r in rows]


def get_question(qid):
    con = db()
    r = con.execute('SELECT * FROM questions WHERE id=?', (qid,)).fetchone()
    con.close()
    return r


# ---------------- 账号 ----------------
TOKEN_DAYS = 30


def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), bytes.fromhex(salt), 200000).hex()
    return h, salt


def create_token(user_id):
    tok = secrets.token_hex(24)
    exp = (datetime.datetime.now() + datetime.timedelta(days=TOKEN_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
    con = db()
    con.execute('INSERT INTO auth_tokens(token,user_id,created_at,expires_at) VALUES(?,?,?,?)',
                (tok, user_id, now(), exp))
    con.commit()
    con.close()
    return tok


def auth_of(handler):
    """返回 (user_id, username) 或 None"""
    tok = (handler.headers.get('X-Auth-Token') or '').strip()
    if not tok:
        return None
    con = db()
    r = con.execute('''SELECT u.id, u.username FROM auth_tokens t
                       JOIN users u ON u.id=t.user_id
                       WHERE t.token=? AND t.expires_at>?''', (tok, now())).fetchone()
    con.close()
    return (r['id'], r['username']) if r else None


def register(username, password):
    username = (username or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_\u4e00-\u9fa5]{2,20}', username):
        return {'ok': False, 'error': '用户名需 2-20 位，仅限中英文、数字、下划线'}
    if len(password or '') < 6:
        return {'ok': False, 'error': '密码至少 6 位'}
    h, salt = hash_pw(password)
    con = db()
    try:
        # 新账号从 0 次 DeepSeek 额度开始（GLM 不限次，DeepSeek 需管理员发放）
        con.execute('INSERT INTO users(username,pass_hash,salt,quota,created_at) VALUES(?,?,?,0,?)',
                    (username, h, salt, now()))
        con.commit()
        uid = con.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()['id']
    except sqlite3.IntegrityError:
        con.close()
        return {'ok': False, 'error': '用户名已被占用'}
    con.close()
    return {'ok': True, 'token': create_token(uid), 'username': username}


# ---------------- 登录限流（防撞库） ----------------
# 规则：首轮允许错 8 次 → 锁 60 秒；解锁后再错 3 次 → 锁 120 秒；
#       每再触发一次锁定，时长翻倍（60→120→240→…，封顶 1 小时）；登录成功即全部清零。
LOGIN_FIRST_MAX = 8        # 首轮允许的失败次数
LOGIN_RETRY_MAX = 3        # 进入锁定后，每轮允许的失败次数
LOGIN_BASE_LOCK = 60       # 首次锁定时长（秒）
LOGIN_MAX_LOCK = 3600      # 锁定时长上限
LOGIN_COUNT_WINDOW = 3600  # 失败计数的滑动窗口
LOGIN_STATE = {}           # key -> {'fails':[ts...], 'locks':n, 'until':ts}


def login_guard(key):
    st = LOGIN_STATE.get(key)
    if not st:
        return 0
    until = st.get('until', 0)
    return int(until - time.time()) if until > time.time() else 0


def login_limits(key):
    """返回 (本轮允许的失败次数, 已记录锁定次数)"""
    st = LOGIN_STATE.get(key) or {}
    locks = st.get('locks', 0)
    return (LOGIN_FIRST_MAX if locks == 0 else LOGIN_RETRY_MAX), locks


def login_fail(key):
    st = LOGIN_STATE.setdefault(key, {'fails': [], 'locks': 0, 'until': 0})
    now = time.time()
    # 已在锁定中：不累加计数（避免锁定期间继续请求把下一轮的次数吃掉）
    if st.get('until', 0) > now:
        return 0, int(st['until'] - now)
    st['fails'] = [t for t in st['fails'] if now - t < LOGIN_COUNT_WINDOW]
    st['fails'].append(now)
    limit = LOGIN_FIRST_MAX if st['locks'] == 0 else LOGIN_RETRY_MAX
    if len(st['fails']) >= limit:
        st['locks'] += 1
        dur = min(LOGIN_BASE_LOCK * (2 ** (st['locks'] - 1)), LOGIN_MAX_LOCK)
        st['until'] = now + dur
        st['fails'] = []
        return 0, dur
    return max(0, limit - len(st['fails'])), 0


def login_ok(key):
    LOGIN_STATE.pop(key, None)


def login(username, password):
    con = db()
    r = con.execute('SELECT * FROM users WHERE username=?', ((username or '').strip(),)).fetchone()
    if not r:
        con.close()
        return {'ok': False, 'error': '用户名或密码不对'}
    h, _ = hash_pw(password or '', r['salt'])
    if not secrets.compare_digest(h, r['pass_hash']):
        con.close()
        return {'ok': False, 'error': '用户名或密码不对'}
    con.execute('UPDATE users SET last_login=? WHERE id=?', (now(), r['id']))
    con.commit()
    con.close()
    return {'ok': True, 'token': create_token(r['id']), 'username': r['username']}


def load_state(user_id):
    con = db()
    r = con.execute('SELECT state_json, updated_at FROM user_state WHERE user_id=?', (user_id,)).fetchone()
    con.close()
    if not r:
        return {'sessions': [], 'chats': {}, 'current': None, 'updated_at': None}
    try:
        st = json.loads(r['state_json'])
    except Exception:
        st = {}
    st.setdefault('sessions', [])
    st.setdefault('chats', {})
    st.setdefault('current', None)
    st['updated_at'] = r['updated_at']
    return st


def save_state(user_id, state):
    con = db()
    con.execute('''INSERT INTO user_state(user_id,state_json,updated_at) VALUES(?,?,?)
                   ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json,
                   updated_at=excluded.updated_at''',
                (user_id, json.dumps({'sessions': state.get('sessions', []),
                                      'chats': state.get('chats', {}),
                                      'current': state.get('current')}, ensure_ascii=False), now()))
    con.commit()
    con.close()


def stats_from_state(raw):
    """从 state_json 里算做题场次 / 累计答题 / 答对"""
    sessions = answered = right = 0
    try:
        st = json.loads(raw) if raw else {}
    except Exception:
        st = {}
    for s in (st.get('sessions') or []):
        sessions += 1
        for it in (s.get('items') or []):
            answered += 1
            if it.get('correct'):
                right += 1
    return sessions, answered, right


def user_stats(uid):
    con = db()
    u = con.execute('SELECT username,is_admin,quota FROM users WHERE id=?', (uid,)).fetchone()
    st = con.execute('SELECT state_json FROM user_state WHERE user_id=?', (uid,)).fetchone()
    ds_used = con.execute("SELECT COUNT(*) c FROM ask_usage WHERE user_id=? AND model='deepseek'",
                          (uid,)).fetchone()['c']
    ag = con.execute('''SELECT COALESCE(MAX(cnt),0) mx, COALESCE(SUM(cnt),0) sm,
                               COUNT(*) qs FROM ask_usage WHERE user_id=?''', (uid,)).fetchone()
    mxrow = con.execute('''SELECT qid, cnt FROM ask_usage WHERE user_id=?
                           ORDER BY cnt DESC, last_ts DESC LIMIT 1''', (uid,)).fetchone()
    top = con.execute('''SELECT qid, cnt, model FROM ask_usage WHERE user_id=?
                         ORDER BY cnt DESC, last_ts DESC LIMIT 5''', (uid,)).fetchall()
    con.close()
    sessions, answered, right = stats_from_state(st['state_json'] if st else '')
    return {
        'username': u['username'], 'is_admin': u['is_admin'], 'quota': u['quota'],
        'sessions': sessions, 'answered': answered, 'right': right,
        'wrong': answered - right,
        'accuracy': round(right / answered * 100, 1) if answered else 0,
        'ai_deepseek_questions': ds_used,        # 已用掉的 deepseek 额度（按题计）
        'ai_ask_total': ag['sm'],                # 总提问次数（含追问）
        'ai_max_per_question': mxrow['cnt'] if mxrow else 0,   # 同一题最多问了多少次
        'ai_max_qid': mxrow['qid'] if mxrow else '',
        'ai_questions': ag['qs'],                 # 问过的不同题数
        'ai_top': [{'qid': t['qid'], 'cnt': t['cnt'], 'model': t['model']} for t in top],
    }


def leaderboard(sort='accuracy'):
    con = db()
    users = con.execute('SELECT id, username, is_admin, quota, created_at FROM users').fetchall()
    rows = []
    for u in users:
        st = con.execute('SELECT state_json FROM user_state WHERE user_id=?', (u['id'],)).fetchone()
        sessions, answered, right = stats_from_state(st['state_json'] if st else '')
        ag = con.execute('''SELECT COALESCE(SUM(cnt),0) sm, COALESCE(MAX(cnt),0) mx
                            FROM ask_usage WHERE user_id=?''', (u['id'],)).fetchone()
        rows.append({'username': u['username'], 'is_admin': u['is_admin'], 'quota': u['quota'],
                     'sessions': sessions, 'answered': answered, 'right': right,
                     'accuracy': round(right / answered * 100, 1) if answered else 0,
                     'ai_ask_total': ag['sm'], 'ai_max_per_question': ag['mx']})
    con.close()
    if sort == 'count':
        rows.sort(key=lambda r: (-r['answered'], -r['accuracy']))
    elif sort == 'sessions':
        rows.sort(key=lambda r: (-r['sessions'], -r['answered']))
    else:
        rows.sort(key=lambda r: (-r['accuracy'], -r['answered']))
    return rows


def chapter_of(lo):
    m = ''.join(c for c in (lo or '') if c.isdigit())
    return m[0] if m else '?'


def chapter_name(bank, key):
    for c in (bank or {}).get('chapters', []):
        if str(c.get('key')) == str(key):
            return c.get('full') or c.get('name') or ''
    return ''


# ---------------- 图片题：让 AI 也看到图 ----------------
VLM_PROMPT = """这是一道认证考试题的配图（可能是判定表、状态转移图、柱状图、矩阵等）。
请用中文把图里的**信息完整、准确地**转写出来，供另一个人在不看图的情况下答题：

- 如果是表格/判定表/矩阵：**用 markdown 表格完整还原**，包含表头行和第一列，一个单元格都不能漏。
  空单元格写「-」，打勾/打叉/标记的格子写「X」或「T/F」原样照抄。
  表格上方或下方的说明文字也要照抄。
- 如果是状态图/流程图：列出每个状态/节点，以及每条连线的「起点 → 终点（触发条件/标注）」。
- 如果是柱状图/折线图：写出标题、纵轴刻度、横轴各项，以及每项的具体数值。

只输出转写内容，不要评价、不要总结成结论。字数上限 800 字。"""


def figure_text(qid):
    """把 HTML 表格还原成文字给 AI 用（比位图转写更精确）；SVG 图形返回空，走视觉描述"""
    con = db()
    r = con.execute('SELECT kind, html FROM figures WHERE qid=?', (qid,)).fetchone()
    con.close()
    if not r or r['kind'] != 'table':
        return ''
    rows = re.findall(r'<tr>(.*?)</tr>', r['html'], re.S)
    lines = []
    for tr in rows:
        cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        if any(cells):
            lines.append(' | '.join(cells))
    if not lines:
        return ''
    return ('本题配图是一张表格（按行列出，单元格为空表示无标记/不适用）：\n' + '\n'.join(lines))


def get_image_desc(qid):
    con = db()
    r = con.execute('SELECT desc_text FROM image_desc WHERE qid=?', (qid,)).fetchone()
    con.close()
    return r['desc_text'] if r else None


def save_image_desc(qid, text):
    con = db()
    con.execute('INSERT OR REPLACE INTO image_desc(qid,desc_text,model,created_at) VALUES(?,?,?,?)',
                (qid, text, VLM_MODEL, now()))
    con.commit()
    con.close()


DS_BALANCE_CACHE = {'ts': 0, 'data': None}


def deepseek_balance():
    """查询 DeepSeek 账户余额（人民币），结果缓存 5 分钟"""
    now = time.time()
    if DS_BALANCE_CACHE['data'] and now - DS_BALANCE_CACHE['ts'] < 300:
        return DS_BALANCE_CACHE['data']
    if not DEEPSEEK_KEY:
        return {'ok': False, 'error': '未配置 DEEPSEEK_API_KEY'}
    try:
        req = urllib.request.Request('https://api.deepseek.com/user/balance',
                                     headers={'Authorization': 'Bearer ' + DEEPSEEK_KEY,
                                              'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            d = json.loads(resp.read())
        infos = d.get('balance_infos') or []
        main = infos[0] if infos else {}
        out = {'ok': True,
               'available': bool(d.get('is_available')),
               'currency': main.get('currency', 'CNY'),
               'total': main.get('total_balance', '0'),
               'granted': main.get('granted_balance', '0'),
               'topped_up': main.get('topped_up_balance', '0'),
               'fetched_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
        DS_BALANCE_CACHE.update(ts=now, data=out)
        return out
    except Exception as e:
        sys.stderr.write('deepseek_balance failed: %s\n' % e)
        return {'ok': False, 'error': str(e)[:120]}


def describe_image(image_file):
    """调视觉模型把配图转成文字，结果按题目缓存，只算一次。
    先用准确度更高的模型，失败再退回免费的小模型。"""
    if not ZAI_KEY or not image_file:
        return ''
    path = os.path.join(DATA, 'img', os.path.basename(image_file))
    if not os.path.exists(path):
        return ''
    for model in (VLM_MODEL, 'glm-4v-flash'):
        try:
            b64 = base64.b64encode(open(path, 'rb').read()).decode()
            ext = os.path.splitext(path)[1].lower().lstrip('.') or 'png'
            mime = 'image/webp' if ext == 'webp' else ('image/jpeg' if ext in ('jpg', 'jpeg') else 'image/png')
            payload = {'model': model, 'temperature': 0.1, 'max_tokens': 700,
                       'messages': [{'role': 'user', 'content': [
                           {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}'}},
                           {'type': 'text', 'text': VLM_PROMPT}]}]}
            req = urllib.request.Request(f'{GLM_BASE}/chat/completions',
                                         data=json.dumps(payload).encode(),
                                         headers={'Authorization': 'Bearer ' + ZAI_KEY,
                                                  'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                d = json.loads(resp.read())
                out = (d['choices'][0]['message'].get('content') or '').strip()
                if len(out) > 20:
                    return out
        except Exception as e:
            sys.stderr.write('describe_image(%s) failed: %s\n' % (model, e))
    return ''


def remap_letters(text, perm):
    """把解析里引用的原始选项字母换成乱序后的新字母，并按新字母顺序重排各段
    （原始解析是 a) b) c) d) 顺序写的，重映射后顺序会乱，按新字母排回来）"""
    if not text:
        return ''
    if not perm or len(perm) < 2:
        return text
    old_to_new = {p: LETTERS[i] for i, p in enumerate(perm) if i < len(LETTERS)}
    def rep(m):
        ch = m.group(1)
        nk = old_to_new.get(ch.upper())
        if not nk:
            return m.group(0)
        return (nk if ch.isupper() else nk.lower()) + ')'
    s = re.sub(r'\b([A-Ha-h])\)', rep, text)
    s = re.sub(r'选项\s*([A-H])', lambda m: '选项 ' + old_to_new.get(m.group(1), m.group(1)), s)
    return reorder_blocks(s)


def reorder_blocks(s):
    """把 'x) 内容' 形式的段落按字母顺序重排；不成段落的原文保持不动"""
    marks = list(re.finditer(r'(?:^|\s)([a-h])\)\s*', s))
    if len(marks) < 2:
        return s
    head = s[:marks[0].start()].strip()
    blocks = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(s)
        blocks.append((m.group(1), s[m.start():end].strip()))
    blocks.sort(key=lambda b: b[0])
    body = '\n'.join(b[1] for b in blocks)
    return (head + '\n' if head else '') + body


def build_ask_messages(qid, question, answered, history, perm=None):
    r = get_question(qid)
    bid = bank_of_question(qid) if r else 'ctfl'
    bank = get_bank(bid) or {}
    base_ctx = bank.get('ai_context') or ''
    if not r:
        return [{'role': 'system', 'content': base_ctx},
                {'role': 'user', 'content': question}]
    opts = json.loads(r['options_json'])
    answer = json.loads(r['answer_json'])
    explain = r['explain'] or '（无）'
    shuffled = False
    if perm and len(perm) >= 2:
        omap = {o['k']: o['t'] for o in opts}
        order = [p for p in perm if p in omap]
        if len(order) == len(opts):     # 必须完整覆盖全部选项才重排，避免丢项
            opts = [{'k': LETTERS[i], 't': omap[p]} for i, p in enumerate(order)]
            answer = sorted(LETTERS[order.index(k)] for k in answer if k in order)
            explain = remap_letters(explain, order)
            shuffled = True
    chap = r['chapter'] or chapter_of(r['lo'])
    parts = [
        f"【考生正在做的模拟题】题库 {bank.get('name', '')}，卷别 {r['papers']}，题号 {r['no']}，题型"
        f"{'多选（正确答案 %d 个）' % len(answer) if len(answer) > 1 else '单选'}，"
        f"大纲条目 {r['lo']}（{chapter_name(bank, chap) or ('第 %s 章' % chap)}），认知层级 {r['k_level']}。",
        "题干：" + r['stem'],
        "选项：" + ' '.join(f"{o['k']} {o['t']}" for o in opts),
    ]
    # 带配图的题：表格用精确数据，图形用视觉模型转写，让纯文本模型也能"看到"图
    if r['image']:
        desc = figure_text(qid)
        if not desc:
            desc = get_image_desc(qid) or ''
            if not desc:
                desc = describe_image(r['image'])
                if desc:
                    save_image_desc(qid, desc)
        if desc:
            parts.append("【本题配图内容（供你参考）】\n" + desc)
        else:
            parts.append("【本题有一张配图，但暂时没能读出内容；若学生的问题依赖图，请说明需要看图。】")
    if shuffled:
        parts.append("（注意：考生看到的是重新打乱过的选项顺序，上面这份就是打乱后的编号，请务必按这份字母作答。）")
    if answered:
        cur_map = {o['k']: o['t'] for o in opts}
        ans_txt = '、'.join(answer)
        ans_content = '；'.join(f"{a} = {cur_map.get(a, '')}" for a in answer)
        parts.append(f"考生已作答，官方正确答案：{ans_txt}（即 {ans_content}）")
        parts.append("官方解析：" + explain)
        parts.append("【重要】本题的官方正确答案已确定为 " + ans_txt + "（" + ans_content
                     + "），你的一切解释都必须与之一致，绝对不要给出与之矛盾的结论。")
    else:
        parts.append("考生尚未作答，不要直接给出正确答案，用引导式提示帮他思考。")
    msgs = [{'role': 'system', 'content': base_ctx + "\n" + '\n'.join(parts)}]
    for h in (history or [])[-MAX_HISTORY:]:
        role = 'assistant' if h.get('role') == 'ai' else 'user'
        txt = (h.get('content') or '').strip()
        if txt:
            msgs.append({'role': role, 'content': txt[:1500]})
    msgs.append({'role': 'user', 'content': question})
    return msgs


def build_review_messages(payload):
    stats = payload.get('stats') or {}
    wrong_ids = payload.get('wrong') or []
    bid = payload.get('bank') or 'ctfl'
    bank = get_bank(bid) or {}
    base_ctx = bank.get('review_context') or ''
    total = stats.get('total', 0)
    answered = stats.get('answered', 0)
    right = stats.get('right', 0)
    lines = [f"【总体情况】题库「{bank.get('name', '')}」共 {total} 题，考生已做 {answered} 题，答对 {right} 题，"
             f"答错 {answered - right} 题，正确率 "
             f"{(right / answered * 100):.1f}%（{answered} 题基数）。" if answered else
             "【总体情况】考生还没有作答任何题目。"]
    # 章节统计
    con = db()
    ch_total, ch_wrong = {}, {}
    for r in con.execute('SELECT chapter FROM questions WHERE bank_id=?', (bid,)):
        c = r['chapter'] or '?'
        ch_total[c] = ch_total.get(c, 0) + 1
    details = []
    for qid in wrong_ids[:60]:
        r = con.execute('SELECT * FROM questions WHERE id=?', (qid,)).fetchone()
        if not r:
            continue
        c = r['chapter'] or chapter_of(r['lo'])
        ch_wrong[c] = ch_wrong.get(c, 0) + 1
        chosen = (payload.get('chosen') or {}).get(qid) or []
        stem = r['stem'].replace('\n', ' ')[:60]
        details.append(f"- {r['papers']}-{r['no']}｜{r['lo']}｜{r['k_level']}｜错选 {'、'.join(chosen) or '?'}"
                       f"｜正解 {'、'.join(json.loads(r['answer_json']))}｜{stem}")
    con.close()
    if ch_wrong:
        dist = '；'.join(f"{chapter_name(bank, c) or ('第'+c+'章')}（{ch_wrong[c]} 错 / 共 {ch_total.get(c, 0)} 题）"
                        for c in sorted(ch_wrong, key=lambda x: -(ch_wrong[x] / max(ch_total.get(x, 1), 1))))
        lines.append("【错题章节分布】" + dist)
    if details:
        lines.append("【错题清单】\n" + '\n'.join(details))
    else:
        lines.append("【错题清单】无（全部答对或尚未作答）")
    user = '\n'.join(lines) + "\n\n请按前置要求给出整体评价与复习建议。"
    msgs = [{'role': 'system', 'content': base_ctx},
            {'role': 'user', 'content': user}]
    for h in (payload.get('history') or [])[-MAX_HISTORY:]:
        role = 'assistant' if h.get('role') == 'ai' else 'user'
        txt = (h.get('content') or '').strip()
        if txt:
            msgs.append({'role': role, 'content': txt[:1500]})
    return msgs


REL_CHECK_PROMPT = """你是一个宽松的内容审核器，判断学生的问题是否与给定的这道考题有关。

默认判 RELATED。只有在问题**完全**与这道题无关时才判 UNRELATED。

【几乎总是 RELATED】问题干含义、选项区别、为什么某个选项错/对、考点概念、记忆方法、举例、相关知识点（哪怕只是沾边，比如"敏捷和 Scrum 的区别"）、让我翻译或解释这道题、问考试怎么考。
【才判 UNRELATED】闲聊（天气、时间、你是谁）、要求代写代码或文章、其它学科的具体题目、广告或推荐网站。

拿不准时一律判 RELATED。
只输出一行：
RELATED
或
UNRELATED|不超过 20 字的理由
"""

# 明确与题目相关的提问特征：命中就直接放行，不调模型（省延迟、不误杀）
REL_WHITELIST = re.compile(
    r'题|选项|答案|考点|解析|知识|概念|例子|举例|场景|区别|记忆|怎么记|为什么|错在|'
    r'正确|大纲|章节|翻译|K[123]|多选|单选|考什么|怎么考|考不考|背诵|理解|'
    r'图|表|矩阵|判定|状态|坐标|柱状|流程|示意|画')
# 明确无关的强特征：命中直接拦，不调模型
REL_BLACKLIST = re.compile(
    r'天气|气温|几点|现在时间|今天几号|你是谁|你叫什么|写代码|写段代码|写个代码|帮我写|'
    r'写一段|作文|情书|讲个笑话|唱歌|推荐.*网站|彩票|股票|新闻|'
    r'你是(什么|哪个)模型|谁开发的')


def check_relevance(qid, question, history):
    """判断提问是否与本题相关。三级策略：
    1) 命中强无关特征 → 直接拦（多半是闲聊/代写）
    2) 命中题目相关特征 → 直接放行（举例子、记忆技巧、概念区别都算相关）
    3) 都不沾 → 交给免费模型判断，且倾向放行。
    模型调用失败一律放行，避免误伤。"""
    q = (question or '').strip()
    if not q:
        return True, ''
    if REL_BLACKLIST.search(q):
        return False, '像闲聊或与刷题无关'
    if REL_WHITELIST.search(q):
        return True, ''
    r = get_question(qid)
    ctx = '（无题目上下文）'
    if r:
        opts = json.loads(r['options_json'])
        ctx = '题干：' + (r['stem'] or '')[:400] + '\n选项：' + ' '.join(
            f"{o['k']} {o['t'][:40]}" for o in opts)
    hist = ''
    for h in (history or [])[-2:]:
        who = '学生' if h.get('role') == 'me' else '老师'
        hist += f"{who}：{(h.get('content') or '')[:200]}\n"
    msgs = [{'role': 'system', 'content': REL_CHECK_PROMPT},
            {'role': 'user', 'content':
             f"【题目】\n{ctx}\n\n【最近对话】\n{hist or '（无）'}\n\n【学生这次的问题】\n{q}"}]
    res = call_ai('glm', msgs, max_tokens=60)
    if not res.get('ok'):
        return True, ''
    txt = (res.get('answer') or '').strip()
    up = txt.upper()
    if up.startswith('UNRELATED'):
        reason = txt.split('|', 1)[1].strip() if '|' in txt else ''
        return False, reason[:60]
    return True, ''


def call_ai(model, messages, max_tokens=900):
    """model: 'deepseek' | 'glm'"""
    if model == 'glm':
        if not ZAI_KEY:
            return {'ok': False, 'error': '未配置 ZAI_API_KEY'}
        url = f'{GLM_BASE}/chat/completions'
        payload = {'model': GLM_MODEL, 'messages': messages, 'temperature': 0.3,
                   'max_tokens': max_tokens, 'stream': False,
                   'thinking': {'type': 'disabled'}}
        key = ZAI_KEY
    else:
        if not DEEPSEEK_KEY:
            return {'ok': False, 'error': '未配置 DEEPSEEK_API_KEY'}
        url = f'{DEEPSEEK_BASE}/chat/completions'
        payload = {'model': DEEPSEEK_MODEL, 'messages': messages, 'temperature': 0.3,
                   'max_tokens': max_tokens, 'stream': False}
        key = DEEPSEEK_KEY
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            d = json.loads(resp.read().decode('utf-8'))
        text = (d['choices'][0]['message'].get('content') or '').strip()
        usage = d.get('usage') or {}
        if not text:
            return {'ok': False, 'error': 'AI 这次没返回内容，请再问一次', 'detail': 'empty content'}
        return {'ok': True, 'answer': text,
                'prompt_tokens': usage.get('prompt_tokens', 0),
                'completion_tokens': usage.get('completion_tokens', 0)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'ignore')[:400]
        # 上游原始报错不直接给用户看，按状态码翻译成能行动的提示
        if e.code == 429:
            msg = 'AI 服务正在限流，等几秒再问一次'
        elif e.code in (401, 403):
            msg = 'AI 服务鉴权失败，请让管理员检查 API Key'
        elif e.code == 402:
            msg = 'AI 额度已用完，请联系管理员充值或换模型'
        elif e.code in (400, 404):
            msg = 'AI 请求被拒绝（模型名或参数不对），请联系管理员'
        elif e.code >= 500:
            msg = 'AI 服务暂时不可用，稍后再试'
        else:
            msg = 'AI 请求失败，稍后再试'
        sys.stderr.write('[call_ai %s] HTTP %s: %s\n' % (model, e.code, raw))
        return {'ok': False, 'error': msg, 'detail': 'HTTP %s' % e.code}
    except urllib.error.URLError as e:
        sys.stderr.write('[call_ai %s] URLError: %s\n' % (model, e))
        reason = str(getattr(e, 'reason', e))
        if 'timed out' in reason.lower() or 'timeout' in reason.lower():
            msg = '连接 AI 服务超时，检查网络后再试'
        else:
            msg = '连不上 AI 服务，检查网络后再试'
        return {'ok': False, 'error': msg, 'detail': reason[:120]}
    except (TimeoutError, OSError) as e:
        sys.stderr.write('[call_ai %s] %s: %s\n' % (model, type(e).__name__, e))
        return {'ok': False, 'error': '连接 AI 服务超时，检查网络后再试', 'detail': str(e)[:120]}
    except (ValueError, KeyError, IndexError) as e:
        sys.stderr.write('[call_ai %s] bad response: %s: %s\n' % (model, type(e).__name__, e))
        return {'ok': False, 'error': 'AI 返回的格式看不懂，请重试', 'detail': str(e)[:120]}


def call_deepseek(messages, max_tokens=1200):
    return call_ai('deepseek', messages, max_tokens)


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (now(), fmt % args))

    def _client_ip(self):
        """取真实来源 IP。只有直连方是本机/内网（自己的 nginx）时才采信转发头，
        避免公网客户端伪造 X-Real-IP 绕过登录失败计数。
        X-Real-IP 应由 nginx 用 $remote_addr 覆盖写入；XFF 取最后一跳（nginx 追加的那段）。"""
        ip = self.client_address[0]
        private = (ip in ('127.0.0.1', '::1')
                   or ip.startswith('10.') or ip.startswith('192.168.')
                   or ip.startswith('172.') or ip.startswith('::ffff:127.'))
        if private:
            real = (self.headers.get('X-Real-IP') or '').strip()
            if real:
                return real
            xff = (self.headers.get('X-Forwarded-For') or '').strip()
            if xff:
                return xff.split(',')[-1].strip()
        return ip

    def _send(self, code, body, ctype='application/json; charset=utf-8',
              cache='no-store', use_etag=True):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode('utf-8') if isinstance(body, str) else body
        tag = '"%s"' % hashlib.md5(data).hexdigest()[:16]
        if use_etag and self.headers.get('If-None-Match') == tag:
            self.send_response(304)
            self.send_header('ETag', tag)
            self.send_header('Cache-Control', cache)
            self.send_header('X-Robots-Tag', 'noindex, nofollow, noarchive')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        use_gz = len(data) > 800 and 'gzip' in (self.headers.get('Accept-Encoding') or '')
        if use_gz:
            data = gzip.compress(data, 6)
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        if use_gz:
            self.send_header('Content-Encoding', 'gzip')
        if use_etag:
            self.send_header('ETag', tag)
        self.send_header('Cache-Control', cache)
        self.send_header('X-Robots-Tag', 'noindex, nofollow, noarchive')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        self.wfile.write(data)

    def _is_admin(self, uid):
        con = db()
        r = con.execute('SELECT is_admin FROM users WHERE id=?', (uid,)).fetchone()
        con.close()
        return bool(r and r['is_admin'])

    def _json_body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return {}

    def do_PUT(self):
        path = self.path.split('?')[0]
        if path == '/api/state':
            u = auth_of(self)
            if not u:
                self._send(401, {'error': '未登录'})
                return
            body = self._json_body()
            save_state(u[0], body)
            self._send(200, {'ok': True})
            return
        self._send(404, 'not found', 'text/plain')

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/robots.txt':
            body = ('User-agent: *\n'
                    'Disallow: /\n'
                    '\n'
                    '# 本站为个人备考自用，题目来自 ISTQB/CSTQB 官方模拟卷，仅供个人学习，不对外开放抓取\n')
            self._send(200, body, 'text/plain; charset=utf-8',
                       cache='public, max-age=86400', use_etag=False)
            return
        if path in ('/', '/index.html'):
            self._send(200, open(os.path.join(STATIC, 'index.html'), 'rb').read(),
                       'text/html; charset=utf-8',
                       cache='max-age=20, stale-while-revalidate=120')
            return
        if path == '/favicon.ico' or path.startswith('/favicon-') or path.startswith('/icon-'):
            fn = os.path.join(STATIC, 'img', os.path.basename(path))
            if os.path.isfile(fn):
                ctype = 'image/x-icon' if fn.endswith('.ico') else 'image/png'
                self._send(200, open(fn, 'rb').read(), ctype, cache='public, max-age=86400')
            else:
                self._send(404, 'not found', 'text/plain')
            return
        if path.startswith('/js/') or path.startswith('/css/'):
            rel = os.path.normpath(path.lstrip('/'))
            fn = os.path.join(STATIC, rel)
            if rel.startswith('..') or not os.path.isfile(fn):
                self._send(404, 'not found', 'text/plain')
                return
            ctype = ('application/javascript; charset=utf-8' if fn.endswith('.js')
                     else 'text/css; charset=utf-8')
            self._send(200, open(fn, 'rb').read(), ctype, cache='public, max-age=3600')
            return
        if path.startswith('/img/'):
            fn = os.path.join(DATA, 'img', os.path.basename(path))
            if os.path.exists(fn):
                ext = os.path.splitext(fn)[1].lower()
                ctype = {'.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
                         '.svg': 'image/svg+xml'}.get(ext, 'application/octet-stream')
                self._send(200, open(fn, 'rb').read(), ctype,
                           cache='public, max-age=2592000, immutable')
            else:
                self._send(404, 'not found', 'text/plain')
            return
        if path == '/api/banks':
            con = db()
            rows = con.execute('SELECT * FROM banks ORDER BY sort, id').fetchall()
            con.close()
            out = []
            for r in rows:
                out.append({'id': r['id'], 'name': r['name'], 'short': r['short'],
                            'subtitle': r['subtitle'],
                            'chapters': json.loads(r['chapters_json'] or '[]'),
                            'papers': json.loads(r['papers_json'] or '[]'),
                            'copyright_note': r['copyright_note'],
                            'copyright': r['copyright']})
            self._send(200, out, cache='private, max-age=0, must-revalidate')
            return
        if path == '/api/index':
            if not auth_of(self):
                self._send(401, {'error': '未登录'})
                return
            bid = None
            if '?' in self.path:
                for kv in self.path.split('?', 1)[1].split('&'):
                    if kv.startswith('bank='):
                        bid = kv[5:]
            self._send(200, load_index(bid), cache='private, max-age=0, must-revalidate')
            return
        if path == '/api/questions':
            if not auth_of(self):
                self._send(401, {'error': '未登录'})
                return
            qs_part = ''
            if '?' in self.path:
                for kv in self.path.split('?', 1)[1].split('&'):
                    if kv.startswith('ids='):
                        qs_part = kv[4:]
            ids = [x for x in qs_part.split(',') if x] if qs_part else None
            cache = 'private, max-age=86400' if ids else 'private, max-age=0, must-revalidate'
            self._send(200, load_questions(ids[:200] if ids else None), cache=cache)
            return
        if path == '/api/me':
            u = auth_of(self)
            if not u:
                self._send(200, {'ok': False})
                return
            con = db()
            r = con.execute('SELECT is_admin, quota FROM users WHERE id=?', (u[0],)).fetchone()
            con.close()
            self._send(200, {'ok': True, 'username': u[1],
                             'is_admin': bool(r['is_admin']) if r else False,
                             'quota': r['quota'] if r else 0})
            return
        if path == '/api/user/stats':
            u = auth_of(self)
            if not u:
                self._send(401, {'error': '未登录'})
                return
            st = user_stats(u[0])
            st['ok'] = True
            self._send(200, st)
            return
        if path == '/api/leaderboard':
            u = auth_of(self)
            if not u:
                self._send(401, {'error': '未登录'})
                return
            sort = 'accuracy'
            if 'sort=count' in self.path:
                sort = 'count'
            elif 'sort=sessions' in self.path:
                sort = 'sessions'
            self._send(200, {'ok': True, 'sort': sort, 'rows': leaderboard(sort)})
            return
        if path == '/api/admin/deepseek-balance':
            u = auth_of(self)
            if not u or not self._is_admin(u[0]):
                self._send(403, {'error': '仅管理员可查'})
                return
            self._send(200, deepseek_balance())
            return
        if path == '/api/admin/users':
            u = auth_of(self)
            if not u or not self._is_admin(u[0]):
                self._send(403, {'error': '仅管理员'})
                return
            con = db()
            users = con.execute('SELECT id FROM users ORDER BY id').fetchall()
            con.close()
            rows = []
            for r in users:
                st = user_stats(r['id'])
                st['id'] = r['id']
                rows.append(st)
            self._send(200, {'ok': True, 'rows': rows})
            return
        if path == '/api/state':
            u = auth_of(self)
            if not u:
                self._send(401, {'error': '未登录'})
                return
            st = load_state(u[0])
            st['ok'] = True
            st['username'] = u[1]
            self._send(200, st)
            return
        if path == '/api/feedback':
            con = db()
            rows = con.execute('''SELECT id,qid,paper,no,kind,note,created_at,status
                                  FROM feedback ORDER BY id DESC LIMIT 200''').fetchall()
            con.close()
            self._send(200, [dict(r) for r in rows])
            return
        if path == '/api/health':
            con = db()
            n = con.execute('SELECT COUNT(*) c FROM questions').fetchone()['c']
            con.close()
            self._send(200, {'ok': True, 'ai': bool(DEEPSEEK_KEY), 'questions': n,
                             'model': DEEPSEEK_MODEL})
            return
        self._send(404, 'not found', 'text/plain')

    def do_POST(self):
        path = self.path.split('?')[0]
        body = self._json_body()
        if path == '/api/feedback/status':
            u = auth_of(self)
            if not u or not self._is_admin(u[0]):
                self._send(403, {'error': '仅管理员可操作'})
                return
            st = str(body.get('status') or '')
            if st not in ('open', 'fixed', 'ignored'):
                self._send(400, {'error': '状态不合法'})
                return
            con = db()
            con.execute('UPDATE feedback SET status=? WHERE id=?', (st, body.get('id')))
            con.commit()
            con.close()
            self._send(200, {'ok': True, 'status': st})
            return
        if path == '/api/register':
            self._send(200, register(body.get('username'), body.get('password')))
            return
        if path == '/api/login':
            uname = (body.get('username') or '').strip()
            gkey = f"{self._client_ip()}|{uname.lower()}"
            left = login_guard(gkey)
            if left:
                self._send(429, {'error': f'尝试次数过多，请 {left} 秒后再试', 'locked_for': left})
                return
            res = login(body.get('username'), body.get('password'))
            if res.get('ok'):
                login_ok(gkey)
            else:
                remain, locked = login_fail(gkey)
                sys.stderr.write('[login] 密码错误 user=%s ip=%s %s\n'
                                 % (uname, gkey.split('|')[0],
                                    ('锁定 %d 秒' % locked) if locked else ('剩余 %d 次' % remain)))
                if locked:
                    res['locked_for'] = locked
                    res['error'] = f'密码错误次数过多，已锁定 {locked} 秒'
                else:
                    res['tries_left'] = remain
            self._send(200, res)
            return
        if path == '/api/logout':
            tok = (self.headers.get('X-Auth-Token') or '').strip()
            if tok:
                con = db()
                con.execute('DELETE FROM auth_tokens WHERE token=?', (tok,))
                con.commit()
                con.close()
            self._send(200, {'ok': True})
            return
        if path == '/api/ask':
            u = auth_of(self)
            if not u:
                self._send(401, {'error': '请先登录'})
                return
            uid = u[0]
            qid = body.get('qid', '')
            question = (body.get('question') or '').strip()
            if not question:
                self._send(400, {'error': '问题为空'})
                return
            model = 'deepseek' if str(body.get('model') or '').lower() == 'deepseek' else 'glm'
            # 场次 id：同一场练习的同一题共用一个对话，追问不另计费；换场次重新计次
            sid = str(body.get('session_id') or '').strip()[:64]
            # 先用免费模型（GLM）判断提问是否与本题相关，不消耗 deepseek 额度
            ok_rel, rel_reason = check_relevance(qid, question, body.get('history'))
            if not ok_rel:
                self._send(200, {'ok': False, 'blocked': True, 'reason': rel_reason,
                                 'model': 'glm',
                                 'message': '这个问题和当前这道题无关，AI 不回答'})
                return
            con = db()
            row = con.execute('SELECT cnt FROM ask_usage WHERE user_id=? AND session_id=? AND qid=? AND model=?',
                              (uid, sid, qid, 'deepseek')).fetchone()
            first_time = row is None
            urow = con.execute('SELECT quota FROM users WHERE id=?', (uid,)).fetchone()
            con.close()
            if model == 'deepseek' and first_time and (urow['quota'] or 0) <= 0:
                self._send(402, {'error': 'deepseek 次数已用完：可切到 GLM（不限次），或让管理员加次数',
                                 'quota': 0})
                return
            msgs = build_ask_messages(qid, question, bool(body.get('answered')),
                                      body.get('history'), body.get('perm'))
            res = call_ai(model, msgs, max_tokens=900)
            quota = urow['quota'] if urow else 0
            charged = False
            if res.get('ok'):
                con = db()
                if model == 'deepseek' and first_time:
                    con.execute('UPDATE users SET quota=quota-1 WHERE id=?', (uid,))
                    charged = True
                con.execute('''INSERT INTO ask_usage(user_id,session_id,qid,model,cnt,first_ts,last_ts)
                               VALUES(?,?,?,?,1,?,?)
                               ON CONFLICT(user_id,session_id,qid,model) DO UPDATE
                               SET cnt=cnt+1, last_ts=excluded.last_ts''',
                            (uid, sid, qid, model, now(), now()))
                con.commit()
                q2 = con.execute('SELECT quota FROM users WHERE id=?', (uid,)).fetchone()
                con.close()
                quota = q2['quota'] if q2 else quota
            res['model'] = model
            res['quota'] = quota
            res['charged'] = charged
            self._send(200 if res.get('ok') else 502, res)
            return
        if path == '/api/admin/quota':
            u = auth_of(self)
            if not u or not self._is_admin(u[0]):
                self._send(403, {'error': '仅管理员'})
                return
            name = (body.get('username') or '').strip()
            try:
                delta = int(body.get('delta') or 0)
            except Exception:
                delta = 0
            if not name or delta == 0:
                self._send(400, {'error': '参数不对'})
                return
            con = db()
            r = con.execute('SELECT id, quota FROM users WHERE username=?', (name,)).fetchone()
            if not r:
                con.close()
                self._send(404, {'error': '用户不存在'})
                return
            newq = max(0, (r['quota'] or 0) + delta)
            con.execute('UPDATE users SET quota=? WHERE id=?', (newq, r['id']))
            con.commit()
            con.close()
            self._send(200, {'ok': True, 'username': name, 'quota': newq})
            return
        if path == '/api/feedback':
            qid = (body.get('qid') or '').strip()
            if not qid:
                self._send(400, {'error': '缺少题目编号'})
                return
            r = get_question(qid)
            con = db()
            con.execute('''INSERT INTO feedback(qid,paper,no,kind,note,created_at,status)
                           VALUES(?,?,?,?,?,?,'open')''',
                        (qid, r['papers'] if r else '', r['no'] if r else '',
                         (body.get('kind') or '').strip()[:40],
                         (body.get('note') or '').strip()[:1000], now()))
            con.commit()
            con.close()
            self._send(200, {'ok': True})
            return
        if path == '/api/notes':
            u = auth_of(self)
            if not u or not self._is_admin(u[0]):
                self._send(403, {'error': '仅管理员'})
                return
            action = (body.get('action') or 'list').strip()
            con = db()
            if action == 'list':
                rows = con.execute('''SELECT id,username,page,qid,kind,note,status,created_at,done_at
                                      FROM admin_notes ORDER BY
                                      CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC
                                      LIMIT 200''').fetchall()
                con.close()
                self._send(200, {'ok': True, 'notes': [dict(r) for r in rows],
                                 'open': sum(1 for r in rows if r['status'] == 'open')})
                return
            if action == 'add':
                note = (body.get('note') or '').strip()
                if not note:
                    con.close()
                    self._send(400, {'error': '内容不能为空'})
                    return
                cur = con.execute('''INSERT INTO admin_notes(username,page,qid,kind,note,status,created_at)
                                     VALUES(?,?,?,?,?, 'open', ?)''',
                                  (u[1] if len(u) > 1 else '', (body.get('page') or '')[:20],
                                   (body.get('qid') or '')[:20], (body.get('kind') or 'bug')[:20],
                                   note[:2000], now()))
                con.commit()
                nid = cur.lastrowid
                con.close()
                self._send(200, {'ok': True, 'id': nid})
                return
            if action in ('set', 'del'):
                try:
                    nid = int(body.get('id') or 0)
                except Exception:
                    nid = 0
                if not nid:
                    con.close()
                    self._send(400, {'error': '参数不对'})
                    return
                if action == 'del':
                    con.execute('DELETE FROM admin_notes WHERE id=?', (nid,))
                else:
                    st = 'done' if body.get('status') == 'done' else 'open'
                    con.execute('UPDATE admin_notes SET status=?, done_at=? WHERE id=?',
                                (st, now() if st == 'done' else None, nid))
                con.commit()
                con.close()
                self._send(200, {'ok': True})
                return
            con.close()
            self._send(400, {'error': '未知操作'})
            return
        if path == '/api/review':
            if not (body.get('stats') or {}).get('answered'):
                self._send(400, {'error': '还没有作答记录，先做几道题再来看整体评价'})
                return
            rv_model = 'deepseek' if str(body.get('model') or '').lower() == 'deepseek' else 'glm'
            res = call_ai(rv_model, build_review_messages(body), max_tokens=1600)
            if res.get('ok'):
                res['model'] = rv_model
            self._send(200 if res.get('ok') else 502, res)
            return
        self._send(404, 'not found', 'text/plain')


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    if not os.path.exists(DB):
        print('数据库不存在，先执行 import.py', file=sys.stderr)
        sys.exit(1)
    print(f'墨题服务启动：0.0.0.0:{PORT}  AI={"on" if DEEPSEEK_KEY else "off"}  模型={DEEPSEEK_MODEL}', flush=True)
    ThreadedHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
