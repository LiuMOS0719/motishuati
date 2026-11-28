/* ================= 管理后台（懒加载，仅管理员） =================
   七个板块：概览 / 用户 / 想法记录 / 题目反馈 / 题库 / 公告 / 备份 */
let admTab = 'overview';
const ADM_TABS = [
  ['overview', '概览'], ['users', '用户'], ['notes', '想法记录'],
  ['feedback', '题目反馈'], ['bank', '题库'], ['notice', '公告'], ['backup', '备份']
];

function admApi(path, opt){
  return fetch(path, Object.assign({
    headers: {'X-Auth-Token': authToken, 'Content-Type': 'application/json'}
  }, opt || {})).then(r=>r.json());
}

function openAdminPage(){
  admTab = admTab || 'overview';
  showPage('pgAdmin');
  renderAdminTabs();
  renderAdmin();
}

function renderAdminTabs(){
  const box = $('#adminTabs');
  if(!box) return;
  box.innerHTML = '';
  ADM_TABS.forEach(([k, label])=>{
    const b = document.createElement('button');
    b.className = 'atab' + (admTab === k ? ' on' : '');
    b.textContent = label;
    b.onclick = ()=>{ admTab = k; renderAdminTabs(); renderAdmin(); };
    box.appendChild(b);
  });
}

async function renderAdmin(){
  const body = $('#adminBody');
  if(!body) return;
  body.innerHTML = '<div class="empty">加载中…</div>';
  try{
    if(admTab === 'overview') await admOverview(body);
    else if(admTab === 'users') await admUsers(body);
    else if(admTab === 'notes') await admNotes(body);
    else if(admTab === 'feedback') await admFeedback(body);
    else if(admTab === 'bank') await admBank(body);
    else if(admTab === 'notice') await admNotice(body);
    else if(admTab === 'backup') admBackup(body);
  }catch(e){
    body.innerHTML = '<div class="empty">加载失败：' + esc(String(e && e.message || e)) + '</div>';
  }
}

/* ---------- 1. 概览 ---------- */
async function admOverview(box){
  const d = await admApi('/api/admin/overview');
  if(!d.ok){ box.innerHTML = '<div class="empty">' + esc(d.error || '读不到概览') + '</div>'; return; }
  const chs = (d.chapters || []).map(c=>{
    const name = (bankChapters().find(x=>String(x.key) === String(c.key)) || {}).full || ('第 ' + c.key + ' 章');
    return {name, n: c.n};
  });
  const maxN = Math.max(1, ...chs.map(c=>c.n));
  box.innerHTML = `
    <div class="admstats">
      <div class="admstat"><b>${d.questions}</b><span>题库题目</span></div>
      <div class="admstat"><b>${d.figures}</b><span>图表</span></div>
      <div class="admstat"><b>${d.users}</b><span>注册用户</span></div>
      <div class="admstat"><b>${d.active7d}</b><span>近 7 天活跃</span></div>
      <div class="admstat"><b>${d.sessions}</b><span>累计练习场次</span></div>
      <div class="admstat"><b>${d.ai_asks}</b><span>AI 提问次数</span></div>
      <div class="admstat"><b class="${d.notes_open ? 'warn' : ''}">${d.notes_open}</b><span>待处理想法</span></div>
      <div class="admstat"><b class="${d.feedback_open ? 'warn' : ''}">${d.feedback_open}</b><span>待修题目反馈</span></div>
    </div>
    <div class="admcard">
      <h3>章节题量分布</h3>
      ${chs.map(c=>`<div class="admrow"><span class="admlbl">${esc(c.name)}</span>
        <span class="admbar"><i style="width:${(c.n / maxN * 100).toFixed(1)}%"></i></span>
        <span class="admnum">${c.n} 题</span></div>`).join('')}
    </div>
    <div class="admcard">
      <h3>DeepSeek 余额</h3>
      <div id="admBalance" class="hint">查询中…</div>
    </div>`;
  try{
    const b = await admApi('/api/admin/deepseek-balance');
    const el = $('#admBalance');
    if(el){
      if(b && b.ok){
        const parts = [];
        if(b.total_balance !== undefined) parts.push('总余额 ' + b.total_balance);
        (b.balance_infos || []).forEach(x=>parts.push((x.currency || '') + ' ' + x.total_balance));
        el.textContent = parts.length ? parts.join(' · ') : JSON.stringify(b).slice(0, 200);
      }else{
        el.textContent = (b && b.error) || '查询失败';
      }
    }
  }catch(e){ $('#admBalance') && ($('#admBalance').textContent = '查询失败'); }
}

