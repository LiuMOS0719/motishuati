const ASK_CHIPS = ['为什么我选的选项是错的？','这个考点在考什么，怎么记？','举一个具体的小例子','这个知识点属于哪一章，考试怎么考？'];
let drawerQid = null, drawerSid = null;
const HINT_TEXT = '同一场练习的同一道题共用一个对话；开始新的练习就从空白对话开始。DeepSeek 每场每题首次提问扣 1 次（同题追问不扣），GLM 不限次数。';

/* 对话的归属键 = 场次 + 题目：不同场次的同一题互相看不到历史 */
function chatKey(sid, qid){ return (sid || 'nosess') + '::' + qid; }
/* 当前所在场次：答题页取进行中的 cur，结果页取正在看的这一场 */
function curSid(){
  if($('#pgQuiz').classList.contains('active')) return cur ? cur.id : '';
  if($('#pgResult').classList.contains('active')) return curResult ? curResult.id : '';
  return '';
}

/* ---------- 轻量 markdown：先转义再渲染，防止 AI 输出里的标签被执行 ---------- */
function mdSafe(text){
  let s = esc(String(text == null ? '' : text));
  // 代码块
  s = s.replace(/```([\s\S]*?)```/g, (m,p)=>'<pre>'+p.replace(/^\n+|\n+$/g,'')+'</pre>');
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // 标题
  s = s.replace(/^#{3,}\s*(.+)$/gm, '<div class="mdh">$1</div>');
  s = s.replace(/^#{1,2}\s*(.+)$/gm, '<div class="mdh" style="font-size:14px">$1</div>');
  // 粗体 / 斜体
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // 无序列表（连续的行合成一个 ul）
  s = s.replace(/(?:^|\n)((?:[-*•]\s+[^\n]+(?:\n|$))+)/g, (m, blk)=>{
    const items = blk.trim().split('\n').map(l=>'<li>'+l.replace(/^[-*•]\s+/,'')+'</li>').join('');
    return '<ul>'+items+'</ul>';
  });
  // 有序列表
  s = s.replace(/(?:^|\n)((?:\d+[.)]\s+[^\n]+(?:\n|$))+)/g, (m, blk)=>{
    const items = blk.trim().split('\n').map(l=>'<li>'+l.replace(/^\d+[.)]\s+/,'')+'</li>').join('');
    return '<ol>'+items+'</ol>';
  });
  // 剩余换行（列表/代码块内部已吃掉）
  s = s.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  return s;
}
/* 追加一条 AI 消息：带「AI 生成」标识 + markdown 渲染 */
function appendAiMsg(box, text){
  const badge = document.createElement('div');
  badge.className = 'aibadge';
  badge.textContent = 'AI 生成 · 仅供参考';
  box.appendChild(badge);
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = mdSafe(text);
  box.appendChild(d);
  return d;
}

function renderChat(){
  const box = $('#msgs'); box.innerHTML='';
  const list = (drawerQid && chats[chatKey(drawerSid, drawerQid)]) || [];
  if(!list.length){
    const d=document.createElement('div'); d.className='msg sys';
    d.textContent = '这次练习的这一题还没有对话。同场同题会保留上下文，换题或开始新练习都是新的对话。';
    box.appendChild(d); return;
  }
  list.forEach(m=>{
    if(m.role === 'me'){
      const d = document.createElement('div');
      d.className = 'msg me';
      d.textContent = m.content;
      box.appendChild(d);
    }else{
      appendAiMsg(box, m.content);
    }
  });
  box.scrollTop = 1e9;
}
/* 模型按钮上显示具体型号（从 /api/health 取，改 .env.ai 的模型名时前端自动跟随） */
let modelLabelsLoaded = false;
function loadModelLabels(){
  if(modelLabelsLoaded) return;
  fetch('/api/health').then(r=>r.json()).then(h=>{
    const ds = document.querySelector('.mbtn[data-model="deepseek"] .mver');
    const gl = document.querySelector('.mbtn[data-model="glm"] .mver');
    if(ds && h.model) ds.textContent = h.model;
    if(gl && h.glm_model) gl.textContent = h.glm_model;
    modelLabelsLoaded = true;
  }).catch(()=>{});
}
function openAskDrawer(qid){
  drawerQid = qid; drawerSid = curSid();
  loadModelLabels();
  const q = QS[qid];
  $('#drawerTitle').textContent = q ? `问 AI · ${refLabel(q)}` : '问 AI 老师';
  $('#dhint').textContent = HINT_TEXT;
  updateQuotaUI();
  const chips=$('#chips'); chips.innerHTML='';
  ASK_CHIPS.forEach(t=>{
    const b=document.createElement('button'); b.textContent=t;
    b.onclick=()=>askAI(t); chips.appendChild(b);
  });
  renderChat();
  applyDrawerSize();
  $('#drawer').classList.add('open');
  $('#askinput').focus();
}

