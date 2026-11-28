// AI：单题答疑 / 整场评价 / 模型与计费
import { query, one } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { ok, fail } from '../core/respond.js';
import { validate } from '../core/validate.js';
import { now, isPeak } from '../lib/time.js';
import { config } from '../config.js';
import { decodeOptions, decodeAnswer } from '../lib/qfmt.js';

const TIMEOUT = 120000;

async function callDeepSeek(messages, { maxTokens = 900, temperature = 0.3 } = {}) {
  if (!config.deepseek.key) return { ok: false, error: '服务端未配置 AI 密钥' };
  try {
    const r = await fetch(config.deepseek.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.deepseek.key },
      body: JSON.stringify({
        model: config.deepseek.model, messages,
        max_tokens: maxTokens, temperature, stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: (j.error && j.error.message) || ('上游返回 ' + r.status) };
    }
    const u = j.usage || {};
    return {
      ok: true,
      answer: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '',
      prompt_tokens: u.prompt_tokens || 0,
      completion_tokens: u.completion_tokens || 0,
      cache_hit_tokens: (u.prompt_cache_hit_tokens || 0),
      cache_miss_tokens: (u.prompt_cache_miss_tokens || (u.prompt_tokens || 0)),
    };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'AI 响应超时' : String(e.message || e) };
  }
}

async function callGLM(messages, { maxTokens = 600 } = {}) {
  if (!config.zai.key) return { ok: false, error: '服务端未配置 GLM 密钥' };
  try {
    const r = await fetch(config.zai.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.zai.key },
      body: JSON.stringify({
        model: config.zai.model, messages, max_tokens: maxTokens,
        temperature: 0.3, thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (j.error && j.error.message) || ('上游返回 ' + r.status) };
    const u = j.usage || {};
    return {
      ok: true,
      answer: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '',
      prompt_tokens: u.prompt_tokens || 0,
      completion_tokens: u.completion_tokens || 0,
      cache_hit_tokens: 0, cache_miss_tokens: u.prompt_tokens || 0,
    };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'AI 响应超时' : String(e.message || e) };
  }
}

// 元 → token（1 token = 0.000001 元）
function calcCost(modelRow, usage, peak) {
  if (!modelRow || !modelRow.billable) return 0;
  const pHit = peak ? modelRow.peak_in_hit : modelRow.price_in_hit;
  const pMiss = peak ? modelRow.peak_in_miss : modelRow.price_in_miss;
  const pOut = peak ? modelRow.peak_out : modelRow.price_out;
  const hit = Number(usage.cache_hit_tokens || 0);
  const miss = Number(usage.cache_miss_tokens || (usage.prompt_tokens || 0));
  const out = Number(usage.completion_tokens || 0);
  // 单价是「元/百万 token」，换算成 token 本位（1 token = 1e-6 元）
  const yuan = (hit * Number(pHit || 0) + miss * Number(pMiss || 0) + out * Number(pOut || 0)) / 1e6;
  return Math.max(0, Math.round(yuan * 1e6));
}

async function balance(uid) {
  const r = await one('SELECT tokens, quota FROM users WHERE id=?', [uid]);
  return r || { tokens: 0, quota: 0 };
}

// 问题相关性预检（用免费的 GLM，失败就放行）
async function checkRelevance(qid, question) {
  if (!config.zai.key) return true;
  const q = await one('SELECT stem FROM questions WHERE id=?', [qid]);
  if (!q) return true;
  const sys = '你是助教。判断学生的问题是否与给定题目相关。只回答“是”或“否”，不要解释。';
  const user = `题目：${String(q.stem).slice(0, 600)}\n\n学生问题：${String(question).slice(0, 300)}`;
  const r = await callGLM([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 8 });
  if (!r.ok) return true;
  return !/^否/.test(String(r.answer || '').trim());
}

function buildAskMessages(q, question, answered, history, perm) {
  const objs = decodeOptions(q.options_json);
  const order = Array.isArray(perm) && perm.length === objs.length ? perm : objs.map((_, i) => i);
  let text = `题干：${q.stem}\n\n选项：\n`;
  order.forEach((idx, pos) => {
    if (objs[idx] !== undefined) text += `${String.fromCharCode(65 + pos)}. ${objs[idx].t}\n`;
  });
  // 正确答案按展示顺序标号
  const want = decodeAnswer(q.answer_json);
  const answerText = order
    .map((idx, pos) => ({ key: objs[idx] ? objs[idx].k : '', label: String.fromCharCode(65 + pos), t: objs[idx] ? objs[idx].t : '' }))
    .filter(x => want.includes(x.key))
    .map(x => `${x.label}. ${x.t}`).join('；');
  if (answered) {
    text += `\n正确答案：${answerText}\n官方解析：${q.explain || '（无）'}\n`;
  }
  const msgs = [{
    role: 'system',
    content: '你是 ISTQB 基础级（CTFL）助教。回答要短、准、口语化，用中文。'
      + '优先解释「为什么这么选」和「错项错在哪」。不要编造题干里没有的信息。'
      + (answered ? '' : '学生还没作答，不要直接给出答案，只做思路提示。'),
  }];
  for (const h of (Array.isArray(history) ? history.slice(-8) : [])) {
    msgs.push({ role: h.role === 'ai' ? 'assistant' : 'user', content: String(h.content || '').slice(0, 2000) });
  }
  msgs.push({ role: 'user', content: text + '\n\n学生问题：' + question });
  return msgs;
}

