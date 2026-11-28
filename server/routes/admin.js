// 管理后台：概览 / 用户 / 公告 / 题库 / 备份 / 日志
import { query, one, pool } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { ok, fail } from '../core/respond.js';
import { validate } from '../core/validate.js';
import { now } from '../lib/time.js';
import { hash, newSalt } from '../lib/password.js';
import { config } from '../config.js';
import { decodeOptions, decodeAnswer, toClientOptions } from '../lib/qfmt.js';

async function logAction(uid, action, detail) {
  try {
    await query('INSERT INTO admin_logs(actor_id,action,detail,created_at) VALUES(?,?,?,?)',
      [uid, action, String(detail || '').slice(0, 500), now()]);
  } catch {}
}

async function overview({ ctx, res }) {
  const users = await one("SELECT COUNT(*) AS n FROM users WHERE status='active'");
  const qs = await one('SELECT COUNT(*) AS n FROM questions');
  const sess = await one('SELECT COUNT(*) AS n FROM quiz_sessions');
  const fb = await one("SELECT COUNT(*) AS n FROM feedback WHERE status='open'");
  const notes = await one("SELECT COUNT(*) AS n FROM admin_notes WHERE status='open'");
  const ai7 = await one(
    "SELECT COUNT(*) AS n, IFNULL(SUM(prompt_tokens+completion_tokens),0) AS tk, IFNULL(SUM(tokens_cost),0) AS cost FROM ai_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const top = await query(
    `SELECT qid, COUNT(*) AS n FROM feedback WHERE status='open' GROUP BY qid ORDER BY n DESC LIMIT 5`);
  ok(res, {
    users: users.n, questions: qs.n, sessions: sess.n,
    feedback_open: fb.n, notes_open: notes.n,
    ai_7d: { calls: ai7.n, tokens: tk(ai7), cost: ai7.cost },
    hot_questions: top,
  });
}

const tk = (r) => Number(r.tk || 0);

async function users({ ctx, res }) {
  const rows = await query(
    `SELECT u.id, u.username, u.role, u.status, u.quota, u.tokens, u.created_at, u.last_login,
            (SELECT COUNT(*) FROM quiz_sessions s WHERE s.user_id=u.id) AS sessions,
            (SELECT COUNT(*) FROM feedback f WHERE f.user_id=u.id) AS feedbacks
     FROM users u ORDER BY u.id`);
  ok(res, { rows });
}

