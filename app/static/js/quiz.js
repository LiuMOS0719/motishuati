function itemOf(qid){ return cur.items.find(i=>i.qid===qid); }
function renderQuizStat(){
  const right = cur.items.filter(i=>i.correct).length;
  $('#quizStat').textContent = `已答 ${cur.items.length}/${cur.qids.length} · 对 ${right} · 错 ${cur.items.length-right}`;
}
function renderQGrid(){
  const g = $('#qgrid'); g.innerHTML='';
  cur.qids.forEach((qid,i)=>{
    const it = itemOf(qid);
    const d = document.createElement('div');
    d.className = 'cell'+(it?(it.correct?' ok':' no'):'')+(i===state.idx?' cur':'');
    d.textContent = i+1;
    d.onclick = ()=>{ state.idx=i; state.sel.clear(); renderQuiz();
      document.getElementById('qcard').classList.remove('mopen'); };
    g.appendChild(d);
  });
}
function renderQuiz(){
  const c = $('#qcard2');
  renderQuizStat(); renderQGrid();
  if(!cur || !cur.qids.length){ c.innerHTML='<div class="empty">没有题目</div>'; return; }
  const qid = cur.qids[state.idx];
  const q = QS[qid];
  if(!q){ c.innerHTML='<div class="empty">题目数据缺失</div>'; return; }
  if(!q.stem){
    c.innerHTML = '<div class="empty">题目加载中…</div>';
    if(!state.batchLoading && !q._loading){
      q._loading = true;
      ensureQuestions([qid]).then(()=>{ q._loading = false; renderQuiz(); });
    }
    return;
  }
  const it = itemOf(qid);
  const answered = !!it;
  const chosen = answered ? new Set(it.chosen) : state.sel;
  c.innerHTML = `
    <div class="qmeta">
      <span class="tag">第 ${state.idx+1} / ${cur.qids.length} 题</span>
      <span class="tag">${refLabel(q)}</span>
      <span class="tag">${q.lo}</span><span class="tag">${q.k_level}</span>
      <span class="tag">${q.kind==='multi'?'多选':'单选'}</span>
      <button class="fbtag" id="fbBtn" title="题干/选项/图片/答案有问题都可以报">⚠ 题目有问题</button>
    </div>
    ${stemBlock(q)}
    <div class="opts" id="opts"></div>
    <div class="actions">
    ${answered?'':`<button class="btn" id="submitBtn" ${state.sel.size?'':'disabled'}>提交答案</button>`}
    <button class="btn ghost" id="prevBtn" ${state.idx===0?'disabled':''}>上一题</button>
    <button class="btn ghost" id="nextBtn" ${state.idx===cur.qids.length-1?'disabled':''}>下一题</button>
    </div>
    <div class="result ${answered?'show':''}" id="result"></div>`;
  const wrap = $('#opts');
  const shown = displayOptions(q);       // 乱序时已按新顺序并重新编号，ok 是原始字母
  shown.forEach(o=>{
    const el = document.createElement('div');
    el.className = 'opt'+(answered?' locked':'');
    if(chosen.has(o.ok)) el.classList.add(answered?(q.answer.includes(o.ok)?'right':'wrong'):'sel');
    if(answered && q.answer.includes(o.ok) && !chosen.has(o.ok)) el.classList.add('right');
    el.innerHTML = `<div class="k">${o.k}</div><div>${esc(o.t)}</div>`;
    if(!answered) el.onclick = ()=>{
      if(q.kind==='multi'){ state.sel.has(o.ok)?state.sel.delete(o.ok):state.sel.add(o.ok); }
      else { state.sel.clear(); state.sel.add(o.ok); }
      renderQuiz();
    };
    wrap.appendChild(el);
  });
  if(answered) showResult(q, it.correct===1);
  if($('#submitBtn')) $('#submitBtn').onclick = submitAnswer;
  if($('#fbBtn')) $('#fbBtn').onclick = openFeedbackModal;
  if($('#drawer').classList.contains('open')) refreshDrawerFor(qid);
  $('#prevBtn').onclick = ()=>{ if(state.idx>0){ state.idx--; state.sel.clear(); renderQuiz(); } };
  $('#nextBtn').onclick = ()=>{ if(state.idx<cur.qids.length-1){ state.idx++; state.sel.clear(); renderQuiz(); } };
}
function submitAnswer(){
  const qid = cur.qids[state.idx];
  const q = QS[qid];
  if(!state.sel.size) return;
  const chosen = [...state.sel].sort();
  const correct = JSON.stringify(chosen)===JSON.stringify([...q.answer].sort()) ? 1 : 0;
  const exist = itemOf(qid);
  if(exist){ exist.chosen = chosen; exist.correct = correct; }
  else cur.items.push({qid, chosen, correct});
  saveCur();
  state.sel.clear();
  renderQuiz();
}
function showResult(q, ok){
  const el = $('#result'); if(!el) return;
  el.className = 'result show';
  const perm = (cur && cur.perms) ? cur.perms[q.id] : null;
  // 乱序时把正确答案换成新编号、解析里的字母引用也一起换
  const ansShown = perm && perm.length
    ? q.answer.map(k=>{ const i = perm.indexOf(k); return i>=0 ? LETTERS[i] : k; }).sort()
    : q.answer;
  const explain = remapExplain(q.explain || '（本题无官方解析）', perm);
  const note = (perm && perm.length) ? '　<span class="hint">（本题选项已乱序）</span>' : '';
  el.innerHTML = `<div class="head ${ok?'ok':'no'}">${ok?'✓ 回答正确':'✗ 回答错误'}　正确答案：${ansShown.join('、')}${note}</div>
    <div class="explain">${esc(explain)}</div>`;
}
$('#cardBtn').onclick = ()=>document.getElementById('qcard').classList.toggle('mopen');
/* 退出不再弹原生确认：进度已存进历史，主页直接能「继续」，误触也回得去 */
$('#quitBtn').onclick = ()=>{ commitSession(false); showPage('pgHome'); renderHome(); };
$('#finishBtn').onclick = async ()=>{
  const unanswered = cur.qids.length - cur.items.length;
  if(unanswered>0 && !confirm(`还有 ${unanswered} 题没作答，确定结束吗？`)) return;
  commitSession(true);
  await ensurePageScripts(['/js/ai.js','/js/result.js']);
  openResult(cur.id);
};
function commitSession(save){
  if(!cur) return;
  cur.finished = save;
  const exist = sessions.findIndex(s=>s.id===cur.id);
  const copy = JSON.parse(JSON.stringify(cur));
  if(exist>=0) sessions[exist]=copy; else sessions.push(copy);
  saveSessions();
  saveCur();
  pushStateNow();     // 不等 700ms 防抖，立刻同步给服务端，主页的用户卡才是最新数字
}

/* ================= 结果页 ================= */

async function enterQuiz(){
  $('#quizTitle').textContent = `${srcLabelOf(cur, true)} · ${cur.mode==='random'?'随机':'顺序'}`;
  $('#quizTitle').title = srcLabelOf(cur);
  showPage('pgQuiz');
  state.batchLoading = true;
  renderQuiz();                       // 先显示「加载中」占位，避免重复拉单题
  await ensureQuestions(cur.qids);    // 整批拉本场题目正文
  state.batchLoading = false;
  renderQuiz();
}