async function ask({ ctx, res, body }) {
  const v = validate(body, { qid: 'str', question: 'str' });
  if (!v.ok) return fail(res, 400, 'BAD_PARAM', v.message);
  const { qid, question } = v.value;
  const sidExt = String(body.session_id || '').slice(0, 64);
  const answered = !!body.answered;
  const wantDeepSeek = String(body.model || '').toLowerCase() !== 'glm';

  const q = await one('SELECT id, course_id, stem, options_json, answer_json, `explain` FROM questions WHERE id=?', [qid]);
  if (!q) return fail(res, 404, 'NOT_FOUND', '没有这道题');

  const modelId = wantDeepSeek ? config.deepseek.modelId : config.zai.modelId;
  const modelRow = await one('SELECT * FROM ai_models WHERE id=?', [modelId]);
  const bal = await balance(ctx.user.id);

  if (wantDeepSeek && !config.deepseek.key) return fail(res, 503, 'AI_OFF', '服务端未启用 AI');
  if (wantDeepSeek && modelRow && modelRow.billable && bal.tokens <= 0) {
    return fail(res, 402, 'NO_TOKENS', 'AI 余额不足。可以切到 GLM（免费），或联系管理员充值');
  }

  if (sidExt) {
    const rel = await checkRelevance(qid, question);
    if (!rel) {
      return ok(res, { blocked: true, model: 'glm', message: '这个问题和当前这道题无关，AI 不回答' });
    }
  }

  const msgs = buildAskMessages(q, question, answered, body.history, body.perm);
  const r = wantDeepSeek ? await callDeepSeek(msgs) : await callGLM(msgs);
  if (!r.ok) return fail(res, 502, 'UPSTREAM', r.error || 'AI 调用失败');

  const peak = isPeak();
  const cost = calcCost(modelRow, r, peak);
  let tokensLeft = bal.tokens;

  await withTx(async (con) => {
    const [sessRow] = sidExt
      ? await con.query('SELECT sid FROM quiz_sessions WHERE user_id=? AND ext_id=?', [ctx.user.id, sidExt])
      : [[]];
    const sid = sessRow && sessRow[0] ? sessRow[0].sid : null;
    const usageSid = sid === null ? 0 : sid;   // ask_usage.sid 是 NOT NULL，无场次记 0

    await con.query(
      'INSERT INTO ai_messages(user_id,course_id,sid,qid,scope,role,model,content,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      [ctx.user.id, q.course_id, sid, qid, 'ask', 'me', null, question, now()]);
    const [ins] = await con.query(
      `INSERT INTO ai_messages(user_id,course_id,sid,qid,scope,role,model,content,prompt_tokens,
         completion_tokens,tokens_cost,latency_ms,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ctx.user.id, q.course_id, sid, qid, 'ask', 'ai', wantDeepSeek ? 'deepseek' : 'glm', r.answer,
        r.prompt_tokens, r.completion_tokens, cost, null, now()]);

    if (cost > 0) {
      await con.query('UPDATE users SET tokens=GREATEST(tokens-?,0) WHERE id=?', [cost, ctx.user.id]);
      const [b] = await con.query('SELECT tokens FROM users WHERE id=?', [ctx.user.id]);
      tokensLeft = b[0].tokens;
    }
    await con.query(
      `INSERT INTO ask_usage(user_id,sid,qid,model,cnt,first_ts,last_ts) VALUES(?,?,?,?,1,?,?)
       ON DUPLICATE KEY UPDATE cnt=cnt+1, last_ts=VALUES(last_ts)`,
      [ctx.user.id, usageSid, qid, wantDeepSeek ? 'deepseek' : 'glm', now(), now()]);
    return ins.insertId;
  });

  ok(res, {
    answer: r.answer,
    model: wantDeepSeek ? 'deepseek' : 'glm',
    charged: cost > 0,
    tokens_cost: cost,
    tokens: tokensLeft,
    quota: bal.quota,
    prompt_tokens: r.prompt_tokens,
    completion_tokens: r.completion_tokens,
    peak,
  });
}

async function review({ ctx, res, body }) {
  const wantDeepSeek = String(body.model || '').toLowerCase() !== 'glm';
  const modelId = wantDeepSeek ? config.deepseek.modelId : config.zai.modelId;
  const modelRow = await one('SELECT * FROM ai_models WHERE id=?', [modelId]);
  const bal = await balance(ctx.user.id);
  if (wantDeepSeek && modelRow && modelRow.billable && bal.tokens <= 0) {
    return fail(res, 402, 'NO_TOKENS', 'AI 余额不足');
  }

  const courseId = body.course || 'ctfl';
  const course = await one('SELECT name, review_context FROM courses WHERE id=?', [courseId]);
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const right = Number(body.right || 0);
  const answered = Number(body.answered || 0);
  const wrong = Array.isArray(body.wrongList) ? body.wrongList.slice(0, 20) : [];
  const histRef = body.history_ref || null;

  let prompt = `课程：${course ? course.name : courseId}\n`;
  prompt += `本场：共 ${answered} 题，答对 ${right} 题，正确率 ${answered ? Math.round(right / answered * 100) : 0}%。\n`;
  if (sources.length) prompt += `题目来源：${sources.join('、')}\n`;
  if (wrong.length) prompt += `\n错题（题号 / 你的选择 / 正确答案）：\n` + wrong.join('\n') + '\n';
  if (histRef) {
    prompt += `\n【历史累计数据】${histRef.sessions || 0} 场、${histRef.answered || 0} 题，`
      + `累计正确率 ${histRef.right && histRef.answered ? Math.round(histRef.right / histRef.answered * 100) : 0}%。`;
    if (Array.isArray(histRef.chapters) && histRef.chapters.length) {
      prompt += '各章累计正确率（由低到高）：' + histRef.chapters
        .map(c => `${c.name} ${c.rate}%`).join('；');
    }
  }
  const msgs = [
    {
      role: 'system',
      content: (course && course.review_context ? course.review_context + '\n\n' : '')
        + '你是 ISTQB 基础级（CTFL）教练。根据本场结果给复盘：'
        + '1) 一句话总体判断 2) 最该补的 2-3 个薄弱点（点到具体章节/知识点）3) 下一步练习建议。'
        + '用中文，300 字以内，不要罗列题目，不要客套。',
    },
    { role: 'user', content: prompt },
  ];

  const r = wantDeepSeek ? await callDeepSeek(msgs, { maxTokens: 700 }) : await callGLM(msgs, { maxTokens: 700 });
  if (!r.ok) return fail(res, 502, 'UPSTREAM', r.error || 'AI 调用失败');

  const cost = calcCost(modelRow, r, isPeak());
  let sid = null;
  if (body.session_id) {
    const s = await one('SELECT sid FROM quiz_sessions WHERE user_id=? AND ext_id=?',
      [ctx.user.id, String(body.session_id)]);
    sid = s ? s.sid : null;
  }
  await withTx(async (con) => {
    await con.query(
      `INSERT INTO ai_messages(user_id,course_id,sid,qid,scope,role,model,content,prompt_tokens,
         completion_tokens,tokens_cost,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ctx.user.id, courseId, sid, null, 'review', 'ai', wantDeepSeek ? 'deepseek' : 'glm', r.answer,
        r.prompt_tokens, r.completion_tokens, cost, now()]);
    if (cost > 0) {
      await con.query('UPDATE users SET tokens=GREATEST(tokens-?,0) WHERE id=?', [cost, ctx.user.id]);
    }
  });
  const after = await balance(ctx.user.id);
  ok(res, {
    answer: r.answer, model: wantDeepSeek ? 'deepseek' : 'glm',
    tokens_cost: cost, tokens: after.tokens,
    prompt_tokens: r.prompt_tokens, completion_tokens: r.completion_tokens,
  });
}

async function models({ ctx, res }) {
  const rows = await query('SELECT id, display_name, billable FROM ai_models WHERE enabled=1 ORDER BY sort, id');
  ok(res, { rows, peak: isPeak() });
}

async function history({ ctx, res, url }) {
  const qid = url.searchParams.get('qid');
  const sidExt = url.searchParams.get('session_id');
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
  const args = [ctx.user.id];
  let where = 'WHERE user_id=?';
  if (qid) { where += ' AND qid=?'; args.push(qid); }
  if (sidExt) {
    const s = await one('SELECT sid FROM quiz_sessions WHERE user_id=? AND ext_id=?', [ctx.user.id, sidExt]);
    where += s ? ' AND sid=?' : ' AND sid IS NULL';
    if (s) args.push(s.sid);
  }
  const rows = await query(
    `SELECT id, sid, qid, scope, role, model, content, prompt_tokens, completion_tokens, tokens_cost, created_at
     FROM ai_messages ${where} ORDER BY id DESC LIMIT ?`, [...args, limit]);
  ok(res, { rows: rows.reverse() });
}

export default [
  { method: 'POST', path: '/api/ask', auth: 'user', handler: ask },
  { method: 'POST', path: '/api/ai/chat', auth: 'user', handler: ask },
  { method: 'POST', path: '/api/review', auth: 'user', handler: review },
  { method: 'POST', path: '/api/ai/review', auth: 'user', handler: review },
  { method: 'GET', path: '/api/ai/models', auth: 'user', handler: models },
  { method: 'GET', path: '/api/ai/history', auth: 'user', handler: history },
];
