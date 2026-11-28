<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useUiStore } from '../stores/ui.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const mode = ref('login')     // login | register
const username = ref('')
const password = ref('')
const password2 = ref('')
const busy = ref(false)
const err = ref('')

onMounted(() => {
  if (auth.isLogin) router.replace('/')
})

async function submit() {
  err.value = ''
  if (!username.value.trim()) return (err.value = '请输入用户名')
  if (!password.value) return (err.value = '请输入密码')
  if (mode.value === 'register' && password.value !== password2.value) {
    return (err.value = '两次输入的密码不一致')
  }
  busy.value = true
  try {
    const ok = mode.value === 'login'
      ? await auth.doLogin(username.value.trim(), password.value)
      : await auth.doRegister(username.value.trim(), password.value)
    if (!ok) {
      err.value = auth.error || '操作失败'
      return
    }
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/')
      ? route.query.next : '/'
    router.replace(next)
  } catch (e) {
    err.value = e.message || '操作失败'
  } finally {
    busy.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  err.value = ''
  password.value = ''
  password2.value = ''
}
</script>

<template>
  <div class="page">
    <div class="panel">
      <div class="hd">
        <div class="logo">墨</div>
        <div>
          <div class="t">墨题</div>
          <div class="s">ISTQB® CTFL 基础级刷题</div>
        </div>
      </div>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="3-20 位，字母数字下划线或中文" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="至少 6 位" />
        </label>
        <label v-if="mode === 'register'" class="field">
          <span>确认密码</span>
          <input v-model="password2" type="password" autocomplete="new-password" placeholder="再输入一次" />
        </label>

        <div v-if="err" class="err">{{ err }}</div>

        <button class="btn primary submit" type="submit" :disabled="busy">
          {{ busy ? '处理中…' : (mode === 'login' ? '登录' : '注册并登录') }}
        </button>
      </form>

      <div class="ft">
        <span class="hint">{{ mode === 'login' ? '还没有账号？' : '已有账号？' }}</span>
        <button class="link" @click="switchMode">{{ mode === 'login' ? '注册一个' : '去登录' }}</button>
      </div>
    </div>

    <div class="copy">
      © 国际软件测试认证委员会中国分会（CSTQB®）· 本站仅用于个人备考
      <button class="link mini" @click="router.push('/status')">服务状态</button>
    </div>
  </div>
</template>

<style scoped>
.page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px}
.panel{width:min(390px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:16px;
  padding:28px 26px 22px;box-shadow:0 24px 70px rgba(0,0,0,.45)}
.hd{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.logo{width:44px;height:44px;border-radius:12px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-size:20px;font-weight:700;color:#fff;box-shadow:0 8px 22px rgba(60,120,255,.3)}
.t{font-size:19px;font-weight:600;letter-spacing:.5px}
.s{font-size:11.5px;color:var(--muted2);letter-spacing:.06em;margin-top:2px}
.form{display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}
.field span{font-size:12px;color:var(--muted2);letter-spacing:.04em}
.field input{height:40px;padding:0 12px;border-radius:9px;background:var(--surface2);
  border:1px solid var(--border2);color:var(--text);font-size:13.5px;outline:none;transition:.15s}
.field input:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
.err{font-size:12.5px;color:var(--red);background:var(--red-soft);border:1px solid rgba(239,95,107,.3);
  padding:8px 11px;border-radius:8px}
.submit{height:42px;font-size:14px;margin-top:2px}
.ft{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;font-size:12.5px}
.link{border:none;background:transparent;color:var(--primary);cursor:pointer;font-size:12.5px;padding:0}
.link.mini{font-size:11.5px;color:var(--muted2)}
.copy{font-size:11.5px;color:var(--muted2);text-align:center;max-width:520px;line-height:1.7}
</style>