/* ---------- 2. 用户 ---------- */
async function admUsers(box){
  const d = await admApi('/api/admin/users');
  if(!d.ok){ box.innerHTML = '<div class="empty">' + esc(d.error || '读不到用户') + '</div>'; return; }
  const rows = d.rows || [];
  box.innerHTML = `<div class="admcard">
    <h3>用户管理 <span class="hint">共 ${rows.length} 个账号 · DeepSeek 按「场次×题目」计次</span></h3>
    <div class="admtblwrap"><table class="admtbl">
      <thead><tr><th>用户名</th><th>场次</th><th>题量</th><th>正确率</th><th>AI 次数</th><th>剩余额度</th><th>操作</th></tr></thead>
      <tbody>${rows.map(r=>`<tr data-user="${esc(r.username)}">
        <td>${esc(r.username)}${r.is_admin ? ' <span class="tag">管理员</span>' : ''}</td>
        <td>${r.sessions || 0}</td><td>${r.answered || 0}</td>
        <td>${(r.accuracy || 0)}%</td><td>${r.ai_ask_total || 0}</td>
        <td class="quota-cell">${r.quota || 0}</td>
        <td class="admbts">
          <button class="btn ghost small" data-q="10">+10</button>
          <button class="btn ghost small" data-q="50">+50</button>
          <button class="btn ghost small" data-q="-10">-10</button>
        </td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
  box.querySelectorAll('.admbts [data-q]').forEach(b=>{
    b.onclick = async ()=>{
      const tr = b.closest('tr');
      const name = tr.dataset.user;
      const r = await admApi('/api/admin/quota', {method:'POST',
        body: JSON.stringify({username: name, delta: Number(b.dataset.q)})});
      if(r.ok){
        tr.querySelector('.quota-cell').textContent = r.quota;
      }else alert(r.error || '操作失败');
    };
  });
}

/* ---------- 3. 想法记录 ---------- */
async function admNotes(box){
  const d = await admApi('/api/notes', {method:'POST', body: JSON.stringify({action:'list'})});
  const rows = (d && (d.items || d.rows || d.notes)) || [];
  const open = rows.filter(r=>r.status !== 'done');
  const done = rows.filter(r=>r.status === 'done');
  box.innerHTML = `
    <div class="admcard">
      <h3>记一条新想法</h3>
      <textarea id="admNoteText" rows="3" placeholder="想改什么、哪里不对…"></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn small" id="admNoteSave">记下</button>
        <span class="hint" id="admNoteMsg"></span>
      </div>
    </div>
    <div class="admcard">
      <h3>待处理 ${open.length} 条</h3>
      <div id="admNoteOpen">${open.length ? '' : '<div class="empty">没有待处理</div>'}</div>
    </div>
    <div class="admcard">
      <h3>已完成 ${done.length} 条</h3>
      <div id="admNoteDone">${done.length ? '' : '<div class="empty">还没有完成的</div>'}</div>
    </div>`;
  const mk = (r, isDone)=>{
    const el = document.createElement('div');
    el.className = 'admnote' + (isDone ? ' done' : '');
    el.innerHTML = `<div class="admnote-h"><b>#${r.id}</b>
      <span class="hint">${esc(r.page || '')}${r.qid ? ' · ' + esc(r.qid) : ''}</span>
      <span class="hint" style="margin-left:auto">${esc(r.created_at || '')}</span></div>
      <div class="admnote-b">${esc(r.note || '')}</div>
      <div class="row"><button class="btn ghost small" data-act="toggle">${isDone ? '重新打开' : '已完成'}</button>
        <button class="btn ghost small" data-act="del">删除</button></div>`;
    el.querySelector('[data-act="toggle"]').onclick = async ()=>{
      await admApi('/api/notes', {method:'POST', body: JSON.stringify({action:'set', id: r.id, status: isDone ? 'open' : 'done'})});
      renderAdmin();
    };
    el.querySelector('[data-act="del"]').onclick = async ()=>{
      await admApi('/api/notes', {method:'POST', body: JSON.stringify({action:'del', id: r.id})});
      renderAdmin();
    };
    return el;
  };
  open.forEach(r=>$('#admNoteOpen').appendChild(mk(r, false)));
  done.slice(0, 30).forEach(r=>$('#admNoteDone').appendChild(mk(r, true)));
  $('#admNoteSave').onclick = async ()=>{
    const t = $('#admNoteText').value.trim();
    if(!t) return;
    const r = await admApi('/api/notes', {method:'POST', body: JSON.stringify({action:'add', page:'管理页', qid:'', kind:'improve', note:t})});
    if(r && (r.ok || r.id)){ $('#admNoteMsg').textContent = '✓ 已记下'; renderAdmin(); }
    else $('#admNoteMsg').textContent = (r && r.error) || '失败';
  };
}

