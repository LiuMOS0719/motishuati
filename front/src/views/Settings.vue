<script setup>
import { ref, onMounted } from 'vue'
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

const oldPw = ref('')
const newPw = ref('')
const newPw2 = ref('')
const busy = ref(false)
const sessions = ref([])

async function loadSessions() {
  try {
    const r = await authApi.sessions()
    sessions.value = r.rows || []
  } catch { sessions.value = [] }
}

async function changePw() {
  if (!oldPw.value || !newPw.value) return ui.toast('请填写原密码和新密码', 'warn')
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
  } finally {
    busy.value = false
  }
}

async function kick(tail) {
  const ok = await ui.ask({ title: '让这个会话下线？', message: '那台设备需要重新登录。', confirmText: '下线' })
  if (!ok) return
  try {
    await authApi.kickSession(tail)
    await loadSessions()
    ui.toast('已下线', 'success')
  } catch (e) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function exportData() {
  try {
    const [w, stats] = await Promise.all([mastery.load('ctfl', true), Promise.resolve(mastery.stats)])
    const payload = {
      exported_at: new Date().toISOString(),
      username: auth.username,
      stats: stats || mastery.stats,
      weights: mastery.rows,
    }
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `moti-${auth.username}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    ui.toast(e.message || '导出失败', 'error')
  }
}

async function logout() {
  const ok = await ui.ask({ title: '退出登录？', message: '', confirmText: '退出' })
  if (!ok) return
  await auth.doLogout()
  bank.reset()
  mastery.reset()
  router.replace('/login')
}

onMounted(loadSessions)
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <h1>个人设置</h1>

      <div class="cols">
        <div class="card pad">
          <div class="ch"><h2>账号</h2></div>
          <dl>
            <dt>用户名</dt><dd>{{ auth.username }}</dd>
            <dt>身份</dt><dd>{{ auth.isOwner ? '站长' : (auth.isAdmin ? '管理员' : '普通用户') }}</dd>
            <dt>AI 余额</dt><dd class="num">{{ auth.tokens }} token</dd>
          </dl>
          <div class="divider"></div>
          <div class="ch"><h2>修改密码</h2></div>
          <div class="form">
            <input v-model="oldPw" class="inp" type="password" placeholder="原密码" autocomplete="current-password" />
            <input v-model="newPw" class="inp" type="password" placeholder="新密码（至少 6 位）" autocomplete="new-password" />
            <input v-model="newPw2" class="inp" type="password" placeholder="再输一次新密码" autocomplete="new-password" />
            <button class="btn primary" :disabled="busy" @click="changePw">{{ busy ? '提交中…' : '修改密码' }}</button>
            <p class="hint">改完所有设备都要重新登录。</p>
          </div>
        </div>

        <div class="side">
          <div class="card pad">
            <div class="ch"><h2>登录中的设备</h2><button class="link" @click="loadSessions">刷新</button></div>
            <div v-if="!sessions.length" class="hint">没有有效会话</div>
            <div v-else class="sess">
              <div v-for="s in sessions" :key="s.tail" class="srow">
                <span class="tail num">…{{ s.tail }}</span>
                <span class="hint num">{{ s.expires_at }}</span>
                <b v-if="s.current" class="cur">当前</b>
                <button v-else class="del" @click="kick(s.tail)">下线</button>
              </div>
            </div>
          </div>

          <div class="card pad">
            <div class="ch"><h2>数据</h2></div>
            <button class="btn" @click="exportData">导出我的掌握度</button>
            <p class="hint" style="margin-top:9px">导出的是每题权重，不含题目内容。</p>
          </div>

          <div class="card pad">
            <div class="ch"><h2>其他</h2></div>
            <button class="btn danger" @click="logout">退出登录</button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:22px 0 60px}
.page h1{margin:0 0 16px;font-size:17px;font-weight:600}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
.pad{padding:18px 20px}
.ch{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.ch h2{margin:0;font-size:14px;font-weight:600}
.link{margin-left:auto;border:none;background:transparent;color:var(--primary);font-size:12px;cursor:pointer}
dl{display:grid;grid-template-columns:76px 1fr;gap:8px 12px;margin:0;font-size:13px}
dt{color:var(--muted2)}
dd{margin:0}
.divider{height:1px;background:var(--border);margin:18px 0}
.form{display:flex;flex-direction:column;gap:9px;max-width:320px}
.inp{height:36px;padding:0 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);
  color:var(--text);font-size:13px;outline:none}
.inp:focus{border-color:var(--primary)}
.side{display:flex;flex-direction:column;gap:14px}
.sess{display:flex;flex-direction:column;gap:7px}
.srow{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:var(--surface2);
  border:1px solid var(--border);font-size:12px}
.tail{color:var(--muted);font-family:ui-monospace,Menlo,Consolas,monospace}
.cur{margin-left:auto;font-size:10.5px;color:var(--green);font-weight:500}
.del{margin-left:auto;border:none;background:transparent;color:var(--muted2);font-size:11.5px;cursor:pointer}
.del:hover{color:var(--red)}
@media (max-width:1120px){.cols{grid-template-columns:1fr}}
</style>
