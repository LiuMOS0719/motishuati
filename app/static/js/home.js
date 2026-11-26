function refreshPool(){
  const pool = poolFor([...state.sources]);
  const cnt = $('#fCount');
  const want = cnt ? (Number(cnt.value) || 40) : 40;
  // 不改你选的档位：只有题池比档位小时，实际按池子数量出题（提示里说明）
  const el = $('#poolNum'); if(el) el.textContent = pool.length;
  const hint = $('#poolHint');
  if(hint){
    if(!pool.length) hint.textContent = '请至少选择一个来源';
    else if(want > pool.length) hint.textContent = `只有 ${pool.length} 题，按 ${pool.length} 题出`;
    else hint.textContent = `可出 ${pool.length} 题`;
  }
  $('#startBtn').disabled = pool.length===0;
}
const cntSel = $('#fCount');
if(cntSel){
  const onCountChange = ()=>refreshPool();
  cntSel.addEventListener('change', onCountChange);
  cntSel.addEventListener('input', onCountChange);
}
function renderSessions(){
  const box = $('#sessList');
  $('#sessCount').textContent = sessions.length ? `（共 ${sessions.length} 次）` : '';
  if(!sessions.length){ box.innerHTML = '<div class="empty">还没有练习记录</div>'; return; }
  const list = sessions.slice().sort((a,b)=>b.ts-a.ts);
  box.innerHTML = '';
  list.forEach(s=>{
    const right = (s.items||[]).filter(i=>i.correct).length;
    const ans = (s.items||[]).length;
    const acc = ans ? Math.round(right/ans*100) : 0;
    const el = document.createElement('div');
    el.className = 'sess';
    el.innerHTML = `
      <div class="sc ${scoreClass(acc)}">${acc}%</div>
      <div class="mi">
        <b>${srcLabelOf(s)} · ${s.mode==='random'?'随机':'顺序'} · ${s.qids.length} 题</b>
        <div>${fmtTime(s.ts)} · 答对 ${right} / 已答 ${ans}${s.review&&s.review.length?' · 已有 AI 评价':''}</div>
      </div>
      <div class="hint">${s.finished?'查看':''}</div>`;
    el.onclick=async ()=>{ await ensurePageScripts(['/js/ai.js','/js/result.js']); openResult(s.id); };
    if(!s.finished){
      const b=document.createElement('button');
      b.className='btn small';
      b.textContent='继续';
      b.style.marginLeft='10px';
      b.onclick=(e)=>{ e.stopPropagation(); resumeSession(s.id); };
      el.appendChild(b);
    }
    box.appendChild(el);
  });
}
function renderHomeStat(){
  const totalSess = sessions.length;
  const right = sessions.reduce((a,s)=>a+(s.items||[]).filter(i=>i.correct).length,0);
  const ans = sessions.reduce((a,s)=>a+(s.items||[]).length,0);
  $('#homeStat').textContent = totalSess
    ? `${totalSess} 次练习 · 累计作答 ${ans} 题 · 已答正确率 ${ans?Math.round(right/ans*100):0}%`
    : '首次使用，先来一场 40 题吧';
}

