// 练习层：state 读写、场次、逐题作答、权重、排行榜、统计
import { query, one } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { ok, fail } from '../core/respond.js';
import { validate } from '../core/validate.js';
import { now } from '../lib/time.js';
import { sessionId } from '../lib/ids.js';
import { judge, decodeOptions, decodeAnswer, idxToKeys } from '../lib/qfmt.js';
import { calcWeight, weightFromSeq } from '../lib/weight.js';

const S = (v) => (v === undefined || v === null ? null : v);

// ---------------- 状态读取 ----------------
async function loadState(uid, courseId = 'ctfl') {
  const sessions = await query(
    `SELECT sid, ext_id, ts, sources, source, mode, qcount, answered, correct, score, finished,
            started_at, finished_at
     FROM quiz_sessions WHERE user_id=? AND course_id=? ORDER BY ts ASC, sid ASC`, [uid, courseId]);
  const items = await query(
    `SELECT i.sid, i.qid, i.chosen, i.correct, i.option_order, i.seq
     FROM quiz_items i JOIN quiz_sessions s ON s.sid=i.sid
     WHERE s.user_id=? AND i.course_id=? ORDER BY i.sid, i.seq`, [uid, courseId]);
  const msgs = await query(
    `SELECT sid, qid, scope, role, content FROM ai_messages
     WHERE user_id=? AND course_id=? ORDER BY id ASC`, [uid, courseId]);

  const bySid = new Map();
  for (const it of items) {
    if (!bySid.has(it.sid)) bySid.set(it.sid, []);
    bySid.get(it.sid).push(it);
  }
  const sess = sessions.map(s => {
    const rows = bySid.get(s.sid) || [];
    const perms = {};
    const its = [];
    for (const r of rows) {
      if (r.option_order) {
        try { perms[r.qid] = JSON.parse(r.option_order); } catch {}
      }
      if (r.chosen !== null) {
        let chosen;
        try { chosen = JSON.parse(r.chosen); } catch { chosen = r.chosen; }
        its.push({ qid: r.qid, chosen, correct: !!r.correct });
      }
    }
    const out = {
      id: s.ext_id, ts: Number(s.ts), qids: rows.map(r => r.qid),
      items: its, perms, mode: s.mode || 'random',
      source: s.source, sources: (s.sources || '').split(',').filter(Boolean),
      finished: !!s.finished, qcount: s.qcount, answered: s.answered,
      correct: s.correct, score: s.score,
    };
    const review = msgs.filter(m => m.scope === 'review' && m.sid === s.sid)
      .map(m => ({ role: m.role === 'ai' ? 'ai' : 'me', content: m.content }));
    if (review.length) out.review = review;
    return out;
  });

  // current = 最近一场未完成的
  const open = sessions.filter(s => !s.finished).sort((a, b) => b.ts - a.ts)[0];
  let current = null;
  if (open) current = sess.find(s => s.id === open.ext_id) || null;

  // chats：优先按「场次::题号」，找不到场次的按题号（早期数据）
  const chats = {};
  const extById = new Map(sessions.map(s => [s.sid, s.ext_id]));
  for (const m of msgs) {
    if (m.scope !== 'ask') continue;
    const key = m.sid ? `${extById.get(m.sid)}::${m.qid}` : m.qid;
    if (!chats[key]) chats[key] = [];
    chats[key].push({ role: m.role === 'ai' ? 'ai' : 'me', content: m.content });
  }

  return { sessions: sess.filter(s => s.finished), current, chats };
}

