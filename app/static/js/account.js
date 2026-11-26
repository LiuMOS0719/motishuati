/* ================= 账号 ================= */
/* ================= 账号 / 用户面板 ================= */
let me = {username:'', is_admin:false, quota:0};
let myStats = null, rankSort = 'accuracy', aiModel = 'glm';
/* 排名本地缓存：{accuracy:{rows,ts}, count:{rows,ts}}，点排序时先用缓存立即渲染，再后台更新 */
let rankCache = {};
const RANK_TTL = 60 * 1000;
function loadRankCache(){
  try{ rankCache = JSON.parse(localStorage.getItem('moti_rank') || '{}') || {}; }catch(e){ rankCache = {}; }
  const s = localStorage.getItem('moti_rank_sort');
  if(s === 'count' || s === 'accuracy') rankSort = s;
}
function saveRankCache(){
  try{ localStorage.setItem('moti_rank', JSON.stringify(rankCache)); }catch(e){}
}
function rankRowsOf(sort){
  const c = rankCache[sort];
  return (c && Array.isArray(c.rows)) ? c.rows : [];
}
async function fetchRank(sort){
  try{
    const r = await fetch('/api/leaderboard?sort=' + sort, {headers:{'X-Auth-Token':authToken}}).then(x=>x.json());
    if(r && r.ok){
      rankCache[sort] = {rows: r.rows || [], ts: Date.now()};
      saveRankCache();
      if(rankSort === sort) store.set('rank', {sort, rows: r.rows || []});   // → 自动重画排名
    }
  }catch(e){}
}