/* 题目来源：卷/章节/版权全部来自 banks 表 */
function bankPapers(){ return (state.bank && state.bank.papers) || []; }
function bankChapters(){ return (state.bank && state.bank.chapters) || []; }
function paperLabel(key){
  const p = bankPapers().find(x=>x.key === key);
  return p ? p.label : key;
}
function shortOf(src){
  if(src === 'WRONG') return '错题本';
  if(src === 'EXTRA') return '附加题';
  if(src.indexOf('CH') === 0){
    const c = bankChapters().find(x=>String(x.key) === src.slice(2));
    return c ? (c.full || ('第' + c.key + '章')) : src;
  }
  const l = paperLabel(src);
  const m = l.match(/([A-Za-z0-9])\s*卷/);
  if(m) return m[1] + ' 卷';
  return l.length > 14 ? l.slice(0,14) + '…' : l;
}
function renderBankPicker(){
  const el = $('#bankPick');
  if(!el) return;
  if(!state.banks.length){ el.innerHTML = ''; return; }
  if(state.banks.length === 1){
    el.innerHTML = `<span class="tag" style="font-size:11px">${esc(state.banks[0].short || state.banks[0].name)}</span>`;
    return;
  }
  el.innerHTML = `<select id="bankSel" style="font-size:12px;padding:4px 8px">${
    state.banks.map(b=>`<option value="${esc(b.id)}" ${b.id===state.curBank?'selected':''}>${esc(b.short || b.name)}</option>`).join('')
  }</select>`;
  const sel = $('#bankSel');
  if(sel) sel.onchange = e=>switchBank(e.target.value);
}
async function loadIndex(){
  try{
    const resp = await fetch('/api/index?bank=' + encodeURIComponent(state.curBank),
      {headers: authToken ? {'X-Auth-Token': authToken} : {}});
    if(resp.status === 401){ onAuthExpired(); return false; }
    const idx = await resp.json();
    if(!Array.isArray(idx)) return false;
    allQ = idx;
    Object.keys(QS).forEach(k=>delete QS[k]);
    idx.forEach(q=>QS[q.id] = q);
    return true;
  }catch(e){ return false; }
}
async function switchBank(id){
  state.curBank = id;
  state.bank = state.banks.find(b=>b.id === id) || null;
  localStorage.setItem('moti_bank', id);
  await loadIndex();
  state.sources.clear();
  bankPapers().filter(p=>p.key !== 'EXTRA').forEach(p=>state.sources.add(p.key));
  if(bankPapers().some(p=>p.key === 'EXTRA')) state.sources.add('EXTRA');
  renderSourceOptions(); refreshPool(); renderChapters(); renderBankPicker();
}