/* ---------- 4. 题目反馈 ---------- */
async function admFeedback(box){
  const d = await admApi('/api/feedback');
  const rows = Array.isArray(d) ? d : (d.rows || []);
  const open = rows.filter(r=>r.status === 'open');
  const others = rows.filter(r=>r.status !== 'open');
  box.innerHTML = `
    <div class="admcard">
      <h3>待修 ${open.length} 条 <span class="hint">点题目编号可直接跳到该题</span></h3>
      <div id="admFbOpen">${open.length ? '' : '<div class="empty">没有待修反馈</div>'}</div>
    </div>
    <div class="admcard">
      <h3>已处理 ${others.length} 条</h3>
      <div id="admFbDone">${others.length ? '' : '<div class="empty">暂无</div>'}</div>
    </div>`;
  const mk = (r, isOpen)=>{
    const el = document.createElement('div');
    el.className = 'admnote' + (isOpen ? '' : ' done');
    el.innerHTML = `<div class="admnote-h">
        <a class="link" data-qid="${esc(r.qid)}">${esc(r.qid)}</a>
        <span class="hint">${esc(r.kind || '')}</span>
        <span class="hint">${esc(r.username || '')}</span>
        <span class="hint" style="margin-left:auto">${esc(r.created_at || '')}</span></div>
      <div class="admnote-b">${esc(r.note || '（无描述）')}</div>
      <div class="row">
        <button class="btn ghost small" data-act="fix">${isOpen ? '标记已修复' : '改回待修'}</button>
        <button class="btn ghost small" data-act="ignore">忽略</button>
        <button class="btn ghost small" data-act="goto">查看此题</button>
      </div>`;
    el.querySelector('[data-qid]').onclick = ()=>admGotoQuestion(r.qid);
    el.querySelector('[data-act="goto"]').onclick = ()=>admGotoQuestion(r.qid);
    el.querySelector('[data-act="fix"]').onclick = async ()=>{
      await admApi('/api/feedback/status', {method:'POST', body: JSON.stringify({id: r.id, status: isOpen ? 'fixed' : 'open'})});
      renderAdmin();
    };
    el.querySelector('[data-act="ignore"]').onclick = async ()=>{
      await admApi('/api/feedback/status', {method:'POST', body: JSON.stringify({id: r.id, status: 'ignored'})});
      renderAdmin();
    };
    return el;
  };
  open.forEach(r=>$('#admFbOpen').appendChild(mk(r, true)));
  others.slice(0, 30).forEach(r=>$('#admFbDone').appendChild(mk(r, false)));
}

/* 跳到该题 = 打开题库板块并加载这道题 */
function admGotoQuestion(qid){
  admTab = 'bank';
  renderAdminTabs();
  renderAdmin().then(()=>{ setTimeout(()=>admLoadQuestion(qid), 60); });
}