async function loadDsBalance(){
  if(!me.is_admin) return;
  const el = $('#dsBalance');
  if(!el) return;
  // 先用本地缓存
  try{
    const c = JSON.parse(localStorage.getItem('moti_dsbal') || 'null');
    if(c && c.ok && Date.now() - (c.ts || 0) < 300000) renderDsBalance(c);
  }catch(e){}
  try{
    const r = await fetch('/api/admin/deepseek-balance', {headers:{'X-Auth-Token':authToken}}).then(x=>x.json());
    if(r && r.ok){
      r.ts = Date.now();
      try{ localStorage.setItem('moti_dsbal', JSON.stringify(r)); }catch(e){}
      renderDsBalance(r);
    }else if(r && r.error){
      const el2 = $('#dsBalance');
      el2.style.display = 'inline-flex';
      el2.style.color = 'var(--dim)';
      el2.textContent = 'DeepSeek 余额查询失败';
      el2.title = r.error;
    }
  }catch(e){}
}
function renderDsBalance(r){
  const el = $('#dsBalance');
  if(!el || !r || !r.ok) return;
  const num = parseFloat(r.total) || 0;
  el.style.display = 'inline-flex';
  el.style.color = num < 5 ? 'var(--bad)' : '#4ade80';
  el.innerHTML = `<span style="font-weight:600">DeepSeek ¥${r.total}</span>`;
  el.title = `DeepSeek 账户余额\n可用：${r.available ? '是' : '否'}\n币种：${r.currency}\n累计充值：¥${r.topped_up}｜赠金：¥${r.granted}\n查询时间：${r.fetched_at}（5 分钟缓存）`;
}
async function loadUserPanels(){
  // 先等状态推送落地，否则读到的还是推送前的旧统计（这就是“慢一拍”的竞态）
  try{ await lastPushPromise; }catch(e){}
  try{
    const s = await fetch('/api/user/stats', {headers:{'X-Auth-Token':authToken}}).then(r=>r.json());
    if(s && s.ok){
      me.quota = s.quota;
      me.is_admin = !!s.is_admin;
      store.set('stats', s);          // → 自动重画用户卡 / 排名 / 配额
    }
  }catch(e){}
  $('#adminBtn').style.display = me.is_admin ? 'inline-block' : 'none';
  /* 「⚠ 题目反馈」列表入口仅管理员可见（普通用户只在答题页提交单题反馈，不看列表） */
  $('#fbHomeBtn').style.display = me.is_admin ? 'inline-block' : 'none';
  /* 「📝 记录」只在管理员可见；notes.js 不在首屏加载，点开或进站时才拉（普通用户永远不拉） */
  document.querySelectorAll('.noteBtn').forEach(b=>{
    b.style.display = me.is_admin ? 'inline-block' : 'none';
    if(!me.is_admin) return;
    b.onclick = async (e)=>{
      e.preventDefault();
      try{
        await ensurePageScripts(['/js/notes.js']);
        if(typeof openNoteModal === 'function') openNoteModal();
      }catch(err){ console.warn('[notes] load failed', err); }
    };
  });
  if(me.is_admin) ensurePageScripts(['/js/notes.js'])
    .then(()=>{ if(typeof loadNoteBadge === 'function') loadNoteBadge(); })
    .catch(()=>{});
  // 排名缓存过期就后台更新（不阻塞界面）
  ['accuracy','count'].forEach(s=>{
    const c = rankCache[s];
    if(!c || !c.ts || Date.now() - c.ts > RANK_TTL) fetchRank(s);
  });
}
/* stats 一变，这三处自动刷新 */
store.bind('stats', s=>{ myStats = s; renderUserCard(); renderRank(); updateQuotaUI(); });
function renderUserCard(){
  const s = myStats || {};
  $('#userCard').innerHTML = `
    <h2 style="font-size:14px;display:flex;align-items:center;gap:6px">${esc(me.username)}
      ${me.is_admin?'<span class="tag" style="color:#fbbf24;border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.1)">管理员</span>':''}</h2>
    <div class="ustat"><span>做题次数</span><b>${s.sessions||0}</b></div>
    <div class="ustat"><span>累计答题</span><b>${s.answered||0}</b></div>
    <div class="ustat"><span>已答正确率</span><b>${s.accuracy||0}%</b></div>
    <div class="ustat"><span>答对 / 答错</span><b>${s.right||0} / ${s.wrong||0}</b></div>
    <div class="ustat"><span>DeepSeek 剩余</span><b style="color:${(me.quota||0)>0?'#4ade80':'#f87171'}">${me.quota||0} 次</b></div>
    <div class="ustat"><span>AI 提问总次数</span><b>${s.ai_ask_total||0}</b></div>`;
}
function renderRank(){
  const box = $('#rankCard');
  box.innerHTML = `<h2 style="font-size:14px;display:flex;align-items:center;gap:6px">用户排名
      <span style="margin-left:auto;display:flex;gap:4px">
        <button class="qbtn" data-sort="accuracy" style="${rankSort==='accuracy'?'border-color:var(--acc);color:#cfe0ff':''}">近 200 场正确率</button>
        <button class="qbtn" data-sort="count" style="${rankSort==='count'?'border-color:var(--acc);color:#cfe0ff':''}">题量</button>
      </span></h2>`;
  const rows = rankRowsOf(rankSort);
  const wrap = document.createElement('div');
  if(!rows.length){
    wrap.innerHTML = '<div class="empty">暂无数据</div>';
  }else{
    rows.forEach((r,i)=>{
      const d = document.createElement('div');
      const imMe = r.mine !== undefined ? r.mine : (r.username === me.username);
      d.className = 'rankrow' + (imMe ? ' me' : '');
      d.innerHTML = `<span class="rankno">${i+1}</span>
        <span class="rankname">${esc(r.name || r.username || '')}${r.is_admin?' ⚙':''}</span>
        <span class="rankval">${rankSort==='count' ? (r.answered||0)+' 题' : (r.accuracy||0)+'%'}</span>`;
      wrap.appendChild(d);
    });
  }
  box.appendChild(wrap);
  box.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{
    const s = b.dataset.sort;
    if(s === rankSort) return;
    rankSort = s;
    try{ localStorage.setItem('moti_rank_sort', s); }catch(e){}
    renderRank();          // 先用本地缓存立即切换，不等网络
    fetchRank(s);          // 再后台拉最新，回来后自动重绘
  });
}
function updateQuotaUI(){
  const el = $('#dsQuota'); if(el) el.textContent = me.quota;
}
document.querySelectorAll('#modelRow .mbtn').forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll('#modelRow .mbtn').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    aiModel = b.dataset.model;
  };
});

