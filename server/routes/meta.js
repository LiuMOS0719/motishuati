// 题库与元信息：health / domains / courses / index / questions / figures / notice
import { query, one } from '../db/pool.js';
import { ok, fail } from '../core/respond.js';
import { config } from '../config.js';
import { decodeOptions, decodeAnswer, toClientOptions, toClientAnswer } from '../lib/qfmt.js';

const ORDER = 'ORDER BY q.sort';

async function health({ res }) {
  const r = await one('SELECT COUNT(*) AS n FROM questions');
  ok(res, {
    ai: Boolean(config.deepseek.key),
    questions: r.n,
    model: config.deepseek.model,
    glm_model: config.zai.model,
    vlm_model: process.env.VLM_MODEL || 'glm-4v-flash',
    version: 'node-1',
  });
}

async function notice({ res }) {
  const r = await one("SELECT notice_text AS text, notice_active AS active, updated_at FROM site_config WHERE id=1");
  ok(res, {
    text: (r && r.text) || '',
    active: Boolean(r && r.active),
    updated_at: (r && r.updated_at) || '',
  });
}

async function domains({ res }) {
  const rows = await query('SELECT id, name, sort FROM domains ORDER BY sort, id');
  ok(res, { rows });
}

async function courses({ res }) {
  const rows = await query('SELECT id, domain_id, name, short, subtitle, copyright, copyright_note, sort FROM courses ORDER BY sort, id');
  const nodes = await query('SELECT id, course_id, parent_id, code, name, level, sort FROM syllabus_nodes ORDER BY course_id, sort, id');
  const papers = await query('SELECT id, course_id, name, kind, year, source, qcount, sort FROM papers ORDER BY course_id, sort, id');
  ok(res, { rows, nodes, papers });
}

// 轻量索引：不带题干/选项/答案，字段与旧版保持一致
async function index({ res, url }) {
  const courseId = url.searchParams.get('course') || url.searchParams.get('bank') || null;
  const args = [];
  let where = '';
  if (courseId) { where = 'WHERE q.course_id = ?'; args.push(courseId); }
  const rows = await query(`
    SELECT q.id, q.course_id, q.lo, q.k_level, q.stem_hash,
           GROUP_CONCAT(DISTINCT qp.paper_id ORDER BY qp.paper_id) AS papers,
           MIN(qp.no) AS no, MAX(qp.is_extra) AS is_extra,
           GROUP_CONCAT(DISTINCT sn.code ORDER BY sn.code) AS chapters,
           GROUP_CONCAT(DISTINCT qp.no ORDER BY qp.paper_id) AS nos
    FROM questions q
    LEFT JOIN question_papers qp ON qp.course_id=q.course_id AND qp.qid=q.id
    LEFT JOIN question_syllabus qsl ON qsl.course_id=q.course_id AND qsl.qid=q.id
    LEFT JOIN syllabus_nodes sn ON sn.id=qsl.node_id
    ${where}
    GROUP BY q.id, q.course_id, q.lo, q.k_level, q.stem_hash, q.sort
    ${ORDER}`, args);
  ok(res, { rows: rows.map(r => ({
    id: r.id, bank_id: r.course_id, chapter: (r.chapters || '').split(',')[0] || null,
    chapters: r.chapters, papers: r.papers || '', no: r.no, is_extra: r.is_extra || 0,
    lo: r.lo, k_level: r.k_level, refs: [r.id],
  })) });
}

// 题目正文（含图表）：与旧版字段保持兼容
async function questions({ res, url }) {
  const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
  const args = [];
  let where = '';
  if (ids.length) {
    where = `WHERE q.id IN (${ids.map(() => '?').join(',')})`;
    args.push(...ids);
  }
  const rows = await query(`
    SELECT q.id, q.course_id, q.stem, q.options_json, q.answer_json, q.\`explain\`,
           q.lo, q.k_level, q.pts, q.stem_hash,
           GROUP_CONCAT(DISTINCT qp.paper_id ORDER BY qp.paper_id) AS papers,
           MIN(qp.no) AS no, MAX(qp.is_extra) AS is_extra
    FROM questions q
    LEFT JOIN question_papers qp ON qp.course_id=q.course_id AND qp.qid=q.id
    ${where}
    GROUP BY q.id, q.course_id, q.stem, q.options_json, q.answer_json, q.\`explain\`,
             q.lo, q.k_level, q.pts, q.stem_hash, q.sort
    ${ORDER}`, args);
  const figs = await query('SELECT course_id, id, kind, html FROM figures');
  const figMap = {};
  for (const f of figs) {
    const qid = f.id.includes('.') ? f.id.split('.').slice(1).join('.') : f.id;
    figMap[qid] = { kind: f.kind, html: f.html, figId: f.id };
  }
  ok(res, { rows: rows.map(r => {
    const objs = decodeOptions(r.options_json);
    return {
      id: r.id, papers: r.papers || '', no: r.no, is_extra: r.is_extra || 0,
      stem: r.stem,
      options: toClientOptions(objs),
      answer: toClientAnswer(decodeAnswer(r.answer_json), objs),
      explain: r.explain, lo: r.lo, k_level: r.k_level, pts: r.pts,
      kind: 'single', image: '', refs: [r.id],
      figure: figMap[r.id] || null,
    };
  }) });
}

async function figures({ res, url }) {
  const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return ok(res, { rows: [] });
  const rows = await query(
    `SELECT id, kind, html FROM figures WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  ok(res, { rows });
}

export default [
  { method: 'GET', path: '/api/health', auth: null, handler: health },
  { method: 'GET', path: '/api/notice', auth: null, handler: notice },
  { method: 'GET', path: '/api/domains', auth: null, handler: domains },
  { method: 'GET', path: '/api/courses', auth: null, handler: courses },
  { method: 'GET', path: '/api/banks', auth: null, handler: courses },
  { method: 'GET', path: '/api/index', auth: 'user', handler: index },
  { method: 'GET', path: '/api/questions', auth: 'user', handler: questions },
  { method: 'GET', path: '/api/figures', auth: 'user', handler: figures },
];
