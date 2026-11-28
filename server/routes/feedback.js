// 题目反馈 + 想法记录（admin_notes）
import { query, one } from '../db/pool.js';
import { ok, fail } from '../core/respond.js';
import { validate } from '../core/validate.js';
import { now } from '../lib/time.js';

async function submitFeedback({ ctx, res, body }) {
  const v = validate(body, { qid: 'str', note: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const kind = String(body.kind || '其他').slice(0, 20);
  await query(
    'INSERT INTO feedback(user_id,course_id,qid,kind,note,status,created_at) VALUES(?,?,?,?,?,?,?)',
    [ctx.user.id, String(body.course || 'ctfl'), v.value.qid, kind, v.value.note, 'open', now()]);
  ok(res, { submitted_at: now() });
}

async function feedbackStatus({ ctx, res, url }) {
  const qid = url.searchParams.get('qid');
  if (!qid) return fail(res, 400, 'BAD_PARAM', '缺少 qid');
  const rows = await query(
    'SELECT id, kind, note, status, created_at FROM feedback WHERE user_id=? AND qid=? ORDER BY id DESC',
    [ctx.user.id, qid]);
  ok(res, { rows, has_open: rows.some(r => r.status === 'open') });
}

// ---------------- 想法记录 ----------------
async function listNotes({ ctx, res, url }) {
  const status = url.searchParams.get('status') || 'open';
  const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'owner';
  const rows = isAdmin
    ? await query('SELECT * FROM admin_notes WHERE status=? ORDER BY id DESC', [status])
    : await query('SELECT * FROM admin_notes WHERE user_id=? AND status=? ORDER BY id DESC',
      [ctx.user.id, status]);
  ok(res, { rows });
}

async function addNote({ ctx, res, body }) {
  const v = validate(body, { note: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const r = await query(
    'INSERT INTO admin_notes(user_id,page,course_id,qid,kind,note,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [ctx.user.id, String(body.page || '').slice(0, 32) || null,
      body.qid ? String(body.course || 'ctfl') : null, body.qid ? String(body.qid) : null,
      String(body.kind || '想法').slice(0, 20), v.value.note, 'open', now()]);
  ok(res, { id: r.insertId });
}

async function setNoteStatus({ ctx, res, params, body }) {
  const status = String(body.status || 'done');
  if (!['open', 'done', 'dropped'].includes(status)) return fail(res, 400, 'BAD_PARAM', 'status 不合法');
  const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'owner';
  const row = await one('SELECT id, user_id FROM admin_notes WHERE id=?', [params.id]);
  if (!row) return fail(res, 404, 'NOT_FOUND', '没有这条记录');
  if (!isAdmin && row.user_id !== ctx.user.id) return fail(res, 403, 'FORBIDDEN', '没有权限');
  await query('UPDATE admin_notes SET status=?, done_at=? WHERE id=?',
    [status, status === 'done' ? now() : null, params.id]);
  ok(res, {});
}

export default [
  { method: 'POST', path: '/api/feedback', auth: 'user', handler: submitFeedback },
  { method: 'GET', path: '/api/feedback/status', auth: 'user', handler: feedbackStatus },
  { method: 'GET', path: '/api/notes', auth: 'user', handler: listNotes },
  { method: 'POST', path: '/api/notes', auth: 'user', handler: addNote },
  { method: 'PATCH', path: '/api/notes/:id', auth: 'user', handler: setNoteStatus },
];