/* 管理员：用户管理 */
async function loadAdmin(){
  const box = $('#adminList');
  box.innerHTML = '<div class="hint">加载中…</div>';
  let r = {};
  try{ r = await fetch('/api/admin/users',{headers:{'X-Auth-Token':authToken}}).then(x=>x.json()); }
  catch(e){ r = {ok:false, error:e.message}; }
  if(!r.ok){ box.innerHTML = '<div class="empty">'+esc(r.error||'加载失败')+'</div>'; return; }
  box.innerHTML = '';
  r.rows.forEach(u=>{
    const d = document.createElement('div');
    d.className = 'adminrow';
    d.innerHTML = `<span class="an">${esc(u.username)}${u.is_admin?' ⚙':''}</span>
      <span class="am">剩余 <b style="color:var(--txt)">${u.quota}</b> 次 · 已用 ${u.ai_deepseek_questions} 题 · 提问共 ${u.ai_ask_total} 次 · 单题最多 <b style="color:var(--warn)">${u.ai_max_per_question}</b> 次${u.ai_max_qid?`（<b style="color:var(--warn)">${esc(u.ai_max_qid)}</b>）`:''} · 作答 ${u.answered} 题</span>
      <span style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="qbtn" data-d="-5">−5</button>
        <button class="qbtn" data-d="-1">−1</button>
        <button class="qbtn" data-d="1">+1</button>
        <button class="qbtn" data-d="5">+5</button>
        <button class="qbtn" data-set="50">重置 50</button>
      </span>
      ${(u.ai_top && u.ai_top.length) ? `<div style="width:100%;font-size:11.5px;color:var(--dim);margin-top:4px">
        提问最多的题：${u.ai_top.map(t=>`${esc(t.qid)}×${t.cnt}${t.model==='glm'?'(GLM)':''}`).join('、')}</div>` : ''}`;
    d.querySelectorAll('[data-d],[data-set]').forEach(b=>b.onclick = async ()=>{
      const delta = b.dataset.set ? (Number(b.dataset.set) - u.quota) : parseInt(b.dataset.d,10);
      if(!delta) return;
      await fetch('/api/admin/quota',{method:'POST',
        headers:{'Content-Type':'application/json','X-Auth-Token':authToken},
        body:JSON.stringify({username:u.username, delta})});
      await loadAdmin(); loadUserPanels();
    });
    box.appendChild(d);
  });
}
$('#adminBtn').onclick = ()=>{ $('#adminModal').classList.add('open'); loadAdmin(); };
$('#adminClose').onclick = ()=>$('#adminModal').classList.remove('open');
$('#adminModal').onclick = e=>{ if(e.target.id==='adminModal') $('#adminModal').classList.remove('open'); };

async function syncFromServer(){
  try{
    const st = await fetch('/api/state', {headers:{'X-Auth-Token':authToken}}).then(r=>r.json());
    if(!st.ok) return false;
    const hasServer = (st.sessions||[]).length>0 || Object.keys(st.chats||{}).length>0;
    const hasLocal = sessions.length>0 || Object.keys(chats).length>0;
    if(hasServer){
      sessions = st.sessions||[];
      chats = st.chats||{};
      cur = st.current||null;
      localStorage.setItem(LS_SESS, JSON.stringify(sessions));
      localStorage.setItem(LS_CHAT, JSON.stringify(chats));
      localStorage.setItem(LS_CUR, cur ? JSON.stringify(cur) : 'null');
    } else if(hasLocal){
      pushState();     // 账号里还是空的：把本机已有的历史迁上去
    }
    return true;
  }catch(e){ return false; }
}
async function enterApp(username){
  $('#whoami').textContent = username;
  me.username = username;
  /* 同一个浏览器换账号：本地缓存是上一个账号的，必须丢掉。
     否则 syncFromServer() 会把它当成「本机历史」推到新账号，新账号就从旧数据开始了。 */
  const prevOwner = localStorage.getItem(LS_OWNER) || '';
  if(prevOwner && prevOwner !== username){
    sessions = []; chats = {}; cur = null;
    localStorage.setItem(LS_SESS, '[]');
    localStorage.setItem(LS_CHAT, '{}');
    localStorage.removeItem(LS_CUR);
    try{ if(typeof fbCache !== 'undefined') fbCache = null; }catch(e){}
    try{ if(typeof myStats !== 'undefined') myStats = null; }catch(e){}
  }
  localStorage.setItem(LS_OWNER, username);
  // 这三个请求互不依赖，并行发出（原来串行要 3 个网络往返）
  await Promise.all([
    loadIndex(),
    fetch('/api/me', {headers:{'X-Auth-Token':authToken}})
      .then(r=>r.json())
      .then(m=>{ if(m && m.ok){ me.is_admin = !!m.is_admin; me.quota = m.quota; } })
      .catch(()=>{}),
    syncFromServer(),
  ]);
  if(cur && cur.qids.length && !sessions.some(s=>s.id===cur.id)){
    const copy = JSON.parse(JSON.stringify(cur));
    copy.finished = false;
    sessions.push(copy);
    saveSessions();
  }
  renderHome();
  showPage('pgHome');
  loadUserPanels();
  loadDsBalance();
  // 数据自动同步：页面可见时每 45 秒拉一次；切回标签页立刻拉
  if(!window._syncTimer){
    const syncAll = ()=>{
      if(!authToken || document.hidden) return;
      loadUserPanels();          // 统计 → 自动重画用户卡/排名/配额
      loadFeedback();            // 反馈 → 自动重画列表/徽标
      fetchRank(rankSort);       // 排名 → 自动重画
      if(me.is_admin) loadDsBalance();
    };
    window._syncTimer = setInterval(syncAll, 45000);
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden && authToken){
        loadUserPanels(); loadFeedback(); fetchRank(rankSort);
      }
    });
  }
}

/* 排名数据到手 → 自动重画 */
store.bind('rank', ()=>renderRank());
