// 墨题 Node 服务入口
import http from 'node:http';
import { config } from './config.js';
import { createRouter } from './core/router.js';
import { readJson } from './core/body.js';
import { serveStatic } from './core/static.js';
import { ok, fail } from './core/respond.js';
import { one, query, pool } from './db/pool.js';
import { selfTest } from './lib/weight.js';
import { now } from './lib/time.js';

import metaRoutes from './routes/meta.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quiz.js';
import aiRoutes from './routes/ai.js';
import feedbackRoutes from './routes/feedback.js';
import adminRoutes from './routes/admin.js';

selfTest();   // 权重公式自测，失败直接崩（宁可起不来）

const router = createRouter();
router.add(null, metaRoutes);
router.add(null, authRoutes);
router.add(null, quizRoutes);
router.add(null, aiRoutes);
router.add(null, feedbackRoutes);
router.add(null, adminRoutes);

function clientIp(req) {
  const fwd = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '');
  return fwd.split(',')[0].trim() || req.socket.remoteAddress || '';
}

async function resolveUser(req) {
  const h = String(req.headers['x-auth-token'] || '');
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const tk = h || bearer;
  if (!tk || tk.length !== 48) return null;
  const row = await one(
    `SELECT t.token, u.id, u.username, u.role, u.status, u.quota, u.tokens
     FROM auth_tokens t JOIN users u ON u.id=t.user_id
     WHERE t.token=? AND t.expires_at > ?`, [tk, now()]);
  if (!row || row.status !== 'active') return null;
  return { ...row, token: tk };
}

const ROLE_RANK = { user: 1, admin: 2, owner: 3 };

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  const m = router.match(req.method, pathname);
  if (!m) {
    if (pathname.startsWith('/api/')) return fail(res, 404, 'NOT_FOUND', '接口不存在');
    // 题目插图走独立目录（题库配图可单独更新，不必重建前端）
    if (pathname.startsWith('/img/')) {
      return serveStatic(config.imgDir, req, res, pathname.slice(4));
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(config.staticDir, req, res, pathname);
    return fail(res, 405, 'METHOD_NOT_ALLOWED', '不支持的方法');
  }

  const { route, params } = m;
  const ctx = { req, res, url, params, body: {}, user: null, token: null, ip: clientIp(req) };

  if (route.auth) {
    const u = await resolveUser(req);
    if (!u) return fail(res, 401, 'UNAUTHORIZED', '未登录或登录已过期');
    ctx.user = u;
    ctx.token = u.token;
    const need = route.auth === 'owner' ? 3 : route.auth === 'admin' ? 2 : 1;
    if ((ROLE_RANK[u.role] || 1) < need) return fail(res, 403, 'FORBIDDEN', '没有权限');
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      ctx.body = await readJson(req);
    } catch (e) {
      return fail(res, e.status || 400, e.code || 'BAD_REQUEST', e.message || '请求体不合法');
    }
  }

  try {
    // handler 里既有 ({ res, body, user, params, url }) 解构，也有直接拿整个 ctx 的写法
    await route.handler({ ...ctx, ctx });
  } catch (e) {
    console.error('[handler]', route.method, route.path, e);
    if (!res.headersSent) fail(res, 500, 'INTERNAL', '服务器出错了');
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[fatal]', e);
    if (!res.headersSent) fail(res, 500, 'INTERNAL', '服务器出错了');
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[moti-node] 启动 :${config.port}  静态目录 ${config.staticDir}`);
  console.log(`[moti-node] 路由 ${router.hasAnyMethod} 条  AI=${config.deepseek.key ? 'on' : 'off'}`);
});

let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  console.log(`[moti-node] 收到 ${sig}，开始优雅退出`);
  const timer = setTimeout(() => { console.error('[moti-node] 5 秒未退出，强制结束'); process.exit(1); }, 5000);
  server.close(async () => {
    try { await pool.end(); } catch {}
    clearTimeout(timer);
    console.log('[moti-node] 已退出');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