function grpBlock(title, items, opts){
  opts = opts || {};
  const d = document.createElement('div');
  d.className = 'msel-grp';
  const h = document.createElement('div');
  h.className = 'msel-h';
  const tt = document.createElement('span');
  tt.textContent = title;
  h.appendChild(tt);
  if(opts.ops){
    const ha = document.createElement('span');
    ha.className = 'msel-ha';
    [['全选', true], ['清空', false]].forEach(([txt, on])=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msel-mini';
      b.textContent = txt;
      b.onclick = e=>{ e.stopPropagation(); setSources(items.filter(it=>!it.dis).map(it=>it.src), on); };
      ha.appendChild(b);
    });
    h.appendChild(ha);
  }
  d.appendChild(h);
  items.forEach(it=>{
    const lab = document.createElement('label');
    lab.className = 'msel-item' + (it.dis ? ' dis' : '');
    lab.innerHTML = `<input type="checkbox" data-src="${it.src}" ${it.dis ? 'disabled' : ''}>
      <span>${it.title}</span><span class="cnt">${it.n} 题</span>`;
    const cb = lab.querySelector('input');
    cb.onchange = ()=>toggleSource(it.src);
    d.appendChild(lab);
  });
  return d;
}
/* 分组批量勾选：全选时清掉错题本（互斥），清空只清本组 */
function setSources(srcs, on){
  if(on){
    srcs.forEach(s=>state.sources.add(s));
    state.sources.delete('WRONG');
  }else{
    srcs.forEach(s=>state.sources.delete(s));
  }
  syncSrcChecks(); refreshPool();
}
function renderSourceOptions(){
  const box = $('#mselGroups');
  if(!box) return;
  box.innerHTML = '';
  const papers = bankPapers();
  const normal = papers.filter(p=>p.key !== 'EXTRA');
  const extra = papers.filter(p=>p.key === 'EXTRA');
  const items = normal.map(p=>({
    src: p.key, title: p.label,
    n: allQ.filter(q=>!q.is_extra && q.papers.split(',').includes(p.key)).length
  })).concat(extra.map(p=>({
    src: 'EXTRA', title: p.label, n: allQ.filter(q=>q.is_extra).length
  })));
  if(items.length) box.appendChild(grpBlock('按整卷（可多选）', items, {ops:true}));
  const chs = bankChapters();
  if(chs.length){
    box.appendChild(grpBlock('按章节（可多选）', chs.map(c=>({
      src: 'CH' + c.key, title: c.full || ('第 ' + c.key + ' 章'),
      n: allQ.filter(q=>chapterKey(q) === String(c.key)).length
    })), {ops:true}));
  }
  const wn = wrongPool().length;
  box.appendChild(grpBlock('错题本（单选，与上面互斥）',
    [{src:'WRONG', title:'错题本（历史做错、还没做对的题）', n: wn, dis: wn === 0}]));
  syncSrcChecks();
}
function syncSrcChecks(){
  document.querySelectorAll('#mselGroups input[type=checkbox]').forEach(cb=>{
    cb.checked = state.sources.has(cb.dataset.src);
    const lab = cb.closest('.msel-item');
    if(lab) lab.classList.toggle('on', cb.checked);
  });
  updateMselText();
  renderCopyrightLine();
}
function updateMselText(){
  const srcs = [...state.sources];
  const n = srcs.length ? poolFor(srcs).length : 0;
  let txt;
  const allKeys = bankPapers().map(p=>p.key);
  const papersAll = allKeys.length > 0 && srcs.length === allKeys.length && allKeys.every(k=>srcs.includes(k));
  if(!srcs.length) txt = '未选择来源';
  else if(papersAll) txt = `全部题目（${n} 题）`;
  else if(srcs.length===1) txt = `${shortOf(srcs[0])}（${n} 题）`;
  else txt = `已选 ${srcs.length} 项 · ${n} 题`;
  const el = $('#mselText');
  if(el) el.textContent = txt;
}
function toggleSource(src){
  if(src === 'WRONG'){
    if(state.sources.has('WRONG')) state.sources.delete('WRONG');
    else { state.sources.clear(); state.sources.add('WRONG'); }
  }else{
    state.sources.delete('WRONG');          // 错题本与其它互斥
    state.sources.has(src) ? state.sources.delete(src) : state.sources.add(src);
  }
  syncSrcChecks(); refreshPool();
}
/* 所选题目版权信息（内容来自 banks 表） */
function renderCopyrightLine(){
  const line = $('#srcCopyLine');
  if(line) line.style.display = state.sources.size ? 'block' : 'none';
}
function openCopyModal(){
  const srcs = [...state.sources];
  if(!srcs.length) return;
  const bank = state.bank || {};
  const papersAll = bankPapers();
  const chs = srcs.filter(s=>s.indexOf('CH') === 0).map(s=>s.slice(2));
  const hasWrong = srcs.includes('WRONG');
  const wanted = new Set();
  srcs.forEach(s=>{ if(s !== 'WRONG' && s.indexOf('CH') !== 0) wanted.add(s); });
  if(hasWrong){
    wrongPool().forEach(id=>{
      const q = QS[id];
      if(q) q.papers.split(',').forEach(p=>wanted.add(p));
    });
  }
  let list = papersAll.filter(p=>wanted.has(p.key));
  if(!list.length) list = papersAll;

  let html = `<div class="hint" style="margin-bottom:11px;line-height:1.8">${esc(bank.copyright_note || '')}</div>`;
  list.forEach(p=>{
    html += `<div class="copyblk">
      <div class="copyttl">${esc(p.copy_name || p.label || p.key)}</div>
      <div class="copymeta">文档编号：${esc(p.doc || '—')}<br>版本：${esc(p.ver || '—')}　发布日期：${esc(p.date || '—')}</div>
    </div>`;
  });
  if(chs.length){
    html += `<div class="copyblk">
      <div class="copyttl">按章节抽取（${chs.map(k=>{
        const c = bankChapters().find(x=>String(x.key) === String(k));
        return c ? (c.full || ('第 '+k+' 章')) : ('第 '+k+' 章');
      }).join('、')}）</div>
      <div class="copymeta">章节归属按题库的章节划分（${esc(bank.name || '')}），题目来自上述各套试卷。</div>
    </div>`;
  }
  if(hasWrong){
    html += `<div class="copyblk">
      <div class="copyttl">错题本</div>
      <div class="copymeta">来自你本人历史答错的题目，原始出处同上。</div>
    </div>`;
  }
  html += `<div class="copyblk" style="border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.06)">
    <div class="copyttl" style="color:#fbbf24">版权声明</div>
    <div class="copymeta" style="white-space:pre-wrap;color:#c7d0db">${esc(bank.copyright || '')}</div>
  </div>`;
  $('#copyBody').innerHTML = html;
  $('#copyModal').classList.add('open');
}
$('#copyLink').onclick = (e)=>{ e.preventDefault(); openCopyModal(); };
$('#copyClose').onclick = ()=>$('#copyModal').classList.remove('open');
$('#copyModal').onclick = e=>{ if(e.target.id==='copyModal') $('#copyModal').classList.remove('open'); };

