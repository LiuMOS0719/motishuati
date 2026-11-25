let curResult = null;
async function openResult(sid){
  const s = sessions.find(x=>x.id===sid) || (cur && cur.id===sid ? cur : null);
  if(!s){ alert('找不到这次练习'); return; }
  curResult = s;
  await ensureQuestions(s.qids);       // 错题明细要用题干/解析，按需拉取
  const right = s.items.filter(i=>i.correct).length;
  const ans = s.items.length;
  const total = s.qids.length;
  const acc = ans ? Math.round(right/ans*100) : 0;
  // 折算分：按整场总题数算，未答按 0 分计（不能拿"已答题数"当分母，否则答 1 题对 1 题就是满分）
  const score40 = total ? Math.round(right / total * 40) : 0;
  const passLine = 26;
  $('#resMeta').textContent = `${srcLabelOf(s)} · ${s.mode==='random'?'随机':'顺序'} · ${fmtTime(s.ts)}`;
  $('#scoreBox').innerHTML = `
    <div class="bigscore ${scoreClass(acc)}"><b>${acc}%</b><span>已答正确率</span></div>
    <div>
      <div style="font-size:15px;margin-bottom:6px">共 ${total} 题，已答 <b>${ans}</b>，答对 <b style="color:var(--ok)">${right}</b>，答错 <b style="color:var(--bad)">${ans-right}</b></div>
      <div class="hint">按 40 题制折算 <b style="color:${score40>=passLine?'var(--ok)':'var(--bad)'}">${score40} 分</b>（及格线 ${passLine} 分，未答按 0 分计）${ans>=15?(score40>=passLine?' · 已达及格线':' · 未达及格线'):' · 已答不足 15 题，仅供参考'}</div>
    </div>`;
  renderReviewBox();
  // 错题明细
  const wl = $('#wrongList');
  const wrongs = s.items.filter(i=>!i.correct);
  $('#wrongCount').textContent = wrongs.length ? `（${wrongs.length} 题）` : '';
  if(!wrongs.length){ wl.innerHTML = '<div class="empty">本次没有错题</div>'; }
  else{
    wl.innerHTML = '';
    wrongs.forEach((it,idx)=>{
      const q = QS[it.qid]; if(!q) return;
      const d = document.createElement('div');
      d.className = 'wrongitem';
      d.style.cursor = 'pointer';
      const perm = (s.perms && s.perms[it.qid]) ? s.perms[it.qid] : null;
      const toShown = k=>{ if(!perm) return k; const i = perm.indexOf(k); return i>=0 ? LETTERS[i] : k; };
      d.innerHTML = `<div class="wk">${idx+1}</div>
        <div style="flex:1">
          <div><b>${(q.refs&&q.refs.length>1)?q.refs.join('/'):q.papers+'-'+q.no}</b> <span class="hint">${q.lo} · ${q.k_level}</span> <span class="hint">（点开看解析）</span></div>
          <div style="color:#c7d0db;margin:4px 0">${(q && q.stem) ? esc(q.stem.replace(/\n/g,' ').slice(0,90))+'…' : ''}</div>
          <div class="hint">你选 ${it.chosen.map(toShown).sort().join('、')||'—'} ｜ 正确 ${q.answer.map(toShown).sort().join('、')}${perm?'（选项已乱序）':''}</div>
        </div>`;
      d.onclick = ()=>{
        const old = d.querySelector('.wdetail');
        if(old){ old.remove(); return; }
        const box = document.createElement('div');
        box.className = 'wdetail';
        box.style.cssText = 'margin-top:10px;padding:11px 13px;background:var(--panel2);border-radius:9px;white-space:pre-wrap;font-size:13px;line-height:1.85;color:#c7d0db';
        box.textContent = '【完整题干】\n' + q.stem
          + '\n\n【正确答案】' + q.answer.map(toShown).sort().join('、')
          + '\n\n【官方解析】\n' + remapExplain(q.explain || '（无）', perm)
          + (perm ? '\n\n（本题选项已乱序，以上字母对应当前显示的编号）' : '');
        d.querySelector('div[style*="flex:1"]').appendChild(box);
      };
      wl.appendChild(d);
    });
  }
  showPage('pgResult');
}
function renderReviewBox(){
  const box = $('#reviewBox');
  const s = curResult;
  if(!s.review || !s.review.length){ box.className='hint'; box.textContent='还没有生成评价'; return; }
  box.className='';
  box.innerHTML = '';
  s.review.forEach(m=>{
    if(m.role === 'me'){
      const d = document.createElement('div');
      d.className = 'msg me';
      d.style.maxWidth = '100%';
      d.textContent = m.content;
      box.appendChild(d);
    }else{
      const b = document.createElement('div');
      b.className = 'aibadge';
      b.textContent = 'AI 生成 · 仅供参考';
      box.appendChild(b);
      const d = document.createElement('div');
      d.className = 'msg ai';
      d.style.maxWidth = '100%';
      d.innerHTML = mdSafe(m.content);
      box.appendChild(d);
    }
  });
}
async function generateReview(){
  const s = curResult;
  const ans = s.items.length;
  if(!ans){ alert('这次没有作答记录，先做几道题'); return; }
  const right = s.items.filter(i=>i.correct).length;
  const wrong = s.items.filter(i=>!i.correct).map(i=>i.qid);
  const chosen = {};
  s.items.forEach(i=>{ chosen[i.qid] = i.chosen; });
  const btn = $('#genReview'); btn.disabled = true; btn.textContent = '生成中…';
  try{
    const hist = (s.review||[]).slice(-8);
    const r = await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({bank: state.curBank, model: aiModel, stats:{total:s.qids.length, answered:ans, right, wrong:ans-right,
        accuracy:+(right/ans*100).toFixed(1)}, wrong, chosen, history: hist})}).then(x=>x.json());
    if(r.ok){
      s.review = s.review || [];
      s.review.push({role:'ai', content:r.answer});
      const i = sessions.findIndex(x=>x.id===s.id); if(i>=0) sessions[i]=JSON.parse(JSON.stringify(s));
      saveSessions();
      renderReviewBox();
      $('#reviewHint').textContent = `本次消耗 ${r.prompt_tokens}+${r.completion_tokens} token`;
    } else alert(r.error || '生成失败，请稍后重试');
  }catch(e){ alert('网络不通，检查网络后再试'); console.warn(e); }
  btn.disabled = false; btn.textContent = '生成 / 重新生成评价';
}
$('#genReview').onclick = generateReview;
$('#reviewSend').onclick = async ()=>{
  const s = curResult;
  const t = $('#reviewAsk').value.trim();
  if(!t) return;
  if(!s.review || !s.review.length){ alert('先点上面的「生成评价」，再追问'); return; }
  s.review.push({role:'me', content:t});
  $('#reviewAsk').value=''; renderReviewBox();
  const ans = s.items.length, right = s.items.filter(i=>i.correct).length;
  const r = await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({bank: state.curBank, model: aiModel, stats:{total:s.qids.length, answered:ans, right, wrong:ans-right,
      accuracy:+(right/ans*100).toFixed(1)},
      wrong: s.items.filter(i=>!i.correct).map(i=>i.qid),
      chosen: Object.fromEntries(s.items.map(i=>[i.qid,i.chosen])),
      history: s.review.slice(-8)})}).then(x=>x.json());
  if(r.ok){
    s.review.push({role:'ai', content:r.answer});
    const i = sessions.findIndex(x=>x.id===s.id); if(i>=0) sessions[i]=JSON.parse(JSON.stringify(s));
    saveSessions(); renderReviewBox();
    $('#reviewHint').textContent = `本次消耗 ${r.prompt_tokens}+${r.completion_tokens} token`;
  } else alert(r.error || 'AI 暂时没有回应，请重试');
};
$('#backHome').onclick = ()=>{ showPage('pgHome'); renderHome(); };




/* ================= AI 抽屉（每题对话，跨场次保留） ================= */
/* 抽屉开着时切题：标题和对话跟着换成当前这道题的 */