// ---------------- 状态写入（差异写库） ----------------
async function saveState(uid, courseId, state) {
  const incoming = Array.isArray(state.sessions) ? state.sessions.slice() : [];
  if (state.current && state.current.id && !incoming.some(s => s.id === state.current.id)) {
    incoming.push(state.current);
  }

  await withTx(async (con) => {
    const [rows] = await con.query(
      'SELECT sid, ext_id FROM quiz_sessions WHERE user_id=? AND course_id=?', [uid, courseId]);
    const extToSid = new Map(rows.map(r => [r.ext_id, r.sid]));
    const keep = new Set();

    for (const s of incoming) {
      const ext = String(s.id || '');
      if (!ext) continue;
      keep.add(ext);
      const qids = Array.isArray(s.qids) ? s.qids : [];
      const items = Array.isArray(s.items) ? s.items : [];
      const chosenMap = new Map(items.map(it => [it.qid, it]));
      const answered = items.length;
      const correct = items.filter(it => it.correct).length;
      const sources = Array.isArray(s.sources) && s.sources.length ? s.sources : (s.source ? [s.source] : []);
      const source = sources.length > 1 ? 'MULTI' : (sources[0] || null);
      const ts = Number(s.ts) || Date.now();
      const startedAt = new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
      const finished = s.finished ? 1 : 0;

      let sid = extToSid.get(ext);
      if (sid) {
        await con.query(
          `UPDATE quiz_sessions SET ts=?, sources=?, source=?, mode=?, qcount=?, answered=?,
             correct=?, finished=?, finished_at=? WHERE sid=?`,
          [ts, sources.join(',') || null, source, s.mode || 'random', qids.length, answered,
            correct, finished, finished ? startedAt : null, sid]);
        await con.query('DELETE FROM quiz_items WHERE sid=?', [sid]);
      } else {
        const [r] = await con.query(
          `INSERT INTO quiz_sessions(user_id,course_id,ext_id,ts,sources,source,mode,qcount,answered,
             correct,score,finished,started_at,finished_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uid, courseId, ext, ts, sources.join(',') || null, source, s.mode || 'random',
            qids.length, answered, correct, 0, finished, startedAt, finished ? startedAt : null]);
        sid = r.insertId;
        extToSid.set(ext, sid);
      }

      const perms = s.perms || {};
      const rowsToInsert = qids.map((qid, i) => {
        const it = chosenMap.get(qid);
        return [sid, i + 1, courseId, qid,
          it && it.chosen !== undefined ? JSON.stringify(it.chosen) : null,
          it ? (it.correct ? 1 : 0) : null,
          perms[qid] ? JSON.stringify(perms[qid]) : null];
      });
      if (rowsToInsert.length) {
        await con.query(
          'INSERT INTO quiz_items(sid,seq,course_id,qid,chosen,correct,option_order) VALUES ?', [rowsToInsert]);
      }
      // 分数：按题目 pts 重算
      const [scoreRow] = await con.query(
        `SELECT IFNULL(SUM(q.pts),0) AS sc FROM quiz_items i
         JOIN questions q ON q.course_id=i.course_id AND q.id=i.qid
         WHERE i.sid=? AND i.correct=1`, [sid]);
      await con.query('UPDATE quiz_sessions SET score=? WHERE sid=?', [Number(scoreRow[0].sc), sid]);

      // 整场评价
      if (Array.isArray(s.review) && s.review.length) {
        const [cnt] = await con.query(
          "SELECT COUNT(*) AS n FROM ai_messages WHERE user_id=? AND sid=? AND scope='review'", [uid, sid]);
        const have = cnt[0].n;
        if (s.review.length > have) {
          const add = s.review.slice(have).map(m => [uid, courseId, sid, null, 'review',
            m.role === 'ai' ? 'ai' : 'me', null, String(m.content || ''), now()]);
          await con.query(
            'INSERT INTO ai_messages(user_id,course_id,sid,qid,scope,role,model,content,created_at) VALUES ?', [add]);
        }
      }
    }

    // 删掉已不存在的场次
    const stale = rows.filter(r => !keep.has(r.ext_id)).map(r => r.sid);
    if (stale.length) {
      await con.query(`DELETE FROM quiz_items WHERE sid IN (${stale.map(() => '?').join(',')})`, stale);
      await con.query(`DELETE FROM ai_messages WHERE sid IN (${stale.map(() => '?').join(',')})`, stale);
      await con.query(`DELETE FROM quiz_sessions WHERE sid IN (${stale.map(() => '?').join(',')})`, stale);
    }

    // chats：只补 DB 里没有的尾部，不清空
    const chats = state.chats || {};
    for (const [key, arr] of Object.entries(chats)) {
      if (!Array.isArray(arr) || !arr.length) continue;
      let sid = null;
      let qid = key;
      if (key.includes('::')) {
        const [ext, q] = key.split('::');
        sid = extToSid.get(ext) || null;
        qid = q;
      }
      const [cnt] = await con.query(
        `SELECT COUNT(*) AS n FROM ai_messages WHERE user_id=? AND scope='ask'
           AND qid=? AND ${sid === null ? 'sid IS NULL' : 'sid=?'}`,
        sid === null ? [uid, qid] : [uid, qid, sid]);
      const have = cnt[0].n;
      if (arr.length > have) {
        const add = arr.slice(have).map(m => [uid, courseId, sid, qid, 'ask',
          m.role === 'ai' ? 'ai' : 'me', null, String(m.content || ''), now()]);
        await con.query(
          'INSERT INTO ai_messages(user_id,course_id,sid,qid,scope,role,model,content,created_at) VALUES ?', [add]);
      }
    }
  });
  await recomputeWeights(uid, courseId);
}

// ---------------- 权重回算 ----------------
async function recomputeWeights(uid, courseId, qid = null) {
  const args = [uid, courseId];
  let filter = '';
  if (qid) { filter = ' AND i.qid=?'; args.push(qid); }
  const rows = await query(
    `SELECT i.qid, i.correct, s.ts, i.seq
     FROM quiz_items i JOIN quiz_sessions s ON s.sid=i.sid
     WHERE s.user_id=? AND i.course_id=? AND i.correct IS NOT NULL${filter}
     ORDER BY s.ts ASC, i.seq ASC`, args);
  const byQ = new Map();
  for (const r of rows) {
    if (!byQ.has(r.qid)) byQ.set(r.qid, []);
    byQ.get(r.qid).push(r.correct ? 1 : 0);
  }
  const vals = [];
  for (const [qq, seq] of byQ) {
    const { last5, streakCorrect, streakWrong, weight } = weightFromSeq(seq);
    vals.push([uid, courseId, qq, last5, streakCorrect, streakWrong, seq.length,
      seq.filter(Boolean).length, weight, now()]);
  }
  await withTx(async (con) => {
    await con.query('DELETE FROM q_weight WHERE user_id=? AND course_id=?', [uid, courseId]);
    if (vals.length) {
      await con.query(
        `INSERT INTO q_weight(user_id,course_id,qid,last5,streak_correct,streak_wrong,attempts,
           correct_total,weight,updated_at) VALUES ?`, [vals]);
    }
  });
  return vals.length;
}

// ---------------- 路由 ----------------
async function getState({ ctx, res, url }) {
  const courseId = url.searchParams.get('course') || 'ctfl';
  ok(res, await loadState(ctx.user.id, courseId));
}

async function postState({ ctx, res, body }) {
  const courseId = body.course || 'ctfl';
  await saveState(ctx.user.id, courseId, body);
  ok(res, { saved_at: now() });
}

// 开一场新练习：服务端落库，返回场次 id 与题目清单
async function createSession({ ctx, res, body }) {
  const qids = Array.isArray(body.qids) ? body.qids.map(String).slice(0, 200) : [];
  if (!qids.length) return fail(res, 400, 'BAD_PARAM', '题目清单不能为空');
  const courseId = String(body.course || 'ctfl');
  const sources = Array.isArray(body.sources) ? body.sources.map(String) : [];
  const mode = ['random', 'order', 'wrong'].includes(body.mode) ? body.mode : 'random';
  const ext = sessionId();
  const ts = Date.now();

  const sid = await withTx(async (con) => {
    const [r] = await con.query(
      `INSERT INTO quiz_sessions(user_id,course_id,ext_id,ts,sources,source,mode,qcount,answered,
         correct,score,finished,started_at)
       VALUES(?,?,?,?,?,?,?,?,0,0,0,0,?)`,
      [ctx.user.id, courseId, ext, ts, sources.join(',') || null,
        sources.length > 1 ? 'MULTI' : (sources[0] || null), mode, qids.length, now()]);
    const rows = qids.map((qid, i) => [r.insertId, i + 1, courseId, qid]);
    await con.query('INSERT INTO quiz_items(sid,seq,course_id,qid) VALUES ?', [rows]);
    return r.insertId;
  });

  ok(res, { sid: ext, qids, count: qids.length, started_at: now(), db_sid: sid });
}

async function listSessions({ ctx, res, url }) {
  const courseId = url.searchParams.get('course') || 'ctfl';
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
  const rows = await query(
    `SELECT sid, ext_id, ts, source, sources, mode, qcount, answered, correct, score, finished, started_at
     FROM quiz_sessions WHERE user_id=? AND course_id=? ORDER BY ts DESC LIMIT ?`,
    [ctx.user.id, courseId, limit]);
  ok(res, { rows });
}

async function getSession({ ctx, res, params }) {
  const s = await one(
    'SELECT sid, ext_id, ts, source, sources, mode, qcount, answered, correct, score, finished FROM quiz_sessions WHERE user_id=? AND ext_id=?',
    [ctx.user.id, params.sid]);
  if (!s) return fail(res, 404, 'NOT_FOUND', '没有这场练习');
  const items = await query(
    'SELECT qid, seq, chosen, correct, option_order FROM quiz_items WHERE sid=? ORDER BY seq', [s.sid]);
  ok(res, { session: s, items: items.map(r => ({
    qid: r.qid, seq: r.seq,
    chosen: r.chosen ? JSON.parse(r.chosen) : null,
    correct: r.correct === null ? null : !!r.correct,
    option_order: r.option_order ? JSON.parse(r.option_order) : null,
  })) });
}

// 逐题作答：服务端判题，返回 correct/answer/explain
async function answerItem({ ctx, res, params, body }) {
  const v = validate(body, { qid: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const qid = v.value.qid;
  const chosen = Array.isArray(body.chosen) ? body.chosen.map(Number) : [];

  const s = await one('SELECT sid, finished FROM quiz_sessions WHERE user_id=? AND ext_id=?',
    [ctx.user.id, params.sid]);
  if (!s) return fail(res, 404, 'NOT_FOUND', '没有这场练习');
  if (s.finished) return fail(res, 409, 'SESSION_CLOSED', '这场练习已结束');

  const q = await one('SELECT id, course_id, options_json, answer_json, `explain` FROM questions WHERE id=?', [qid]);
  if (!q) return fail(res, 404, 'NOT_FOUND', '没有这道题');

  const prev = await one('SELECT seq, option_order FROM quiz_items WHERE sid=? AND qid=?', [s.sid, qid]);
  let order = null;
  if (prev && prev.option_order) { try { order = JSON.parse(prev.option_order); } catch {} }
  const jr = judge(chosen, order, q.options_json, q.answer_json);
  const correct = jr.correct;
  const objs = jr.options;
  // 对外的 answer 用索引（与 /api/questions 一致）
  const answer = jr.answer.map(l => objs.findIndex(o => o.k === l)).filter(i => i >= 0);

  const item = prev;
  if (item) {
    await query('UPDATE quiz_items SET chosen=?, correct=? WHERE sid=? AND qid=?',
      [JSON.stringify(chosen), correct ? 1 : 0, s.sid, qid]);
  } else {
    const maxRow = await one('SELECT IFNULL(MAX(seq),0) AS m FROM quiz_items WHERE sid=?', [s.sid]);
    await query('INSERT INTO quiz_items(sid,seq,course_id,qid,chosen,correct) VALUES(?,?,?,?,?,?)',
      [s.sid, maxRow.m + 1, q.course_id, qid, JSON.stringify(chosen), correct ? 1 : 0]);
  }
  // 场次统计与分数
  const agg = await one(
    `SELECT COUNT(*) AS answered, IFNULL(SUM(correct),0) AS correct FROM quiz_items
     WHERE sid=? AND chosen IS NOT NULL`, [s.sid]);
  const sc = await one(
    `SELECT IFNULL(SUM(q2.pts),0) AS sc FROM quiz_items i
     JOIN questions q2 ON q2.course_id=i.course_id AND q2.id=i.qid
     WHERE i.sid=? AND i.correct=1`, [s.sid]);
  await query('UPDATE quiz_sessions SET answered=?, correct=?, score=? WHERE sid=?',
    [Number(agg.answered), Number(agg.correct), Number(sc.sc), s.sid]);

  await recomputeWeights(ctx.user.id, q.course_id, qid);
  const w = await one('SELECT weight FROM q_weight WHERE user_id=? AND course_id=? AND qid=?',
    [ctx.user.id, q.course_id, qid]);

  ok(res, {
    correct, answer, explain: q.explain,
    weight: w ? Number(w.weight) : 0,
    answered: Number(agg.answered), right: Number(agg.correct), score: Number(sc.sc),
  });
}

async function finishSession({ ctx, res, params, body }) {
  const s = await one('SELECT sid FROM quiz_sessions WHERE user_id=? AND ext_id=?',
    [ctx.user.id, params.sid]);
  if (!s) return fail(res, 404, 'NOT_FOUND', '没有这场练习');
  const agg = await one(
    'SELECT COUNT(*) AS answered, IFNULL(SUM(correct),0) AS correct FROM quiz_items WHERE sid=? AND chosen IS NOT NULL',
    [s.sid]);
  const sc = await one(
    `SELECT IFNULL(SUM(q.pts),0) AS sc FROM quiz_items i
     JOIN questions q ON q.course_id=i.course_id AND q.id=i.qid WHERE i.sid=? AND i.correct=1`, [s.sid]);
  await query('UPDATE quiz_sessions SET finished=1, finished_at=?, answered=?, correct=?, score=? WHERE sid=?',
    [now(), agg.answered, agg.correct, sc.sc, s.sid]);
  await recomputeWeights(ctx.user.id, body.course || 'ctfl');
  ok(res, { answered: Number(agg.answered), correct: Number(agg.correct), score: Number(sc.sc), finished_at: now() });
}

async function deleteSession({ ctx, res, params }) {
  const s = await one('SELECT sid FROM quiz_sessions WHERE user_id=? AND ext_id=?',
    [ctx.user.id, params.sid]);
  if (!s) return fail(res, 404, 'NOT_FOUND', '没有这场练习');
  await withTx(async (con) => {
    await con.query('DELETE FROM quiz_items WHERE sid=?', [s.sid]);
    await con.query('DELETE FROM ai_messages WHERE sid=? AND scope != ?', [s.sid, 'ask']);
    await con.query('UPDATE ai_messages SET sid=NULL WHERE sid=?', [s.sid]);
    await con.query('DELETE FROM quiz_sessions WHERE sid=?', [s.sid]);
  });
  ok(res, {});
}

async function weights({ ctx, res, url }) {
  const courseId = url.searchParams.get('course') || 'ctfl';
  const rows = await query(
    'SELECT qid, last5, streak_correct, streak_wrong, attempts, correct_total, weight FROM q_weight WHERE user_id=? AND course_id=?',
    [ctx.user.id, courseId]);
  ok(res, { rows: rows.map(r => ({ ...r, weight: Number(r.weight) })) });
}

async function stats({ ctx, res, url }) {
  const courseId = url.searchParams.get('course') || 'ctfl';
  const total = await one('SELECT COUNT(*) AS n FROM questions WHERE course_id=?', [courseId]);
  // 「做过」= 真有作答的题，开过场但没答的不算
  const done = await one(
    `SELECT COUNT(DISTINCT i.qid) AS n FROM quiz_items i JOIN quiz_sessions s ON s.sid=i.sid
     WHERE s.user_id=? AND i.course_id=? AND i.chosen IS NOT NULL`,
    [ctx.user.id, courseId]);
  const ok10 = await one(
    'SELECT COUNT(*) AS n FROM q_weight WHERE user_id=? AND course_id=? AND weight>=70',
    [ctx.user.id, courseId]);
  const sess = await one(
    'SELECT COUNT(*) AS n, IFNULL(SUM(qcount),0) AS total_q, IFNULL(SUM(correct),0) AS right_q FROM quiz_sessions WHERE user_id=? AND course_id=? AND finished=1',
    [ctx.user.id, courseId]);
  ok(res, {
    total: Number(total.n), done: Number(done.n), mastered: Number(ok10.n),
    sessions: Number(sess.n), total_q: Number(sess.total_q), right_q: Number(sess.right_q),
  });
}

// 正确率（最近 N 场）
async function recentStats(uid, courseId, limit = 200) {
  const rows = await query(
    `SELECT answered, correct FROM quiz_sessions
     WHERE user_id=? AND course_id=? AND finished=1 ORDER BY ts DESC LIMIT ?`, [uid, courseId, limit]);
  const a = rows.reduce((s, r) => s + Number(r.answered), 0);
  const c = rows.reduce((s, r) => s + Number(r.correct), 0);
  return { answered: a, correct: c, rate: a ? Math.round((c / a) * 1000) / 10 : 0, n: rows.length };
}

function maskName(name) {
  const s = String(name || '');
  if (s.length <= 2) return s.slice(0, 1) + '***';
  if (s.length <= 4) return s.slice(0, 2) + '***' + s.slice(-1);
  return s.slice(0, 3) + '***' + s.slice(-1);
}

async function leaderboard({ ctx, res, url }) {
  const sort = url.searchParams.get('sort') === 'count' ? 'count' : 'rate';
  const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'owner';
  const users = await query("SELECT id, username FROM users WHERE status='active'");
  const rows = [];
  for (const u of users) {
    if (sort === 'rate') {
      const st = await recentStats(u.id, 'ctfl', 200);
      if (st.answered < 20) continue;
      rows.push({ uid: u.id, name: u.username, value: st.rate, sub: `${st.answered} 题 / ${st.n} 场` });
    } else {
      const st = await one(
        'SELECT COUNT(*) AS n FROM quiz_items i JOIN quiz_sessions s ON s.sid=i.sid WHERE s.user_id=? AND i.chosen IS NOT NULL',
        [u.id]);
      if (st.n < 20) continue;
      rows.push({ uid: u.id, name: u.username, value: st.n, sub: '累计作答' });
    }
  }
  rows.sort((a, b) => b.value - a.value);
  ok(res, {
    sort,
    rows: rows.slice(0, 50).map((r, i) => ({
      rank: i + 1,
      name: r.uid === ctx.user.id || isAdmin ? r.name : maskName(r.name),
      value: r.value, sub: r.sub, mine: r.uid === ctx.user.id,
    })),
  });
}

export default [
  { method: 'GET', path: '/api/state', auth: 'user', handler: getState },
  { method: 'POST', path: '/api/state', auth: 'user', handler: postState },
  { method: 'POST', path: '/api/sessions', auth: 'user', handler: createSession },
  { method: 'GET', path: '/api/sessions', auth: 'user', handler: listSessions },
  { method: 'GET', path: '/api/sessions/:sid', auth: 'user', handler: getSession },
  { method: 'POST', path: '/api/sessions/:sid/items', auth: 'user', handler: answerItem },
  { method: 'POST', path: '/api/sessions/:sid/finish', auth: 'user', handler: finishSession },
  { method: 'DELETE', path: '/api/sessions/:sid', auth: 'user', handler: deleteSession },
  { method: 'GET', path: '/api/weights', auth: 'user', handler: weights },
  { method: 'GET', path: '/api/stats', auth: 'user', handler: stats },
  { method: 'GET', path: '/api/leaderboard', auth: 'user', handler: leaderboard },
];
