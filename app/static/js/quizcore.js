function shuffleArr(a){
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
/* 把解析里引用的原始选项字母换成乱序后的新字母（只处理 "c)" 和 "选项 C" 这类明确写法） */
function remapExplain(text, perm){
  if(!text) return '';
  // 没有乱序也要按选项拆行（每个 a) b) c) 单独一行）
  if(!perm || perm.length < 2) return reorderExplain(text);
  const oldToNew = {};
  perm.forEach((orig, i)=>{ oldToNew[orig] = LETTERS[i] || orig; });
  let s = text.replace(/\b([A-Ha-h])([)）])/g, (m, ch, br)=>{
    const nk = oldToNew[ch.toUpperCase()];
    if(!nk) return m;
    return (ch === ch.toUpperCase() ? nk : nk.toLowerCase()) + br;
  });
  s = s.replace(/选项\s*([A-D])/g, (m, ch)=>{
    const nk = oldToNew[ch];
    return nk ? ('选项 ' + nk) : m;
  });
  return reorderExplain(s);
}
/* 原始解析是 a) b) c) d) 顺序写的，重映射后顺序会乱，按新字母排回来 */
function reorderExplain(s){
  const re = /(?:^|\s)([a-h])([)）])\s*/g;
  const marks = [];
  let m;
  while((m = re.exec(s)) !== null){
    marks.push({letter: m[1], start: m.index + m[0].length - m[0].trimStart().length, raw: m[0]});
  }
  if(marks.length < 2) return s;
  const head = s.slice(0, marks[0].start).trim();
  const blocks = marks.map((mk, i)=>{
    const end = i + 1 < marks.length ? marks[i+1].start : s.length;
    return {letter: mk.letter, text: s.slice(mk.start, end).trim()};
  });
  blocks.sort((a,b)=>a.letter.localeCompare(b.letter));
  return (head ? head + '\n' : '') + blocks.map(b=>b.text).join('\n');
}
/* 当前题目的显示用选项：乱序时重排并重新编号，ok 保留原始字母用于判题 */
function displayOptions(q){
  const perm = (cur && cur.perms) ? cur.perms[q.id] : null;
  const opts = q.options || [];
  const omap = {};
  opts.forEach(o=>{ omap[o.k] = o.t; });
  // perm 必须覆盖全部选项才生效，否则（老场次/异常数据）按原顺序显示，避免丢选项
  if(perm && perm.length === opts.length && perm.every(k=>omap[k] !== undefined)){
    return perm.map((ok, i)=>({k: LETTERS[i] || ok, ok, t: omap[ok] || ''}));
  }
  return opts.map(o=>({k:o.k, ok:o.k, t:o.t}));
}

function chapterOf(lo){
  const d = (lo||'').replace(/[^0-9]/g,'');
  return d ? d[0] : '?';
}
/* 题目所属章节：优先取库里的 chapter 字段，老数据回退到从 lo 里取 */
function chapterKey(q){
  if(!q) return '?';
  if(q.chapter !== undefined && q.chapter !== null && q.chapter !== '') return String(q.chapter);
  return chapterOf(q.lo);
}
function makeSrcLabel(srcs, brief){
  if(!srcs || !srcs.length) return '未选来源';
  const allKeys = bankPapers().map(p=>p.key);
  if(allKeys.length && srcs.length === allKeys.length && allKeys.every(k=>srcs.includes(k))) return '全部题目';
  if(brief && srcs.length > 3) return `${srcs.length} 个来源`;
  return srcs.map(s=>shortOf(s)).join(' + ');
}
/* 题干 + 图表：题干里写 {{FIG}} 时把图表插到该位置，否则附在题干之后 */
function stemBlock(q){
  const fig = q.figure ? `<div class="fig">${q.figure.html}</div>`
    : (q.image ? `<div class="stem"><img src="/img/${q.image}" alt="原题版面" loading="lazy"></div>` : '');
  const stem = esc(q.stem || '');
  if(fig && stem.indexOf('{{FIG}}') >= 0){
    return stem.split('{{FIG}}').map(t=>`<div class="stem">${t}</div>`).join(fig);
  }
  return `<div class="stem">${stem}</div>` + fig;
}
function srcLabelOf(s, brief){
  if(Array.isArray(s.sources)) return makeSrcLabel(s.sources, brief);
  return SRC_LABEL[s.source] || s.source || '—';
}

function wrongPool(){
  /* 未掌握题集 = 做过的题里「还没掌握」的（2026-11-26 改规则，11-28 改名）：
     答错就进本；答对但权重仍 < MASTERY_MIN（70）留在本里；到 70 才移出。
     答对一次不再直接移出，避免「蒙对一次就漏掉薄弱题」。 */
  const seen = new Set();
  sessions.forEach(s=>(s.items||[]).forEach(it=>seen.add(it.qid)));
  const w = (typeof qWeights === 'function') ? qWeights() : {};
  const min = (typeof MASTERY_MIN === 'number') ? MASTERY_MIN : 70;
  return [...seen].filter(qid => (typeof qWeightOf === 'function' ? qWeightOf(w, qid) : 0) < min);
}
function refNo(q, paper){
  const r = (q.refs || []).find(x=>x.indexOf(paper+'-')===0);
  const s = r || q.id;
  const n = parseInt(String(s).split('-')[1].replace(/[^0-9]/g,''), 10);
  return isNaN(n) ? 999 : n;
}
function poolFor(srcs){
  if(!srcs || !srcs.length) return [];
  const papers = srcs.filter(s=>['A','B','C','D'].includes(s));
  const extra = srcs.includes('EXTRA');
  const chs = srcs.filter(s=>s.indexOf('CH')===0).map(s=>s.slice(2));
  const useWrong = srcs.includes('WRONG');
  if(useWrong) return wrongPool();     // 未掌握题集：单选，不受卷/章条件影响
  const paperSide = papers.length > 0 || extra;
  const chapSide = chs.length > 0;
  let res = allQ.filter(q=>{
    const pq = (q.papers || '').split(',');
    /* 卷这一侧：选中的整卷 或 附加题 */
    const okPaper = !paperSide ? true : (
      (extra && q.is_extra === 1) || (!q.is_extra && papers.some(p=>pq.includes(p)))
    );
    /* 章这一侧：选中的章节 */
    const okChap = !chapSide ? true : chs.includes(chapterKey(q));
    /* 两侧都选时取交集（2026-11-28 从并集改为交集）；只选一侧时行为不变 */
    return okPaper && okChap;
  });
  if(papers.length===1){          // 单卷练习时按该卷原始题号排序（合并题的卷号可能与 id 不同）
    const p = papers[0];
    res.sort((a,b)=>refNo(a,p)-refNo(b,p));
  }
  return res;
}
