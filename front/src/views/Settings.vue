<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import { useAuthStore } from '../stores/auth.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useBankStore } from '../stores/bank.js'
import { useUiStore } from '../stores/ui.js'
import * as authApi from '../api/auth.js'

const router = useRouter()
const auth = useAuthStore()
const mastery = useMasteryStore()
const bank = useBankStore()
const ui = useUiStore()

const tab = ref('account')
const oldPw = ref('')
const newPw = ref('')
const newPw2 = ref('')
const busy = ref(false)
const sessions = ref([])

const NAV = [
  { id: 'account', label: '账号与安全' },
  { id: 'quota', label: 'AI 额度' },
  { id: 'data', label: '数据' },
]

const tokensText = computed(() => {
  const n = auth.tokens
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  return String(n)
})

async function loadSessions() {
  try { sessions.value = (await authApi.sessions()).rows || [] } catch { sessions.value = [] }
}

async function changePw() {
  if (!oldPw.value || !newPw.value) return ui.toast('请填写原密码与新密码', 'warn')
  if (newPw.value.length < 6) return ui.toast('新密码至少 6 位', 'warn')
  if (newPw.value !== newPw2.value) return ui.toast('两次输入的新密码不一致', 'warn')
  busy.value = true
  try {
    await authApi.changePassword(oldPw.value, newPw.value)
    ui.toast('密码已修改，请重新登录', 'success')
    auth.clear()
    router.replace('/login')
  } catch (e) {
    ui.toast(e.message || '修改失败', 'error')
  } finally { busy.value = false }
}

async function kick(tail) {
  const ok = await ui.ask({ title: '让这个会话下线？', message: '那台设备需要重新登录。', confirmText: '下线' })
  if (!ok) return
  try {
    await authApi.kickSession(tail)
    await loadSessions()
    ui.toast('已下线', 'success')
  } catch (e) { ui.toast(e.message || '操作失败', 'error') }
}

