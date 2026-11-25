/* ================= 问题记录本（仅管理员） =================
   页头的「📝 记录」按钮在所有页面可见，用来随手记使用中发现的问题。
   记录存在服务端 admin_notes 表，下次修改时按这里逐条读取，由用户确认后再改。 */
const NOTE_KIND = {bug: '问题', improve: '改进', idea: '想法'};
let noteCtx = {page: '', qid: ''};
let noteCache = [];

function notePageName(){
  if($('#pgQuiz').classList.contains('active')) return '答题页';
  if($('#pgResult').classList.contains('active')) return '结果页';
  if($('#pgHome').classList.contains('active')) return '主页';
  return '其他页';
}
/* 自动带上当前题目，方便以后定位是哪道题的问题 */
function noteCurrentQid(){
  if($('#pgQuiz').classList.contains('active') && cur) return (cur.qids && cur.qids[state.idx]) || '';
  if($('#pgResult').classList.contains('active') && typeof curResult !== 'undefined'
     && curResult && curResult.items && curResult.items.length)
    return curResult.items[curResult.items.length - 1].qid;
  return '';
}
async function noteApi(body){
  try{
    return await fetch('/api/notes', {method:'POST',
      headers:{'Content-Type':'application/json','X-Auth-Token':authToken},
      body: JSON.stringify(body)}).then(r=>r.json());
  }catch(e){ return {ok:false, error:'网络不通，稍后再试'}; }
}

function openNoteModal(){
  const qid = noteCurrentQid();
  noteCtx = {page: notePageName(), qid};
  const q = qid ? QS[qid] : null;
  $('#noteCtx').textContent = '记录位置：' + noteCtx.page + (q ? ' · ' + refLabel(q) : '');
  $('#noteText').value = '';
  $('#noteMsg').textContent = '';
  $('#noteModal').classList.add('open');
  loadNotes();
  setTimeout(()=>{ try{ $('#noteText').focus(); }catch(e){} }, 60);
}

async function loadNotes(){
  const r = await noteApi({action:'list'});
  if(!r.ok){ $('#noteList').textContent = r.error || '读取失败'; return; }
  noteCache = r.notes || [];
  setNoteBadge(r.open || 0);
  renderNotes(r.open || 0);
}
function setNoteBadge(n){
  const b = $('#noteBadge');
  if(!b) return;
  b.textContent = n;
  b.style.display = n > 0 ? 'inline-block' : 'none';
}
/* 进站时静默拉一次，给页头按钮挂上未处理数量 */
function loadNoteBadge(){ loadNotes().catch(()=>{}); }

function renderNotes(openCount){
  const box = $('#noteList');
  box.innerHTML = '';
  const cnt = (typeof openCount === 'number') ? openCount : noteCache.filter(n=>n.status === 'open').length;
  $('#noteCount').textContent = `待处理 ${cnt} 条`;
  const showDone = $('#noteShowDone').checked;
  const list = noteCache.filter(n=> showDone || n.status !== 'done');
  if(!list.length){
    const d = document.createElement('div');
    d.className = 'hint';
    d.textContent = showDone ? '还没有记录。' : '没有待处理的记录（勾「显示已处理」可看历史）。';
    box.appendChild(d);
    return;
  }
  list.forEach(n=>{
    const row = document.createElement('div');
    row.style.cssText = 'border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-bottom:8px'
      + (n.status === 'done' ? ';opacity:.55' : '');
    const head = document.createElement('div');
    head.className = 'hint';
    head.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const tag = document.createElement('span');
    tag.textContent = NOTE_KIND[n.kind] || n.kind || '问题';
    tag.style.cssText = 'color:var(--acc);border:1px solid var(--line);border-radius:6px;padding:0 6px';
    head.appendChild(tag);
    const meta = document.createElement('span');
    meta.textContent = `#${n.id} · ${n.created_at || ''}`
      + (n.page ? ` · ${n.page}` : '') + (n.qid ? ` · ${n.qid}` : '')
      + (n.status === 'done' ? ' · 已处理' : '');
    head.appendChild(meta);
    row.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = 'margin-top:5px;white-space:pre-wrap;font-size:13.5px;line-height:1.6';
    body.textContent = n.note;
    row.appendChild(body);

    const ops = document.createElement('div');
    ops.style.cssText = 'margin-top:6px;display:flex;gap:8px';
    const bDone = document.createElement('button');
    bDone.className = 'btn ghost small';
    bDone.textContent = n.status === 'done' ? '重新打开' : '标记已处理';
    bDone.onclick = async ()=>{
      bDone.disabled = true;
      await noteApi({action:'set', id:n.id, status: n.status === 'done' ? 'open' : 'done'});
      loadNotes();
    };
    const bDel = document.createElement('button');
    bDel.className = 'btn ghost small';
    bDel.textContent = '删除';
    bDel.onclick = async ()=>{
      if(!confirm(`删除第 ${n.id} 条记录？`)) return;
      bDel.disabled = true;
      await noteApi({action:'del', id:n.id});
      loadNotes();
    };
    ops.appendChild(bDone); ops.appendChild(bDel);
    row.appendChild(ops);
    box.appendChild(row);
  });
}

$('#noteSave').onclick = async ()=>{
  const t = ($('#noteText').value || '').trim();
  if(!t){ $('#noteMsg').textContent = '写点内容再记'; return; }
  const btn = $('#noteSave');
  btn.disabled = true; btn.textContent = '保存中…';
  const r = await noteApi({action:'add', kind:$('#noteKind').value, note:t,
                           page:noteCtx.page, qid:noteCtx.qid});
  btn.disabled = false; btn.textContent = '记下';
  if(r.ok){
    $('#noteText').value = '';
    $('#noteMsg').textContent = '✓ 已记下';
    setTimeout(()=>{ $('#noteMsg').textContent = ''; }, 1600);
    loadNotes();
  }else{
    $('#noteMsg').textContent = r.error || '没记上，稍后再试';
  }
};
/* Ctrl/⌘ + Enter 直接记下，普通回车在文本框里换行 */
$('#noteText').addEventListener('keydown', e=>{
  if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); $('#noteSave').click(); }
});
$('#noteShowDone').onchange = ()=>renderNotes();
$('#noteClose').onclick = ()=>$('#noteModal').classList.remove('open');
$('#noteModal').onclick = e=>{ if(e.target.id === 'noteModal') $('#noteModal').classList.remove('open'); };
/* 三个页头的按钮共用这一个入口 */
document.addEventListener('click', e=>{
  const b = e.target.closest && e.target.closest('.noteBtn');
  if(b){ e.preventDefault(); openNoteModal(); }
});
