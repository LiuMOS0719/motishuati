<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { health } from '../api/course.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mode = ref('login')
const username = ref('')
const password = ref('')
const password2 = ref('')
const busy = ref(false)
const err = ref('')
const healthy = ref(null)

const isReg = computed(() => mode.value === 'reg')

onMounted(async () => {
  if (auth.isLogin) router.replace('/')
  try { const h = await health(); healthy.value = Boolean(h.ok) } catch { healthy.value = false }
})

function switchMode(m) {
  mode.value = m
  err.value = ''
  password.value = ''
  password2.value = ''
}

async function submit() {
  err.value = ''
  if (!username.value.trim()) { err.value = '请输入用户名'; return }
  if (!password.value) { err.value = '请输入密码'; return }
  if (isReg.value && password.value !== password2.value) { err.value = '两次密码不一致'; return }

  busy.value = true
  try {
    const ok = isReg.value
      ? await auth.doRegister(username.value.trim(), password.value)
      : await auth.doLogin(username.value.trim(), password.value)
    if (!ok) { err.value = auth.error || '操作失败'; return }
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    router.replace(next)
  } catch (e) {
    err.value = e.message || '操作失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wrap">
    <div class="card">
      <section class="brand">
        <div class="logo">墨</div>
        <h1>墨题</h1>
        <p class="sub">多科目 · 在线刷题</p>
        <ul class="feat">
          <li><span><b>按掌握度抽题</b><br>越不熟的题出现得越频繁，不是平均轮一遍</span></li>
          <li><span><b>题题有解析</b><br>确认答案后当场给对错、给解析、给图表</span></li>
        </ul>
        <div class="brand-foot">© 2026 墨题 moti · shuati.liumos.top</div>
      </section>

      <section class="pane">
        <div class="tabs">
          <button :class="{ on: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button :class="{ on: mode === 'reg' }" @click="switchMode('reg')">注册</button>
        </div>

        <div v-if="err" class="alert bad">{{ err }}</div>

        <div class="form">
          <div class="field">
            <label>用户名</label>
            <input v-model="username" placeholder="输入用户名" autocomplete="username" @keydown.enter="submit" />
          </div>
          <div class="field">
            <label>密码</label>
            <input v-model="password" type="password" placeholder="输入密码"
              :autocomplete="isReg ? 'new-password' : 'current-password'" @keydown.enter="submit" />
          </div>
          <template v-if="isReg">
            <div class="field">
              <label>确认密码</label>
              <input v-model="password2" type="password" placeholder="再输一次" autocomplete="new-password" @keydown.enter="submit" />
            </div>
            <div class="tip">用户名 3–20 位，字母数字下划线或中文</div>
          </template>

          <button class="go" :disabled="busy" @click="submit">
            {{ busy ? '请稍候…' : (isReg ? '注 册' : '登 录') }}
          </button>

          <div class="after">
            <span>忘记密码请联系管理员重置</span>
            <a @click="switchMode(isReg ? 'login' : 'reg')">{{ isReg ? '已有账号？' : '没有账号？' }}</a>
          </div>
        </div>

        <div class="pane-foot">
          <span class="st" :class="{ down: healthy === false }"><i></i>{{ healthy === false ? '服务异常' : '服务正常' }}</span>
          <a @click="router.push('/status')">查看状态</a>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap{min-height:100vh;display:grid;place-items:center;padding:44px 24px}
.card{width:960px;max-width:96vw;display:grid;grid-template-columns:1fr 1.02fr;border:1px solid var(--border);
  border-radius:18px;overflow:hidden;background:var(--surface);box-shadow:0 32px 96px rgba(0,0,0,.55)}
.brand{padding:44px 42px;background:linear-gradient(158deg,#101a2e,#0c1119 62%);
  border-right:1px solid var(--border);display:flex;flex-direction:column;position:relative}
.brand:after{content:"";position:absolute;inset:0;
  background:radial-gradient(400px 260px at 10% 8%,rgba(76,141,255,.12),transparent 70%);pointer-events:none}
.logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-weight:700;font-size:19px;color:#fff;box-shadow:0 8px 24px rgba(60,120,255,.32)}
.brand h1{margin:20px 0 4px;font-size:23px;letter-spacing:2px;font-weight:600}
.brand .sub{margin:0;font-size:12.5px;color:var(--muted2);letter-spacing:.16em}
.feat{margin:30px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:15px;position:relative;z-index:1}
.feat li{display:flex;gap:11px;font-size:12.5px;color:var(--muted);line-height:1.6}
.feat li:before{content:"";flex:none;width:3px;height:14px;margin-top:2px;border-radius:2px;background:rgba(76,141,255,.55)}
.feat b{color:#c8d2e2;font-weight:500}
.brand-foot{margin-top:auto;padding-top:32px;font-size:11px;color:var(--muted2);letter-spacing:.2px;position:relative;z-index:1}
.pane{padding:38px 44px 34px;display:flex;flex-direction:column}
.tabs{display:flex;gap:26px;border-bottom:1px solid var(--border);margin-bottom:24px}
.tabs button{border:none;background:transparent;cursor:pointer;position:relative;padding:0 0 11px;
  font-size:14px;color:var(--muted2);font-family:inherit}
.tabs button.on{color:var(--text);font-weight:500}
.tabs button.on:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;
  background:var(--primary);border-radius:2px}
.alert{margin-bottom:16px;padding:9px 12px;border-radius:9px;font-size:12.5px;line-height:1.6}
.alert.bad{background:rgba(239,95,107,.1);border:1px solid rgba(239,95,107,.3);color:#ff9aa3}
.form{display:flex;flex-direction:column}
.field{margin-bottom:15px}
.field label{display:block;font-size:11.5px;color:var(--muted2);letter-spacing:.2px;margin-bottom:6px}
.field input{width:100%;height:40px;background:var(--surface2);border:1px solid var(--border);border-radius:9px;
  color:var(--text);font-family:inherit;font-size:13.5px;padding:0 12px;outline:none;transition:.15s}
.field input::placeholder{color:#4f5766;font-size:12.5px}
.field input:focus{border-color:rgba(76,141,255,.6);box-shadow:0 0 0 3px rgba(76,141,255,.1)}
.tip{font-size:11px;color:var(--muted2);margin-top:6px}
.go{margin-top:8px;height:44px;border:none;border-radius:10px;color:#fff;font-size:14.5px;font-weight:600;
  letter-spacing:2px;font-family:inherit;cursor:pointer;
  background:linear-gradient(135deg,#3f7cf5,#5b96ff);box-shadow:0 10px 26px rgba(63,124,245,.32)}
.go:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.after{display:flex;align-items:center;justify-content:space-between;margin-top:16px;font-size:11.5px;color:var(--muted2)}
.after a{color:var(--primary);cursor:pointer}
.pane-foot{margin-top:auto;padding-top:26px;display:flex;align-items:center;justify-content:space-between;
  font-size:11px;color:var(--muted2)}
.st{display:flex;align-items:center;gap:6px}
.st i{width:6px;height:6px;border-radius:50%;background:var(--green)}
.st.down i{background:var(--red)}
.pane-foot a{color:var(--muted2);cursor:pointer;border-bottom:1px dashed var(--border2)}
.pane-foot a:hover{color:var(--primary)}
@media (max-width:820px){
  .card{grid-template-columns:1fr}
  .brand{display:none}
}
</style>