$('#mselBtn').onclick = (e)=>{ e.stopPropagation(); $('#msel').classList.toggle('open'); };
$('#mselDone').onclick = ()=>$('#msel').classList.remove('open');
document.addEventListener('click', e=>{
  const m = $('#msel');
  if(m && !m.contains(e.target)) m.classList.remove('open');
});
/* #11 全选/清空已下放到各分组标题右侧（见 grpBlock opts.ops） */
$('#fCount').oninput = refreshPool;
document.querySelectorAll('#fMode button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#fMode button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
});
document.querySelectorAll('#fOptOrder button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#fOptOrder button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  state.optOrder = b.dataset.order;
});

/* 从历史里继续一场没做完的练习 */
async function resumeSession(sid){
  const s = sessions.find(x=>x.id===sid);
  if(!s){ alert('找不到这次练习'); return; }
  cur = JSON.parse(JSON.stringify(s));
  cur.finished = false;
  saveCur();
  state.idx = Math.min(s.items.length, s.qids.length-1);
  state.sel.clear();
  await ensurePageScripts(['/js/ai.js','/js/quiz.js']);
  enterQuiz();
}
/* 按需拉取题目正文（首屏只加载轻量索引，节省带宽） */
async function ensureQuestions(ids){
  const need = [...new Set(ids || [])].filter(id=>QS[id] && !QS[id].stem);
  if(!need.length) return true;
  for(let i=0;i<need.length;i+=60){
    const chunk = need.slice(i, i+60);
    try{
      // 带版本号：题库改了只要 bump JS_VER，浏览器缓存自动失效
      const resp = await fetch('/api/questions?ids=' + chunk.join(',') + '&v=' + JS_VER,
        {headers: authToken ? {'X-Auth-Token': authToken} : {}});
      if(resp.status === 401){ onAuthExpired(); return false; }
      const data = await resp.json();
      (Array.isArray(data) ? data : []).forEach(q=>{ QS[q.id] = q; });
    }catch(e){ return false; }
  }
  return true;
}
function onAuthExpired(){
  alert('登录已过期，请重新登录后继续');
  authToken = '';
  localStorage.removeItem('moti_token');
  showPage('pgLogin');
}

/* 单题权重 = 正确率（百分制 0~100）
   口径：只看最近 5 次作答，按 (对+1)/(总+2) 平滑，避免做一次就定生死；
   例外：连对 3 次直接算 100（翻身），连错 2 次直接算 0（打回）。
   没做过的题没有记录 → 权重 0（最优先抽到）。 */