async function setQuota({ ctx, res, body }) {
  const v = validate(body, { username: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const u = await one('SELECT id, role FROM users WHERE username=?', [v.value.username]);
  if (!u) return fail(res, 404, 'NOT_FOUND', '没有这个用户');
  if (u.role === 'owner' && ctx.user.role !== 'owner') {
    return fail(res, 403, 'FORBIDDEN', '只有 owner 能改 owner');
  }
  const sets = [];
  const args = [];
  if (body.tokens !== undefined) { sets.push('tokens=?'); args.push(Math.max(0, Number(body.tokens) || 0)); }
  if (body.quota !== undefined) { sets.push('quota=?'); args.push(Math.max(0, Number(body.quota) || 0)); }
  if (body.status !== undefined) {
    if (!['active', 'disabled'].includes(body.status)) return fail(res, 400, 'BAD_PARAM', 'status 不合法');
    sets.push('status=?'); args.push(body.status);
  }
  if (!sets.length) return fail(res, 400, 'BAD_PARAM', '没有要改的字段');
  sets.push('updated_at=?'); args.push(now());
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, [...args, u.id]);
  await logAction(ctx.user.id, 'user.update', `${v.value.username} ${sets.join(',')}`);
  ok(res, {});
}

async function resetPassword({ ctx, res, body }) {
  const v = validate(body, { username: 'str', new_password: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  if (String(v.value.new_password).length < 6) return fail(res, 400, 'BAD_PARAM', '密码至少 6 位');
  const u = await one('SELECT id, role FROM users WHERE username=?', [v.value.username]);
  if (!u) return fail(res, 404, 'NOT_FOUND', '没有这个用户');
  if (u.role === 'owner' && ctx.user.role !== 'owner') {
    return fail(res, 403, 'FORBIDDEN', '只有 owner 能改 owner');
  }
  const salt = newSalt();
  const ph = await hash(v.value.new_password, salt);
  await withTx(async (con) => {
    await con.query('UPDATE users SET pass_hash=?, salt=?, updated_at=? WHERE id=?', [ph, salt, now(), u.id]);
    await con.query('DELETE FROM auth_tokens WHERE user_id=?', [u.id]);
  });
  await logAction(ctx.user.id, 'user.reset_password', v.value.username);
  ok(res, {});
}

async function createUser({ ctx, res, body }) {
  const v = validate(body, { username: 'str', password: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/.test(v.value.username)) {
    return fail(res, 400, 'BAD_PARAM', '用户名 3-20 位');
  }
  if (await one('SELECT id FROM users WHERE username=?', [v.value.username])) {
    return fail(res, 409, 'USER_EXISTS', '用户名已存在');
  }
  const role = ['user', 'admin'].includes(body.role) ? body.role : 'user';
  if (role === 'admin' && ctx.user.role !== 'owner') {
    return fail(res, 403, 'FORBIDDEN', '只有 owner 能设管理员');
  }
  const salt = newSalt();
  const ph = await hash(v.value.password, salt);
  const r = await query(
    `INSERT INTO users(username,pass_hash,salt,role,status,quota,tokens,created_at,updated_at)
     VALUES(?,?,?,?,'active',?,?,?,?)`,
    [v.value.username, ph, salt, role, Number(body.quota || 0), Number(body.tokens || 0), now(), now()]);
  await logAction(ctx.user.id, 'user.create', `${v.value.username} role=${role}`);
  ok(res, { id: r.insertId });
}

async function getNotice({ ctx, res }) {
  const r = await one('SELECT notice_text, notice_active, updated_at FROM site_config WHERE id=1');
  ok(res, { text: (r && r.notice_text) || '', active: Boolean(r && r.notice_active) });
}

async function setNotice({ ctx, res, body }) {
  const text = String(body.text || '').slice(0, 2000);
  const active = body.active ? 1 : 0;
  await query(
    `INSERT INTO site_config(id,notice_text,notice_active,updated_at) VALUES(1,?,?,?)
     ON DUPLICATE KEY UPDATE notice_text=VALUES(notice_text), notice_active=VALUES(notice_active), updated_at=VALUES(updated_at)`,
    [text, active, now()]);
  await logAction(ctx.user.id, 'notice.set', `active=${active} len=${text.length}`);
  ok(res, {});
}

async function listQuestions({ ctx, res, url }) {
  const kw = (url.searchParams.get('q') || '').trim();
  const args = [];
  let where = '';
  if (kw) { where = 'WHERE q.id LIKE ? OR q.stem LIKE ?'; args.push(`%${kw}%`, `%${kw}%`); }
  const rows = await query(
    `SELECT q.id, q.lo, q.k_level, q.pts, LEFT(q.stem, 80) AS stem, q.updated_at,
            GROUP_CONCAT(DISTINCT qp.paper_id ORDER BY qp.paper_id) AS papers
     FROM questions q LEFT JOIN question_papers qp ON qp.course_id=q.course_id AND qp.qid=q.id
     ${where} GROUP BY q.id ORDER BY q.sort LIMIT 300`, args);
  ok(res, { rows });
}

async function getQuestion({ ctx, res, url }) {
  const qid = url.searchParams.get('id');
  if (!qid) return fail(res, 400, 'BAD_PARAM', '缺少 id');
  const q = await one('SELECT * FROM questions WHERE id=?', [qid]);
  if (!q) return fail(res, 404, 'NOT_FOUND', '没有这道题');
  const papers = await query('SELECT paper_id, no, is_extra FROM question_papers WHERE qid=?', [qid]);
  const nodes = await query('SELECT node_id FROM question_syllabus WHERE qid=?', [qid]);
  const figs = await query('SELECT id, kind, html FROM figures WHERE id LIKE ?', [`%.${qid}`]);
  ok(res, {
    question: {
      id: q.id, course_id: q.course_id, stem: q.stem,
      options: toClientOptions(decodeOptions(q.options_json)),
      answer: decodeAnswer(q.answer_json),
      explain: q.explain, lo: q.lo, k_level: q.k_level, pts: q.pts,
    },
    papers, nodes: nodes.map(n => n.node_id), figure: figs[0] || null,
  });
}

async function saveQuestion({ ctx, res, body }) {
  const v = validate(body, { id: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const id = v.value.id;
  const courseId = String(body.course_id || 'ctfl');
  const stem = String(body.stem || '');
  if (!stem.trim()) return fail(res, 400, 'BAD_PARAM', '题干不能为空');
  const rawOptions = Array.isArray(body.options) ? body.options.map(o => (o && typeof o === 'object' ? String(o.t ?? '') : String(o))) : [];
  if (rawOptions.length < 2) return fail(res, 400, 'BAD_PARAM', '至少要有 2 个选项');
  const optionObjs = rawOptions.map((t, i) => ({ k: String.fromCharCode(65 + i), t }));
  const keys = optionObjs.map(o => o.k);
  // 答案既接受字母 ['C'] 也接受索引 [2]
  const answer = (Array.isArray(body.answer) ? body.answer : [])
    .map(a => (typeof a === 'number' ? keys[a] : String(a).toUpperCase()))
    .filter(k => keys.includes(k));
  if (!answer.length) return fail(res, 400, 'BAD_PARAM', '至少要标一个正确答案');

  const old = await one('SELECT id FROM questions WHERE id=?', [id]);
  await withTx(async (con) => {
    if (old) {
      await con.query(
        'UPDATE questions SET stem=?, options_json=?, answer_json=?, `explain`=?, lo=?, k_level=?, pts=?, updated_at=? WHERE id=?',
        [stem, JSON.stringify(optionObjs), JSON.stringify(answer), String(body.explain || ''),
          String(body.lo || '') || null, String(body.k_level || '') || null,
          Math.max(1, Number(body.pts) || 1), now(), id]);
    } else {
      const [mx] = await con.query('SELECT IFNULL(MAX(sort),0) AS m FROM questions WHERE course_id=?', [courseId]);
      await con.query(
        `INSERT INTO questions(id,course_id,stem,options_json,answer_json,\`explain\`,lo,k_level,pts,sort,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, courseId, stem, JSON.stringify(optionObjs), JSON.stringify(answer), String(body.explain || ''),
          String(body.lo || '') || null, String(body.k_level || '') || null,
          Math.max(1, Number(body.pts) || 1), mx[0].m + 1, now(), now()]);
      const paper = String(body.paper || id.split('-')[0]).toUpperCase();
      await con.query(
        'INSERT INTO question_papers(course_id,qid,paper_id,no,is_extra) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE no=VALUES(no)',
        [courseId, id, paper, Number(body.no) || 0, body.is_extra ? 1 : 0]);
    }
  });
  await logAction(ctx.user.id, old ? 'question.update' : 'question.create', id);
  ok(res, { created: !old });
}

// 题库整体导入：body = { questions: [...], mode: 'replace'|'merge' }
async function bankImport({ ctx, res, body }) {
  const list = Array.isArray(body.questions) ? body.questions : [];
  if (!list.length) return fail(res, 400, 'BAD_PARAM', '没有题目数据');
  if (list.length > 2000) return fail(res, 400, 'BAD_PARAM', '一次最多 2000 题');
  const courseId = String(body.course || 'ctfl');
  let added = 0;
  let updated = 0;
  await withTx(async (con) => {
    for (const q of list) {
      if (!q || !q.id || !q.stem) continue;
      const objs = (Array.isArray(q.options) ? q.options : []).map((o, i) => (o && typeof o === 'object'
        ? { k: String(o.k || String.fromCharCode(65 + i)), t: String(o.t ?? '') }
        : { k: String.fromCharCode(65 + i), t: String(o) }));
      const ks = objs.map(o => o.k);
      const answer = (Array.isArray(q.answer) ? q.answer : [])
        .map(a => (typeof a === 'number' ? ks[a] : String(a).toUpperCase()))
        .filter(k => ks.includes(k));
      const ex = await con.query('SELECT id FROM questions WHERE id=?', [q.id]);
      if (ex[0].length) {
        await con.query(
          'UPDATE questions SET stem=?, options_json=?, answer_json=?, `explain`=?, updated_at=? WHERE id=?',
          [q.stem, JSON.stringify(objs), JSON.stringify(answer), String(q.explain || ''), now(), q.id]);
        updated++;
      } else {
        const [mx] = await con.query('SELECT IFNULL(MAX(sort),0) AS m FROM questions WHERE course_id=?', [courseId]);
        await con.query(
          `INSERT INTO questions(id,course_id,stem,options_json,answer_json,\`explain\`,lo,k_level,pts,sort,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [q.id, courseId, q.stem, JSON.stringify(objs), JSON.stringify(answer),
            String(q.explain || ''), q.lo || null, q.k_level || null, Number(q.pts) || 1,
            mx[0].m + 1, now(), now()]);
        added++;
      }
    }
  });
  await logAction(ctx.user.id, 'bank.import', `added=${added} updated=${updated}`);
  ok(res, { added, updated, total: list.length });
}

async function backup({ ctx, res }) {
  const questions = await query(
    'SELECT id, course_id, stem, options_json, answer_json, `explain`, lo, k_level, pts FROM questions ORDER BY sort');
  const papers = await query('SELECT course_id, qid, paper_id, no, is_extra FROM question_papers');
  const figures = await query('SELECT id, course_id, kind, html FROM figures');
  const payload = {
    exported_at: now(),
    course: 'ctfl',
    questions: questions.map(q => ({
      id: q.id, stem: q.stem, options: toClientOptions(decodeOptions(q.options_json)),
      answer: decodeAnswer(q.answer_json), explain: q.explain,
      lo: q.lo, k_level: q.k_level, pts: q.pts,
      papers: papers.filter(p => p.qid === q.id).map(p => p.paper_id),
    })),
    figures,
  };
  const buf = Buffer.from(JSON.stringify(payload, null, 1));
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="moti-bank-${Date.now()}.json"`,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
  res.end(buf);
}

async function logs({ ctx, res, url }) {
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const rows = await query(
    `SELECT l.id, l.action, l.detail, l.created_at, u.username
     FROM admin_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT ?`, [limit]);
  ok(res, { rows });
}

async function deepseekBalance({ ctx, res }) {
  if (!config.deepseek.key) return fail(res, 503, 'AI_OFF', '未配置 DeepSeek 密钥');
  try {
    const r = await fetch(config.deepseek.base + '/user/balance', {
      headers: { Authorization: 'Bearer ' + config.deepseek.key },
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    ok(res, { upstream: j });
  } catch (e) {
    fail(res, 502, 'UPSTREAM', String(e.message || e));
  }
}

export default [
  { method: 'GET', path: '/api/admin/overview', auth: 'admin', handler: overview },
  { method: 'GET', path: '/api/admin/users', auth: 'admin', handler: users },
  { method: 'POST', path: '/api/admin/quota', auth: 'admin', handler: setQuota },
  { method: 'POST', path: '/api/admin/user', auth: 'admin', handler: createUser },
  { method: 'POST', path: '/api/admin/reset-password', auth: 'admin', handler: resetPassword },
  { method: 'GET', path: '/api/admin/notice', auth: 'admin', handler: getNotice },
  { method: 'POST', path: '/api/admin/notice', auth: 'admin', handler: setNotice },
  { method: 'GET', path: '/api/admin/questions', auth: 'admin', handler: listQuestions },
  { method: 'GET', path: '/api/admin/question', auth: 'admin', handler: getQuestion },
  { method: 'POST', path: '/api/admin/question', auth: 'admin', handler: saveQuestion },
  { method: 'POST', path: '/api/admin/bank-import', auth: 'admin', handler: bankImport },
  { method: 'GET', path: '/api/admin/backup', auth: 'admin', handler: backup },
  { method: 'GET', path: '/api/admin/logs', auth: 'admin', handler: logs },
  { method: 'GET', path: '/api/admin/deepseek-balance', auth: 'admin', handler: deepseekBalance },
];
