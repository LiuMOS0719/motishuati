async function doAuth(isRegister){
  const u = $('#lgUser').value.trim();
  const p = $('#lgPass').value;
  if(!u || !p){ $('#lgMsg').textContent = '请输入用户名和密码'; return; }
  $('#lgMsg').textContent = '处理中…';
  $('#lgLogin').disabled = $('#lgReg').disabled = true;
  try{
    const r = await fetch(isRegister ? '/api/register' : '/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:u, password:p})
    }).then(x=>x.json());
    if(!r.ok){
      $('#lgMsg').textContent = (r.error || '失败') + (typeof r.tries_left === 'number' ? `（还剩 ${r.tries_left} 次）` : '');
      return;
    }
    authToken = r.token;
    localStorage.setItem('moti_token', authToken);
    $('#lgMsg').textContent = '';
    $('#lgPass').value = '';
    await enterApp(r.username);
  }catch(e){
    $('#lgMsg').textContent = '网络错误：' + e.message;
  }finally{
    $('#lgLogin').disabled = $('#lgReg').disabled = false;
  }
}
$('#lgLogin').onclick = ()=>doAuth(false);
$('#lgReg').onclick = ()=>doAuth(true);
$('#lgPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doAuth(false); });
$('#logoutBtn').onclick = async ()=>{
  if(!confirm('退出登录？（练习记录在账号里，不会丢）')) return;
  try{ await fetch('/api/logout',{method:'POST', headers:{'X-Auth-Token':authToken}}); }catch(e){}
  authToken = '';
  localStorage.removeItem('moti_token');
  location.reload();
};

/* ================= 启动 ================= */
async function boot(){
  load();
  loadRankCache();
  // 题库（科目）列表（公开接口，登录页也要用）
  let banks = [];
  try{ banks = await fetch('/api/banks').then(r=>r.json()); }catch(e){}
  state.banks = Array.isArray(banks) ? banks : [];
  state.curBank = localStorage.getItem('moti_bank') || (state.banks[0] && state.banks[0].id) || 'ctfl';
  state.bank = state.banks.find(b=>b.id===state.curBank) || state.banks[0] || null;
  if(state.bank) state.curBank = state.bank.id;
  renderBankPicker();
  authToken = localStorage.getItem('moti_token') || '';
  if(authToken){
    let me = {ok:false};
    try{ me = await fetch('/api/me',{headers:{'X-Auth-Token':authToken}}).then(r=>r.json()); }catch(e){}
    if(me.ok){ await enterApp(me.username); return; }
    authToken = '';
    localStorage.removeItem('moti_token');
  }
  showPage('pgLogin');
}
boot();