const QW_WINDOW = 5;
const MASTERY_MIN = 70;      // 单题权重 ≥ 这个值算「已掌握」（2026-11-26 用户要求 70% 以上）
function qWeights(){
  const hist = {};
  sessions.slice().sort((a,b)=>a.ts-b.ts).forEach(se=>{
    (se.items||[]).forEach(it=>{
      (hist[it.qid] = hist[it.qid] || []).push(it.correct ? 1 : 0);
    });
  });
  const out = {};
  Object.keys(hist).forEach(qid=>{
    const seq = hist[qid];
    const win = seq.slice(-QW_WINDOW);
    let acc = Math.round((win.reduce((s,x)=>s+x,0) + 1) / (win.length + 2) * 100);
    let streak = 0, kind = null;
    for(let i = seq.length - 1; i >= 0; i--){
      if(kind === null) kind = seq[i];
      if(seq[i] !== kind) break;
      streak++;
    }
    if(kind === 1 && streak >= 3) acc = 100;   // 连对 3 次算掌握
    if(kind === 0 && streak >= 2) acc = 0;     // 连错 2 次打回
    out[qid] = acc;
  });
  return out;
}
function qWeightOf(w, qid){
  const v = w[qid];
  return v === undefined ? 0 : v;              // 没做过 = 0
}

/* 加权抽样（不放回）：权重越低抽中概率越高，抽题权重 1~11 */
function weightedSample(pool, n){
  const w = qWeights();
  const arr = pool.map(q=>({q, w: 1 + Math.round((100 - qWeightOf(w, q.id)) / 10)}));
  const out = [];
  const take = Math.min(n, arr.length);
  for(let k=0;k<take;k++){
    let total = 0;
    for(const x of arr) total += x.w;
    let r = Math.random() * total, idx = 0;
    for(; idx < arr.length; idx++){ r -= arr[idx].w; if(r <= 0) break; }
    if(idx >= arr.length) idx = arr.length - 1;
    out.push(arr[idx].q);
    arr.splice(idx, 1);
  }
  return out;
}

async function startSession(srcs, mode, n){
  let pool = poolFor(srcs);
  if(!pool.length){ alert('这个来源组合没有题目'); return; }
  // 选的档位大于题池时，按题池数量出题
  const cnt = Math.min(Number(n) || 40, 100, pool.length);
  // 随机练习按「做过次数」加权抽样；顺序练习保持原卷顺序
  const picked = mode==='random' ? weightedSample(pool, cnt) : pool.slice(0, cnt);
  // 答案乱序：先确保题目正文已加载，再为每题生成固定的一份乱序表
  let perms = null;
  if(state.optOrder === 'shuffle'){
    await ensureQuestions(picked.map(q=>q.id));
    perms = {};
    picked.forEach(q=>{
      const keys = ((QS[q.id] || {}).options || []).map(o=>o.k);
      perms[q.id] = keys.length > 1 ? shuffleArr(keys.slice()) : keys;
    });
  }
  cur = {
    id: 's'+Date.now(),
    ts: Date.now(),
    sources: srcs.slice(),
    source: srcs.length===1 ? srcs[0] : 'MULTI',
    mode,
    qids: picked.map(q=>q.id),
    items: [],
    finished: false,
    review: []
  };
  if(perms) cur.perms = perms;
  saveCur();
  state.idx = 0; state.sel.clear();
  await ensurePageScripts(['/js/ai.js','/js/quiz.js']);
  enterQuiz();
}
$('#startBtn').onclick = ()=>{
  startSession([...state.sources],
    document.querySelector('#fMode button.on').dataset.mode,
    $('#fCount').value);
};

