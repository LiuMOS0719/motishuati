/* ---------- 极简响应式：数据一变，绑定的渲染函数自动跑 ---------- */
const store = {
  _d: {}, _s: {},
  set(k, v){
    this._d[k] = v;
    (this._s[k] || []).forEach(f=>{
      try{ f(v); }catch(e){ console.error('[store]', k, e); }
    });
  },
  get(k){ return this._d[k]; },
  bind(k, f){
    (this._s[k] = this._s[k] || []).push(f);
    if(k in this._d) { try{ f(this._d[k]); }catch(e){ console.error('[store]', k, e); } }
  }
};

const LS_SESS = 'moti_sessions_v1';   // 历史场次
const LS_CHAT = 'moti_chats_v1';      // 每题的 AI 对话
const LS_CUR  = 'moti_current_v1';    // 进行中的练习
const LS_OWNER = 'moti_owner_v1';     // 本地缓存属于哪个账号（换账号要清掉，避免串号）
let sessions = [], chats = {}, cur = null;

function load(){
  try{ sessions = JSON.parse(localStorage.getItem(LS_SESS) || '[]'); }catch(e){ sessions=[]; }
  try{ chats = JSON.parse(localStorage.getItem(LS_CHAT) || '{}'); }catch(e){ chats={}; }
  try{ cur = JSON.parse(localStorage.getItem(LS_CUR) || 'null'); }catch(e){ cur=null; }
}
let authToken = localStorage.getItem('moti_token') || '';
/* 最近一次状态推送的 Promise：读服务端统计前先 await 它，避免读到推送前的旧数据 */
let lastPushPromise = Promise.resolve();
let pushTimer = null;
function pushState(){
  if(!authToken) return;
  clearTimeout(pushTimer);
  let done;
  lastPushPromise = new Promise(res=>{ done = res; });
  pushTimer = setTimeout(async ()=>{ await pushStateNow(); done(); }, 700);
}
/* 立刻推送（不等防抖）：练习提交后要马上让服务端统计更新 */
async function pushStateNow(){
  if(!authToken) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  lastPushPromise = fetch('/api/state', {
    method: 'PUT',
    headers: {'Content-Type':'application/json', 'X-Auth-Token': authToken},
    body: JSON.stringify({sessions, chats, current: cur})
  }).catch(()=>{ /* 离线时忽略，下次变更再推 */ });
  await lastPushPromise;
}
function saveSessions(){ localStorage.setItem(LS_SESS, JSON.stringify(sessions)); pushState(); store.set('sessions', sessions); }
function saveChats(){ localStorage.setItem(LS_CHAT, JSON.stringify(chats)); pushState(); }
function saveCur(){
  cur ? localStorage.setItem(LS_CUR, JSON.stringify(cur)) : localStorage.removeItem(LS_CUR);
  pushState();
}

/* ================= 通用 ================= */
const $ = s => document.querySelector(s);
const QS = {};
let allQ = [];
function esc(s){ return (s||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $('#'+id).classList.add('active');
  window.scrollTo(0,0);
}
function fmtTime(ts){
  const d=new Date(ts);
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function scoreClass(acc){ return acc>=65?'good':acc>=50?'mid':'bad'; }
function refLabel(q){
  const p = q.papers.split(',');
  if(Array.isArray(q.refs) && q.refs.length > 1) return q.refs.join(' / ') + ' 题';
  return `${p.join('/')} 卷${q.is_extra?' 附加':''} 第 ${q.no} 题`;
}

/* ================= 主页 ================= */
const SRC_LABEL = {ALL:'全部题目',A:'A 卷',B:'B 卷',C:'C 卷',D:'D 卷',EXTRA:'附加题',WRONG:'错题本',
  CH1:'第1章 测试基础',CH2:'第2章 贯穿 SDLC 的测试',CH3:'第3章 静态测试',
  CH4:'第4章 测试分析与设计',CH5:'第5章 测试管理与测试活动',CH6:'第6章 测试工具'};
const SHORT = {A:'A卷',B:'B卷',C:'C卷',D:'D卷',EXTRA:'附加题',
  CH1:'第1章',CH2:'第2章',CH3:'第3章',CH4:'第4章',CH5:'第5章',CH6:'第6章',WRONG:'错题本'};
const CHAPTERS = [['1','测试基础'],['2','贯穿 SDLC 的测试'],['3','静态测试'],
                  ['4','测试分析与设计'],['5','测试管理与测试活动'],['6','测试工具']];
const LETTERS = 'ABCDEFGH';   // 选项字母表（CTFL 有 4 选项和 5 选项两种题）
const state = {idx:0, sel:new Set(), sources:new Set(['A','B','C','D','EXTRA']),
  banks:[], curBank:'ctfl', bank:null, optOrder:'orig'};

/* 选项乱序工具 */

/* ---------- 懒加载脚本（同一文件只请求一次） ---------- */
const JS_VER = '18';       // 改了 js 或题库数据就 bump，避免浏览器用旧缓存
function loadScript(src){
  if(src.indexOf('?') < 0) src += '?v=' + JS_VER;
  window.__loaded = window.__loaded || {};
  if(window.__loaded[src]) return window.__loaded[src];
  const p = new Promise((res, rej)=>{
    const el = document.createElement('script');
    el.src = src;
    el.onload = ()=>res(true);
    el.onerror = ()=>{ delete window.__loaded[src]; rej(new Error('加载失败: ' + src)); };
    document.head.appendChild(el);
  });
  window.__loaded[src] = p;
  return p;
}
/* 按顺序加载多个脚本（有依赖顺序时用） */
async function ensurePageScripts(list){
  for(const src of list){ await loadScript(src); }
}

let fbCache = null;   /* 反馈列表缓存（主页与答题页共用） */

/* ---------- 弹窗打开时锁住背景滚动 ----------
   所有弹窗 id 都以 Modal 结尾，监听 class 变化自动维护 */
(function lockPageScroll(){
  const sync = ()=>{
    const anyOpen = [...document.querySelectorAll('[id$="Modal"]')]
      .some(m=>m.classList.contains('open'));
    document.body.classList.toggle('no-scroll', anyOpen);
  };
  const mo = new MutationObserver(sync);
  document.querySelectorAll('[id$="Modal"]').forEach(m=>{
    mo.observe(m, {attributes:true, attributeFilter:['class']});
  });
  sync();
})();