async function exportData() {
  try {
    await mastery.load('ctfl', true)
    const payload = {
      exported_at: new Date().toISOString(), username: auth.username,
      stats: mastery.stats, weights: mastery.rows,
    }
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `moti-${auth.username}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) { ui.toast(e.message || '导出失败', 'error') }
}

async function logout() {
  const ok = await ui.ask({ title: '退出登录？', message: '', confirmText: '退出' })
  if (!ok) return
  await auth.doLogout()
  bank.reset(); mastery.reset()
  router.replace('/login')
}

onMounted(loadSessions)
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <nav class="nav">
        <button v-for="n in NAV" :key="n.id" class="nav-i" :class="{ on: tab === n.id }" @click="tab = n.id">
          {{ n.label }}
        </button>
        <div class="nav-sep"></div>
        <button class="nav-i danger" @click="logout">退出登录</button>
      </nav>

      <div class="pane">
        <!-- 账号 -->
        <div v-if="tab === 'account'" class="card">
          <div class="idbox">
            <div class="ava-lg">{{ (auth.username || '?').slice(0, 1).toUpperCase() }}</div>
            <div class="id-t">
              <b>{{ auth.username }}</b>
              <span>{{ auth.isOwner ? '站长' : auth.isAdmin ? '管理员' : '普通用户' }}</span>
            </div>
            <button class="btn ghost" @click="exportData">导出数据</button>
          </div>

          <div class="fields">
            <div class="field">
              <div class="field-k">用户名</div>
              <div class="field-v">{{ auth.username }}</div>
              <div class="field-hint">登录后不可自行修改，需要改请找管理员</div>
            </div>
            <div class="field">
              <div class="field-k">身份</div>
              <div class="field-v">{{ auth.isOwner ? '站长（全部权限）' : auth.isAdmin ? '管理员' : '普通用户' }}</div>
            </div>
            <div class="field">
              <div class="field-k">最近登录</div>
              <div class="field-v">{{ sessions[0]?.created_at || '—' }}</div>
            </div>
          </div>

          <div class="sep"></div>

          <div class="sec-t">修改密码</div>
          <div class="form">
            <input v-model="oldPw" class="inp" type="password" placeholder="原密码" autocomplete="current-password" />
            <input v-model="newPw" class="inp" type="password" placeholder="新密码（至少 6 位）" autocomplete="new-password" />
            <input v-model="newPw2" class="inp" type="password" placeholder="再输一次新密码" autocomplete="new-password" />
            <div class="saveline">
              <span class="hint">改完所有设备都要重新登录</span>
              <button class="btn" :disabled="busy" @click="changePw">{{ busy ? '提交中…' : '保存新密码' }}</button>
            </div>
          </div>

          <div class="sep"></div>

          <div class="sec-t">登录中的设备</div>
          <div class="sess" v-if="sessions.length">
            <div v-for="s in sessions" :key="s.tail" class="srow">
              <span class="tail">…{{ s.tail }}</span>
              <span class="exp">{{ s.expires_at }}</span>
              <b v-if="s.current" class="cur">当前</b>
              <button v-else class="del" @click="kick(s.tail)">下线</button>
            </div>
          </div>
          <div v-else class="hint">没有有效会话</div>
        </div>

        <!-- 额度 -->
        <div v-else-if="tab === 'quota'" class="card">
          <div class="sec-t">AI 额度</div>
          <div class="quota-box">
            <div class="qb-k">剩余</div>
            <div class="qb-v">{{ tokensText }}<small>token</small></div>
            <div class="qb-t">1 token = 0.000001 元 · DeepSeek 按实际用量结算，GLM 免费</div>
          </div>
          <div class="fields">
            <div class="field">
              <div class="field-k">DeepSeek</div>
              <div class="field-v">按 token 结算，高峰时段（工作日 09–12 / 14–18）单价翻倍</div>
            </div>
            <div class="field">
              <div class="field-k">GLM</div>
              <div class="field-v">免费，额度用完后可在 AI 抽屉里切换</div>
            </div>
          </div>
          <div class="hint" style="margin-top:14px">额度需要由管理员充值，请联系站长。</div>
        </div>

        <!-- 数据 -->
        <div v-else class="card">
          <div class="sec-t">数据</div>
          <div class="fields">
            <div class="field">
              <div class="field-k">掌握度导出</div>
              <div class="field-v">导出每道题的权重、作答次数与正确数</div>
              <div class="field-hint">JSON 格式，不含题目原文</div>
            </div>
          </div>
          <div class="saveline">
            <span></span>
            <button class="btn" @click="exportData">导出我的掌握度</button>
          </div>
          <div class="sep"></div>
          <div class="sec-t">危险操作</div>
          <div class="saveline">
            <span class="hint">退出后需要用密码重新登录</span>
            <button class="btn danger" @click="logout">退出登录</button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page{display:grid;grid-template-columns:176px minmax(0,1fr);gap:20px;padding:22px 0 60px;align-items:start}
.nav{display:flex;flex-direction:column;gap:3px;position:sticky;top:18px}
.nav-i{text-align:left;border:none;background:transparent;color:var(--muted);font-size:13px;
  padding:9px 13px;border-radius:9px;cursor:pointer;font-family:inherit}
.nav-i:hover{background:var(--surface2);color:var(--text)}
.nav-i.on{background:var(--primary-soft);color:#c7dbff}
.nav-i.danger:hover{background:var(--red-soft);color:#ffb3b9}
.nav-sep{height:1px;background:var(--border);margin:8px 10px}
.pane{min-width:0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 22px}
.idbox{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:1px solid var(--border);margin-bottom:18px}
.ava-lg{width:52px;height:52px;border-radius:14px;background:linear-gradient(140deg,#3a4c78,#243049);
  display:grid;place-items:center;font-size:20px;color:#cfe0ff;border:1px solid var(--border2);flex:none}
.id-t{flex:1;line-height:1.4}
.id-t b{display:block;font-size:16px}
.id-t span{font-size:12px;color:var(--muted2)}
.btn{border:1px solid var(--border2);background:var(--surface2);color:var(--text);border-radius:9px;
  padding:8px 16px;font-size:12.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
.btn:hover{border-color:#3a4456;background:var(--surface3)}
.btn.ghost{background:transparent}
.btn.danger{border-color:rgba(239,95,107,.35);color:#ffb3b9;background:var(--red-soft)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.fields{display:flex;flex-direction:column}
.field{display:grid;grid-template-columns:112px 1fr;gap:14px;padding:11px 0;border-bottom:1px dashed rgba(255,255,255,.04)}
.field:last-child{border-bottom:none}
.field-k{font-size:12.5px;color:var(--muted2)}
.field-v{font-size:13px;color:#c8cfdb;min-width:0}
.field-hint{grid-column:2;font-size:11px;color:#4f5766;margin-top:-4px}
.sep{height:1px;background:var(--border);margin:18px 0}
.sec-t{font-size:13px;font-weight:600;margin-bottom:12px}
.form{display:flex;flex-direction:column;gap:9px;max-width:340px}
.inp{height:38px;padding:0 12px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);
  color:var(--text);font-size:13px;outline:none;font-family:inherit}
.inp:focus{border-color:rgba(76,141,255,.6)}
.saveline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}
.hint{font-size:11.5px;color:var(--muted2)}
.sess{display:flex;flex-direction:column;gap:8px}
.srow{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:9px;
  background:var(--surface2);border:1px solid var(--border);font-size:12px}
.tail{font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--muted)}
.exp{color:var(--muted2);font-variant-numeric:tabular-nums;margin-left:auto}
.cur{font-size:10.5px;color:var(--green);font-weight:500}
.del{border:none;background:transparent;color:var(--muted2);font-size:11.5px;cursor:pointer}
.del:hover{color:var(--red)}
.quota-box{background:linear-gradient(140deg,#141a26,#121620);border:1px solid rgba(76,141,255,.22);
  border-radius:12px;padding:18px 20px;margin-bottom:16px}
.qb-k{font-size:11.5px;color:var(--muted2)}
.qb-v{font-size:30px;font-weight:600;letter-spacing:-.5px;margin:4px 0 6px}
.qb-v small{font-size:12px;color:var(--muted2);margin-left:4px;font-weight:400}
.qb-t{font-size:11px;color:var(--muted2)}
@media (max-width:1120px){ .page{grid-template-columns:1fr} .nav{flex-direction:row;position:static;overflow-x:auto} }
</style>