/* 章节掌握情况：按最近一次作答判对错 */
function renderChapters(){
  const latest = {};
  sessions.slice().sort((a,b)=>a.ts-b.ts).forEach(s=>(s.items||[]).forEach(i=>{ latest[i.qid]=i.correct; }));
  const w = qWeights();                        // 单题权重 = 正确率
  const box = $('#chBox');
  box.innerHTML = '';
  bankChapters().forEach(c=>{
    const n = String(c.key);
    const name = c.full || ('第 ' + n + ' 章');
    const pool = allQ.filter(q=>chapterKey(q) === n);
    const done = pool.filter(q=>latest[q.id] !== undefined);
    // 单题是否掌握：权重（正确率）≥ 70（2026-11-26 由 >75 调整）
    const mq = done.filter(q=>qWeightOf(w, q.id) >= MASTERY_MIN);
    const wq = done.length - mq.length;
    const acc = done.length ? Math.round(mq.length/done.length*100) : 0;   // 掌握率
    // 三段式：绿=已掌握、红=未掌握、灰=还没做
    const pR = pool.length ? mq.length/pool.length*100 : 0;
    const pW = pool.length ? wq/pool.length*100 : 0;
    const pN = pool.length ? (pool.length-done.length)/pool.length*100 : 0;
    // 已掌握 = 掌握率 ≥90% 且该章至少做过一半题
    const mastered = done.length >= Math.ceil(pool.length * 0.5) && acc >= 90;
    const row = document.createElement('div');
    row.className = 'chrow';
    row.innerHTML = `
      <div class="chname"><span class="chntxt">${name}</span>${mastered?'<span class="chmaster">已掌握</span>':''}</div>
      <div class="chbar"><i class="good" style="width:${pR}%"></i><i class="bad" style="width:${pW}%"></i><i class="none" style="width:${pN}%"></i></div>
      <div class="chnum">${done.length}/${pool.length} 题${done.length?` · 掌握 ${acc}%`:' · 未做'}</div>`;
    row.onclick = ()=>{
      if(!pool.length){ alert('这一章暂时没有题目'); return; }
      const mode = document.querySelector('#fMode button.on').dataset.mode;
      startSession(['CH'+n], mode, Math.min(40, pool.length));
    };
    box.appendChild(row);
  });
}

/* ================= 答题页 ================= */

/* sessions 一变 → 页头统计、历史列表、章节掌握自动刷新 */
store.bind('sessions', ()=>{ renderHomeStat(); renderSessions(); renderChapters(); });

/* 回到主页：非数据驱动的部分这里画，数据驱动的交给 store + 后台拉取 */
function renderHome(){
  refreshPool();
  renderSourceOptions();
  renderBankPicker();
  store.set('sessions', sessions);   // 触发统计/历史/章节渲染
  renderUserCard(); renderRank();    // 先用缓存画一版
  loadUserPanels();                  // 拉最新统计（回来后自动重画用户卡/排名/配额）
  loadFeedback();                    // 拉最新反馈（回来后自动重画列表/徽标）
}

async function loadFeedback(force){
  if(!fbCache || force){
    try{
      fbCache = await fetch('/api/feedback',
        {headers: authToken ? {'X-Auth-Token': authToken} : {}}).then(r=>r.json());
    }catch(e){ fbCache = []; }
    if(!Array.isArray(fbCache)) fbCache = [];
    store.set('feedback', fbCache);      // → 自动重画反馈列表与徽标
  }else{
    renderFeedbackList();
  }
}
/* 反馈数据一变，列表/徽标/计数自动刷新 */
store.bind('feedback', list=>{ renderFeedbackList(list); });

