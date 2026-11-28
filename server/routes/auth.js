// 账号：注册 / 登录 / 登出 / me / 改密 / 会话管理
import { query, one } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { ok, fail } from '../core/respond.js';
import { validate } from '../core/validate.js';
import { hash, verify, newSalt } from '../lib/password.js';
import { token as newToken } from '../lib/ids.js';
import { now } from '../lib/time.js';
import { config } from '../config.js';

// 登录失败限流（内存，单进程）：key=ip → {n, until}
const attempts = new Map();

function throttleKey(req) {
  const fwd = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '');
  return (fwd.split(',')[0].trim() || req.socket.remoteAddress || 'unknown');
}

async function register({ req, res, body }) {
  const v = validate(body, { username: 'str', password: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const { username, password } = v.value;
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/.test(username)) {
    return fail(res, 400, 'BAD_PARAM', '用户名 3-20 位，字母数字下划线或中文');
  }
  if (String(password).length < 6) return fail(res, 400, 'BAD_PARAM', '密码至少 6 位');

  const exists = await one('SELECT id FROM users WHERE username=?', [username]);
  if (exists) return fail(res, 409, 'USER_EXISTS', '这个用户名已被占用');

  const salt = newSalt();
  const ph = await hash(password, salt);
  const r = await query(
    `INSERT INTO users(username,pass_hash,salt,role,status,quota,tokens,created_at,updated_at)
     VALUES(?,?,?,'user','active',0,0,?,?)`,
    [username, ph, salt, now(), now()]);
  const uid = r.insertId;
  const tk = await issueToken(uid);
  ok(res, { token: tk, username, role: 'user', tokens: 0 });
}

async function issueToken(userId) {
  const tk = newToken();
  const created = now();
  const exp = new Date(Date.now() + config.tokenDays * 86400000);
  const pad = n => String(n).padStart(2, '0');
  const expires = `${exp.getFullYear()}-${pad(exp.getMonth() + 1)}-${pad(exp.getDate())} `
    + `${pad(exp.getHours())}:${pad(exp.getMinutes())}:${pad(exp.getSeconds())}`;
  await query('INSERT INTO auth_tokens(token,user_id,created_at,expires_at) VALUES(?,?,?,?)',
    [tk, userId, created, expires]);
  return tk;
}

async function login({ req, res, body }) {
  const v = validate(body, { username: 'str', password: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const ip = throttleKey(req);
  const rec = attempts.get(ip);
  if (rec && rec.until > Date.now()) {
    const wait = Math.ceil((rec.until - Date.now()) / 1000);
    return fail(res, 429, 'TOO_MANY', `尝试过于频繁，请 ${wait} 秒后再试`);
  }

  const u = await one('SELECT id, username, pass_hash, salt, role, status, quota, tokens FROM users WHERE username=?',
    [v.value.username]);
  const good = u && u.status === 'active' && await verify(v.value.password, u.salt, u.pass_hash);
  if (!good) {
    const n = (rec && rec.n ? rec.n : 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + Math.min(300, 30 * n) * 1000 : 0 });
    return fail(res, 401, 'BAD_CREDENTIALS', '用户名或密码不对');
  }
  attempts.delete(ip);
  await query('UPDATE users SET last_login=? WHERE id=?', [now(), u.id]);
  const tk = await issueToken(u.id);
  ok(res, { token: tk, username: u.username, role: u.role, tokens: u.tokens, quota: u.quota });
}

async function logout({ ctx, res }) {
  await query('DELETE FROM auth_tokens WHERE token=?', [ctx.token]);
  ok(res, {});
}

async function me({ ctx, res }) {
  ok(res, {
    username: ctx.user.username, role: ctx.user.role,
    tokens: ctx.user.tokens, quota: ctx.user.quota,
    is_admin: ctx.user.role === 'admin' || ctx.user.role === 'owner',
  });
}

async function changePassword({ ctx, res, body }) {
  const v = validate(body, { old_password: 'str', new_password: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  if (String(v.value.new_password).length < 6) return fail(res, 400, 'BAD_PARAM', '新密码至少 6 位');
  const u = await one('SELECT id, pass_hash, salt FROM users WHERE id=?', [ctx.user.id]);
  if (!await verify(v.value.old_password, u.salt, u.pass_hash)) {
    return fail(res, 401, 'BAD_CREDENTIALS', '原密码不对');
  }
  const salt = newSalt();
  const ph = await hash(v.value.new_password, salt);
  await withTx(async (con) => {
    await con.query('UPDATE users SET pass_hash=?, salt=?, updated_at=? WHERE id=?',
      [ph, salt, now(), ctx.user.id]);
    await con.query('DELETE FROM auth_tokens WHERE user_id=?', [ctx.user.id]);   // 强制重新登录
  });
  ok(res, { reauth: true });
}

async function sessions({ ctx, res }) {
  const rows = await query(
    'SELECT token, created_at, expires_at FROM auth_tokens WHERE user_id=? AND expires_at > ? ORDER BY expires_at DESC',
    [ctx.user.id, now()]);
  ok(res, { rows: rows.map(r => ({
    tail: r.token.slice(-6), current: r.token === ctx.token,
    created_at: r.created_at, expires_at: r.expires_at,
  })) });
}

async function kickSession({ ctx, res, params }) {
  const rows = await query('SELECT token FROM auth_tokens WHERE user_id=?', [ctx.user.id]);
  const target = rows.find(r => r.token.slice(-6) === params.token);
  if (!target) return fail(res, 404, 'NOT_FOUND', '该会话不存在');
  await query('DELETE FROM auth_tokens WHERE token=?', [target.token]);
  ok(res, {});
}

export default [
  { method: 'POST', path: '/api/auth/register', auth: null, handler: register },
  { method: 'POST', path: '/api/register', auth: null, handler: register },
  { method: 'POST', path: '/api/auth/login', auth: null, handler: login },
  { method: 'POST', path: '/api/login', auth: null, handler: login },
  { method: 'POST', path: '/api/auth/logout', auth: 'user', handler: logout },
  { method: 'POST', path: '/api/logout', auth: 'user', handler: logout },
  { method: 'GET', path: '/api/auth/me', auth: 'user', handler: me },
  { method: 'GET', path: '/api/me', auth: 'user', handler: me },
  { method: 'POST', path: '/api/auth/password', auth: 'user', handler: changePassword },
  { method: 'GET', path: '/api/auth/sessions', auth: 'user', handler: sessions },
  { method: 'DELETE', path: '/api/auth/sessions/:token', auth: 'user', handler: kickSession },
];