/* ---------- 抽屉拖动改大小（PC 端；按账号记住尺寸） ---------- */
const DRAWER_MIN_W = 320, DRAWER_MIN_H = 280;
function drawerSizeKey(){ return 'moti_drawer_size:' + ((typeof me !== 'undefined' && me.username) || 'anon'); }
function applyDrawerSize(){
  const d = $('#drawer');
  if(window.innerWidth <= 768){ d.style.width = ''; d.style.height = ''; return; }  // 移动端保持全宽
  try{
    const s = JSON.parse(localStorage.getItem(drawerSizeKey()) || 'null');
    if(!s || !s.w || !s.h) return;
    d.style.width = Math.min(s.w, window.innerWidth - 24) + 'px';
    d.style.height = Math.min(s.h, window.innerHeight - 24) + 'px';
  }catch(e){}
}
window.addEventListener('resize', ()=>{ if($('#drawer').classList.contains('open')) applyDrawerSize(); });
(function initDrawerGrip(){
  const grip = $('#drawerGrip');
  if(!grip) return;
  let dragging = false, sx = 0, sy = 0, sw = 0, sh = 0;
  grip.addEventListener('mousedown', e=>{
    if(window.innerWidth <= 768) return;       // 移动端不拖
    const d = $('#drawer');
    sw = d.getBoundingClientRect().width;
    sh = d.getBoundingClientRect().height;
    sx = e.clientX; sy = e.clientY;
    dragging = true; window.__drawerDragging = true;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const d = $('#drawer');
    const w = Math.min(Math.max(sw - (e.clientX - sx), DRAWER_MIN_W), window.innerWidth - 24);
    const h = Math.min(Math.max(sh - (e.clientY - sy), DRAWER_MIN_H), window.innerHeight - 24);
    d.style.width = w + 'px';
    d.style.height = h + 'px';
  });
  window.addEventListener('mouseup', ()=>{
    if(!dragging) return;
    dragging = false;
    const r = $('#drawer').getBoundingClientRect();
    try{
      localStorage.setItem(drawerSizeKey(), JSON.stringify({w: Math.round(r.width), h: Math.round(r.height)}));
    }catch(e){}
    setTimeout(()=>{ window.__drawerDragging = false; }, 80);   // 吞掉拖拽收尾时的那次 click
  });
})();
async function askAI(text){
  const t = (text||'').trim();
  if(!t) return;
  if(!drawerQid){ alert('先选一道题'); return; }
  const q = QS[drawerQid];
  const answered = !!(cur && cur.qids.includes(drawerQid) && itemOf(drawerQid));
  const ckey = chatKey(drawerSid, drawerQid);
  const list = chats[ckey] = (chats[ckey] || []);
  const hist = list.slice(-8);
  const beforeLen = list.length;
  list.push({role:'me', content:t}); saveChats();
  const box=$('#msgs');
  const me=document.createElement('div'); me.className='msg me'; me.textContent=t; box.appendChild(me);
  const wait=document.createElement('div'); wait.className='msg ai'; wait.textContent='思考中…'; box.appendChild(wait);
  box.scrollTop=1e9; $('#askinput').value=''; $('#sendBtn').disabled=true;
  try{
    const r=await fetch('/api/ask',{method:'POST',
      headers:{'Content-Type':'application/json','X-Auth-Token':authToken},
      body:JSON.stringify({qid:drawerQid, session_id:drawerSid || '', question:t, answered, history:hist, model:aiModel,
        perm: (cur && cur.perms) ? cur.perms[drawerQid] : null})}).then(x=>x.json());
    if(r.ok){
      wait.remove();
      list.push({role:'ai', content:r.answer}); saveChats();
      appendAiMsg(box, r.answer);
      const u=document.createElement('div'); u.className='usage';
      const tag = (r.model==='glm'?'GLM':'DeepSeek') + (r.charged?' · 扣 1 次额度':' · 本场本题追问不计数');
      u.textContent=`${tag} ｜ 本次消耗 ${r.prompt_tokens}+${r.completion_tokens} token`;
      box.appendChild(u);
      if(typeof r.quota === 'number'){
        me.quota = r.quota; updateQuotaUI();
        if(myStats){ myStats.quota = r.quota; renderUserCard(); }
      }
      box.scrollTop=1e9;
    } else if(r.blocked){
      list.length = beforeLen; saveChats();     // 不相关：把这条提问从对话里撤掉
      me.remove();
      wait.className = 'msg blocked';
      wait.textContent = '⛔ ' + (r.message || '这个问题和当前题目无关，AI 不回答')
        + (r.reason ? `（${r.reason}）` : '')
        + '\n\n可以问这道题的考点、选项区别、为什么某个选项错、解题思路。';
    } else {
      wait.textContent = '⚠ ' + (r.error || 'AI 暂时没有回应，请重试');
      if(r.detail) console.warn('[AI] detail:', r.detail);
    }
  }catch(e){
    wait.textContent = '⚠ 网络不通，检查网络后再试';
    console.warn('[AI] network:', e);
  }
  $('#sendBtn').disabled=false;
}
$('#fab').onclick = ()=>{
  if($('#pgQuiz').classList.contains('active')) openAskDrawer(cur.qids[state.idx]);
  else if($('#pgResult').classList.contains('active') && curResult && curResult.items.length)
    openAskDrawer(curResult.items[curResult.items.length-1].qid);
  else alert('进入练习后可以就当前题目提问');
};
$('#closeDrawer').onclick = ()=>$('#drawer').classList.remove('open');
/* 点对话窗口外面就收起（点右下角问 AI 按钮不算外面，交给它自己开关） */
document.addEventListener('click', e=>{
  if(window.__drawerDragging) return;          // 拖拽收尾不算点击
  const d = $('#drawer');
  if(!d.classList.contains('open')) return;
  if(d.contains(e.target)) return;
  if(e.target.closest && e.target.closest('#fab')) return;
  d.classList.remove('open');
});
$('#sendBtn').onclick = ()=>askAI($('#askinput').value);
$('#askinput').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); askAI($('#askinput').value); }
});
document.addEventListener('keydown',e=>{
  if($('#drawer').classList.contains('open')) return;
  if(!$('#pgQuiz').classList.contains('active')) return;
  if(e.key==='ArrowRight') $('#nextBtn')&&!$('#nextBtn').disabled&&$('#nextBtn').click();
  if(e.key==='ArrowLeft') $('#prevBtn')&&!$('#prevBtn').disabled&&$('#prevBtn').click();
});