function renderFeedbackList(list){
  const arr = list || fbCache || [];
  const n = arr.length;
  const openN = arr.filter(f=>!f.status || f.status==='open').length;
  const cnt = $('#fbCount'); if(cnt) cnt.textContent = n ? `（${openN} 条待处理 / 共 ${n} 条）` : '（暂无）';
  const badge = $('#fbBadge');
  if(badge){ badge.textContent = openN; badge.style.display = openN ? 'inline-block' : 'none'; }
  const box = $('#fbListScroll');
  if(!box) return;
  if(!n){ box.innerHTML = '<div class="empty">还没有反馈记录</div>'; return; }
  box.innerHTML = '';
  arr.forEach(f=>{
    const q = QS[f.qid];
    const st = f.status || 'open';
    const stMap = {
      fixed:  {label:'已处理', style:'background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.4);color:#4ade80'},
      ignored:{label:'已忽略', style:'background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.35);color:#94a3b8'},
      open:   {label:'待处理', style:'background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.4);color:#fbbf24'},
    };
    const stx = stMap[st] || stMap.open;
    const d = document.createElement('div');
    d.className = 'fbrow' + (st !== 'open' ? ' done' : '');
    d.innerHTML = `<div class="ftop"><b>${esc(f.qid)}</b>
        <span class="ftag" style="${stx.style}">${stx.label}</span>
        <span class="ftag">${esc(f.kind||'其他')}</span>
        <span class="hint">${fmtTime(new Date((f.created_at||'').replace(' ','T')).getTime())}${q?' · '+q.lo+' · '+q.k_level:''}</span></div>
      ${f.note?`<div class="fnote">${esc(f.note)}</div>`:''}
      <div class="fstem">${(q && q.stem) ? esc(q.stem.replace(/\n/g,' ').slice(0,72))+'…' : ''}</div>
      <div class="fbacts">
        <button class="qbtn" data-act="view">👁 查看此题</button>
        ${me.is_admin ? `
          <button class="qbtn ok" data-act="fixed">✓ 已处理</button>
          <button class="qbtn no" data-act="ignored">✕ 忽略</button>
        ` : ''}
      </div>`;
    d.querySelectorAll('[data-act]').forEach(btn=>{
      btn.onclick = async ()=>{
        const act = btn.dataset.act;
        if(act === 'view'){ viewQuestion(f.qid); return; }
        btn.disabled = true;
        try{
          const r = await fetch('/api/feedback/status', {
            method:'POST',
            headers:{'Content-Type':'application/json','X-Auth-Token':authToken},
            body: JSON.stringify({id: f.id, status: act})
          }).then(x=>x.json());
          if(r.ok){ await loadFeedback(true); }
          else alert(r.error || '操作失败');
        }catch(e){ alert('网络不通，检查网络后再试'); console.warn(e); }
        finally{ btn.disabled = false; }
      };
    });
    box.appendChild(d);
  });
}

/* 直接预览某道题（题干 + 图 + 选项 + 答案 + 解析） */
async function viewQuestion(qid){
  $('#qviewModal').classList.add('open');
  $('#qvTitle').textContent = '题目预览 · ' + qid;
  $('#qvBody').innerHTML = '<div class="empty">加载中…</div>';
  await ensureQuestions([qid]);
  const q = QS[qid];
  if(!q || !q.stem){ $('#qvBody').innerHTML = '<div class="empty">题目数据加载失败</div>'; return; }
  const ansSet = new Set(q.answer || []);
  $('#qvTitle').textContent = `题目预览 · ${refLabel(q)}${q.lo?' · '+q.lo:''}${q.k_level?' · '+q.k_level:''}`;
  $('#qvBody').innerHTML = `
    ${stemBlock(q)}
    <div class="opts">${(q.options||[]).map(o=>`
      <div class="opt locked ${ansSet.has(o.k)?'right':''}">
        <div class="k">${o.k}</div><div>${esc(o.t)}</div>
      </div>`).join('')}</div>
    <div class="result show" style="margin-top:12px">
      <div class="head ok">官方答案：${(q.answer||[]).join('、')}</div>
      <div class="explain">${esc(remapExplain(q.explain || '（本题无官方解析）', null))}</div>
    </div>`;
}

/* 题目反馈列表（主页页头按钮） */
$('#fbHomeBtn').onclick = async ()=>{
  $('#fbTitle').textContent = me.is_admin ? '题目反馈（全部用户）' : '我的题目反馈';
  $('#fbHint').textContent = me.is_admin
    ? '所有用户提交的题目纠错都在这里，可标记已处理 / 忽略；我可以按它逐条修改。'
    : '你反馈过的题目问题都在这里，管理员处理后状态会更新；在答题页点「⚠ 题目有问题」可以继续提交。';
  $('#fbListModal').classList.add('open');
  await loadFeedback(true);
};
$('#fbListClose').onclick = ()=>$('#fbListModal').classList.remove('open');
$('#fbListModal').onclick = e=>{ if(e.target.id==='fbListModal') $('#fbListModal').classList.remove('open'); };

/* 单题预览弹窗关闭 */
$('#qvClose').onclick = ()=>$('#qviewModal').classList.remove('open');
$('#qviewModal').onclick = e=>{ if(e.target.id==='qviewModal') $('#qviewModal').classList.remove('open'); };
