<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useCourseStore } from '../stores/course.js'
import { useUiStore } from '../stores/ui.js'
import { useBankStore } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import SubjectBar from './SubjectBar.vue'

const auth = useAuthStore()
const course = useCourseStore()
const ui = useUiStore()
const bank = useBankStore()
const mastery = useMasteryStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)

// tokens 按「万」显示，与原型一致
const tokensText = computed(() => {
  const n = auth.tokens
  if (n >= 100000000) return (n / 100000000).toFixed(2) + ' 亿'
  if (n >= 10000) return (n / 10000).toFixed(0) + ' 万'
  return String(n)
})

const showNotice = computed(() => course.noticeActive && course.noticeText && !ui.noticeClosed)
const initial = computed(() => (auth.username || '?').slice(0, 1).toUpperCase())

function closeMenu(e) {
  if (!e.target.closest('.userbox')) menuOpen.value = false
}

async function go(name) {
  menuOpen.value = false
  router.push({ name })
}

async function logout() {
  menuOpen.value = false
  const ok = await ui.ask({ title: '退出登录？', message: '', confirmText: '退出' })
  if (!ok) return
  await auth.doLogout()
  bank.reset(); mastery.reset()
  router.replace('/login')
}

onMounted(() => {
  course.load().catch(() => {})
  document.addEventListener('click', closeMenu)
})
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
</script>

<template>
  <div class="shell">
    <div class="topbar">
      <div class="wrap topbar-in">
        <div class="brand" @click="router.push('/')">
          <div class="logo">墨</div>
          <div class="brand-t"><b>墨题</b><span>多科目 · 在线刷题</span></div>
        </div>

        <div class="notice">
          <div class="notice-in" v-if="showNotice">
            <i>📢</i>
            <span>{{ course.noticeText }}</span>
            <button class="nx" @click="ui.noticeClosed = true">×</button>
          </div>
        </div>

        <div class="userbox">
          <div class="quota" @click="go('settings')">tokens <b>{{ tokensText }}</b></div>
          <div class="uname">{{ auth.username }}</div>
          <div class="avatar" @click.stop="menuOpen = !menuOpen">{{ initial }}</div>

          <div v-if="menuOpen" class="umenu">
            <button @click="go('history')">做题记录</button>
            <button @click="go('papers')">试卷选择</button>
            <button @click="go('settings')">个人设置</button>
            <button v-if="auth.isAdmin" @click="go('admin-users')">后台管理</button>
            <div class="sep"></div>
            <button class="danger" @click="logout">退出登录</button>
          </div>
        </div>
      </div>
    </div>

    <SubjectBar v-if="route.name !== 'status'" />

    <main class="main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell{min-height:100%;display:flex;flex-direction:column}
.topbar{border-bottom:1px solid var(--border);background:linear-gradient(180deg,#0d1017,#0a0c11)}
.topbar-in{display:flex;align-items:center;gap:18px;height:62px}
.brand{display:flex;align-items:center;gap:10px;cursor:pointer;flex:none}
.logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-weight:700;font-size:15px;color:#fff;box-shadow:0 6px 18px rgba(60,120,255,.28)}
.brand-t{display:flex;flex-direction:column;line-height:1.25}
.brand-t b{font-size:16px;letter-spacing:.5px}
.brand-t span{font-size:11px;color:var(--muted2);letter-spacing:.14em}
.notice{flex:1;min-width:0}
.notice-in{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;
  background:var(--surface2);border:1px solid var(--border);font-size:12.5px;color:var(--muted);
  white-space:nowrap;overflow:hidden}
.notice-in i{font-style:normal;color:var(--amber)}
.notice-in span{overflow:hidden;text-overflow:ellipsis}
.nx{margin-left:auto;border:none;background:transparent;color:var(--muted2);cursor:pointer;font-size:15px;line-height:1;flex:none}
.userbox{display:flex;align-items:center;gap:10px;flex:none;position:relative}
.quota{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--green-soft);
  border:1px solid rgba(51,201,138,.28);color:#7ee6b7;cursor:pointer;white-space:nowrap}
.quota b{color:#a9f5d1;font-variant-numeric:tabular-nums}
.uname{font-size:13px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(140deg,#3a4c78,#243049);
  display:grid;place-items:center;font-size:12px;color:#cfe0ff;border:1px solid var(--border2);cursor:pointer}
.umenu{position:absolute;right:0;top:40px;min-width:132px;background:var(--surface2);
  border:1px solid var(--border2);border-radius:11px;padding:5px;z-index:200;
  box-shadow:0 14px 34px rgba(0,0,0,.5)}
.umenu button{display:block;width:100%;text-align:left;border:none;background:transparent;color:var(--muted);
  font-size:12.5px;padding:7px 11px;border-radius:7px;cursor:pointer;font-family:inherit}
.umenu button:hover{background:var(--surface3);color:var(--text)}
.umenu button.danger:hover{background:var(--red-soft);color:#ffb3b9}
.umenu .sep{height:1px;background:var(--border);margin:4px 6px}
.main{flex:1;min-height:0}
@media (max-width:1120px){ .notice{display:none} .uname{display:none} }
</style>