/* ================= 题目反馈 ================= */
let fbQid = null;
function openFeedbackModal(){
  const q = (cur && $('#pgQuiz').classList.contains('active')) ? QS[cur.qids[state.idx]] : null;
  if(!q){ alert('先进入一道题目再反馈'); return; }
  fbQid = q.id;
  $('#fbQid').textContent = `${q.papers}-${q.no} · ${q.lo} · ${q.k_level}`;
  $('#fbNote').value = '';
  $('#fbModal').classList.add('open');
  $('#fbNote').focus();
}
$('#fbCancel').onclick = ()=>$('#fbModal').classList.remove('open');
$('#fbModal').onclick = e=>{ if(e.target.id==='fbModal') $('#fbModal').classList.remove('open'); };
$('#fbSubmit').onclick = async ()=>{
  if(!fbQid) return;
  const btn = $('#fbSubmit'); btn.disabled = true; btn.textContent = '提交中…';
  try{
    const r = await fetch('/api/feedback',{method:'POST',
      headers:{'Content-Type':'application/json','X-Auth-Token':authToken},
      body:JSON.stringify({qid:fbQid, kind:$('#fbKind').value, note:$('#fbNote').value})}).then(x=>x.json());
    if(r.ok){
      $('#fbModal').classList.remove('open');
      $('#fbKind').selectedIndex = 0;
      fbCache = null;                      // 让主页的反馈列表重新拉取
      loadFeedback(true);
      const f = document.createElement('div');
      f.textContent = '✓ 已记录，谢谢';
      f.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);'
        + 'background:rgba(34,197,94,.92);color:#fff;padding:8px 18px;border-radius:999px;'
        + 'font-size:13px;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.4)';
      document.body.appendChild(f);
      setTimeout(()=>f.remove(), 1400);
    } else alert(r.error || '提交失败，请稍后重试');
  }catch(e){ alert('网络不通，检查网络后再试'); console.warn(e); }
  btn.disabled = false; btn.textContent = '提交';
};

function refreshDrawerFor(qid){
  const sid = curSid();
  if(drawerQid === qid && drawerSid === sid) return;
  drawerQid = qid; drawerSid = sid;
  const q = QS[qid];
  $('#drawerTitle').textContent = q ? `问 AI · ${refLabel(q)}` : '问 AI 老师';
  renderChat();
  $('#dhint').textContent = HINT_TEXT;
}