/* ---------- 5. 题库 ---------- */
async function admBank(box){
  box.innerHTML = `
    <div class="admcard">
      <h3>检索题目</h3>
      <div class="row">
        <input id="admQ" placeholder="题号或题干关键词，如 C-31 / 缺陷报告" style="flex:1">
        <select id="admCh">
          <option value="">全部章节</option>
          ${bankChapters().map(c=>`<option value="${c.key}">${esc(c.full || ('第 ' + c.key + ' 章'))}</option>`).join('')}
        </select>
        <button class="btn small" id="admSearch">搜索</button>
      </div>
      <div id="admQList" class="admlist"></div>
    </div>
    <div class="admcard" id="admEditWrap" style="display:none"></div>
    <div class="admcard">
      <h3>整份导入</h3>
      <div class="hint">上传 questions.json 或 figures.json 覆盖题库（自动备份旧文件并重建题目表）。</div>
      <div class="row" style="margin-top:8px">
        <select id="admImpKind"><option value="questions">questions.json</option><option value="figures">figures.json</option></select>
        <input type="file" id="admImpFile" accept=".json,application/json">
        <button class="btn ghost small" id="admImpGo">导入</button>
        <span class="hint" id="admImpMsg"></span>
      </div>
    </div>`;
  const doSearch = async ()=>{
    const kw = $('#admQ').value.trim(), ch = $('#admCh').value;
    const q = new URLSearchParams({q: kw, chapter: ch, limit: '80'});
    const d = await admApi('/api/admin/questions?' + q.toString());
    const list = $('#admQList');
    const rows = (d && d.rows) || [];
    list.innerHTML = rows.length ? '' : '<div class="empty">没有匹配的题目</div>';
    rows.forEach(r=>{
      const el = document.createElement('div');
      el.className = 'admqrow';
      el.innerHTML = `<b>${esc(r.id)}</b>
        <span class="hint">${esc(r.papers || '')} 卷 · 第${esc(r.chapter || '?')}章 · ${esc(r.lo || '')} · ${esc(r.k_level || '')}</span>
        <span class="admqs">${esc((r.s || '').replace(/\n/g, ' '))}</span>`;
      el.onclick = ()=>admLoadQuestion(r.id);
      list.appendChild(el);
    });
  };
  $('#admSearch').onclick = doSearch;
  $('#admQ').addEventListener('keydown', e=>{ if(e.key === 'Enter') doSearch(); });
  $('#admImpGo').onclick = async ()=>{
    const f = $('#admImpFile').files[0];
    if(!f){ $('#admImpMsg').textContent = '先选文件'; return; }
    const raw = await f.text();
    const kind = $('#admImpKind').value;
    if(!confirm('确定用「' + f.name + '」覆盖 ' + kind + '.json？旧文件会自动备份。')) return;
    $('#admImpMsg').textContent = '导入中…';
    const r = await admApi('/api/admin/bank-import', {method:'POST', body: JSON.stringify({kind, raw})});
    $('#admImpMsg').textContent = r.ok ? ('✓ 已导入 ' + r.count + ' 条，备份：' + (r.backup || '')).slice(0, 120) : ('✗ ' + (r.error || '失败'));
    if(r.ok) AdmReloadIndex();
  };
  doSearch();
}

/* 题库索引变了要刷新前端缓存（allQ/QS） */
async function AdmReloadIndex(){
  try{
    const d = await fetch('/api/index?bank=' + (state.curBank || 'ctfl') + '&v=' + Date.now()).then(x=>x.json());
    allQ = d.questions || d.list || allQ;
    (allQ || []).forEach(q=>{ QS[q.id] = q; });
  }catch(e){}
}

async function admLoadQuestion(qid){
  const d = await admApi('/api/admin/question?qid=' + encodeURIComponent(qid));
  const wrap = $('#admEditWrap');
  if(!d.ok){ wrap.style.display = 'block'; wrap.innerHTML = '<div class="empty">' + esc(d.error || '读不到题目') + '</div>'; return; }
  const q = d.q;
  const opts = q.options || [];
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <h3>编辑 ${esc(q.id)} <span class="hint">${esc(q.papers)} 卷 · 第${esc(q.chapter)}章 · ${esc(q.lo)} · ${esc(q.k_level)}</span></h3>
    <label class="admfl">题干（图表位置写 {{FIG}}）</label>
    <textarea id="admStem" rows="6">${esc(q.stem || '')}</textarea>
    <label class="admfl">选项</label>
    <div id="admOpts">${opts.map(o=>`
      <div class="admopt" data-k="${esc(o.k)}">
        <b>${esc(o.k)}</b>
        <input class="opt-text" value="${esc(o.t || '')}">
        <label class="hint"><input type="checkbox" class="opt-ans" ${(q.answer || []).includes(o.k) ? 'checked' : ''}> 正确</label>
      </div>`).join('')}</div>
    <label class="admfl">解析</label>
    <textarea id="admExplain" rows="5">${esc(q.explain || '')}</textarea>
    ${q.figure ? `<div class="admfig"><div class="hint">当前图表（${esc(q.figure.kind)}，只读，改图表请用 figures.json 导入）</div><div class="fig">${q.figure.html}</div></div>` : ''}
    <div class="row" style="margin-top:10px">
      <button class="btn" id="admSaveQ">保存并重建题库</button>
      <span class="hint" id="admSaveMsg"></span>
    </div>`;
  $('#admSaveQ').onclick = async ()=>{
    const options = [...wrap.querySelectorAll('.admopt')].map(el=>({
      k: el.dataset.k, t: el.querySelector('.opt-text').value.trim()
    }));
    const answer = [...wrap.querySelectorAll('.admopt')].filter(el=>el.querySelector('.opt-ans').checked).map(el=>el.dataset.k);
    const body = {id: q.id, stem: $('#admStem').value, explain: $('#admExplain').value, options, answer};
    $('#admSaveMsg').textContent = '保存中…';
    const r = await admApi('/api/admin/question', {method:'POST', body: JSON.stringify(body)});
    $('#admSaveMsg').textContent = r.ok ? ('✓ 已保存并重建（备份 ' + (r.backup || '').split('/').pop() + '）') : ('✗ ' + (r.error || '失败'));
    if(r.ok) AdmReloadIndex();
  };
  wrap.scrollIntoView({behavior:'smooth', block:'start'});
}

/* ---------- 6. 公告 ---------- */
async function admNotice(box){
  const d = await admApi('/api/notice');
  box.innerHTML = `
    <div class="admcard">
      <h3>主页公告 <span class="hint">启用后显示在主页最上方，所有用户可见</span></h3>
      <textarea id="admNoticeText" rows="4" placeholder="例如：本周日 20:00 维护，期间可能短暂断线">${esc(d.text || '')}</textarea>
      <div class="row" style="margin-top:10px">
        <label class="hint" style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="admNoticeOn" ${d.active ? 'checked' : ''}> 启用公告
        </label>
        <button class="btn small" id="admNoticeSave">保存</button>
        <span class="hint" id="admNoticeMsg">${d.updated_at ? '上次更新 ' + esc(d.updated_at) : ''}</span>
      </div>
    </div>`;
  $('#admNoticeSave').onclick = async ()=>{
    const r = await admApi('/api/admin/notice', {method:'POST',
      body: JSON.stringify({text: $('#admNoticeText').value, active: $('#admNoticeOn').checked})});
    $('#admNoticeMsg').textContent = r.ok ? ('✓ 已保存 ' + (r.active ? '（已启用）' : '（未启用）')) : ('✗ ' + (r.error || '失败'));
    if(r.ok && typeof renderNoticeBar === 'function') renderNoticeBar();
  };
}

/* ---------- 7. 备份 ---------- */
function admBackup(box){
  const bak = JSON.parse(localStorage.getItem('moti_bak_info') || 'null');
  box.innerHTML = `
    <div class="admcard">
      <h3>数据库快照</h3>
      <div class="hint">把当前 quiz.db 完整下载一份（含用户、答题记录、想法、反馈）。建议每周一次。</div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="admBakGo">下载 quiz.db</button>
        <span class="hint" id="admBakMsg">${bak ? '上次下载 ' + esc(bak.t) : ''}</span>
      </div>
    </div>
    <div class="admcard">
      <h3>题库与配置</h3>
      <div class="hint">题目与图表不在数据库里，改完会在 data/ 下自动留 .bak 备份。
        也可以用「题库」板块的整份导入来恢复。</div>
    </div>`;
  $('#admBakGo').onclick = async ()=>{
    $('#admBakMsg').textContent = '生成中…';
    try{
      const r = await fetch('/api/admin/backup', {headers:{'X-Auth-Token': authToken}});
      if(!r.ok){ $('#admBakMsg').textContent = '失败：' + r.status; return; }
      const blob = await r.blob();
      const name = 'quiz-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'') + '.db';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      const t = new Date().toLocaleString('zh-CN');
      localStorage.setItem('moti_bak_info', JSON.stringify({t, size: blob.size}));
      $('#admBakMsg').textContent = '✓ 已下载 ' + name + '（' + Math.round(blob.size/1024) + ' KB）';
    }catch(e){ $('#admBakMsg').textContent = '失败：' + (e && e.message || e); }
  };
}

/* 管理页返回主页 */
document.addEventListener('click', e=>{
  if(e.target && e.target.id === 'adminBack'){
    showPage('pgHome');
    if(typeof renderHome === 'function') renderHome();
    if(typeof renderNoticeBar === 'function') renderNoticeBar();
  }
});
