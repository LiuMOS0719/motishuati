<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useCourseStore } from '../stores/course.js'
import { useUiStore } from '../stores/ui.js'

const auth = useAuthStore()
const course = useCourseStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const navs = computed(() => {
  const list = [
    { name: 'home', label: '主页' },
    { name: 'papers', label: '试卷' },
    { name: 'history', label: '记录' },
    { name: 'settings', label: '设置' },
  ]
  if (auth.isAdmin) list.push({ name: 'admin-users', label: '管理' })
  return list
})

const showNotice = computed(() => course.noticeActive && course.noticeText && !ui.noticeClosed)
const initial = computed(() => (auth.username || '?').slice(0, 1).toUpperCase())

onMounted(() => {
  course.load().catch(() => {})
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="wrap topbar-in">
        <div class="brand" @click="router.push('/')">
          <div class="logo">墨</div>
          <div class="brand-t">
            <b>墨题</b>
            <span>ISTQB · CTFL</span>
          </div>
        </div>

        <nav class="nav">
          <button
            v-for="n in navs" :key="n.name"
            class="nav-btn" :class="{ on: route.name === n.name }"
            @click="router.push({ name: n.name })"
          >{{ n.label }}</button>
        </nav>

        <div class="notice" v-if="showNotice">
          <div class="notice-in">
            <i>公告</i>
            <span>{{ course.noticeText }}</span>
            <button class="x" @click="ui.noticeClosed = true">×</button>
          </div>
        </div>
        <div v-else class="notice"></div>

        <div class="userbox">
          <button class="quota" @click="router.push('/settings')" :title="'AI 余额（token）'">
            <b class="num">{{ auth.tokens }}</b> token
          </button>
          <span class="uname">{{ auth.username }}</span>
          <div class="avatar">{{ initial }}</div>
        </div>
      </div>
    </header>

    <main class="main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell{min-height:100%;display:flex;flex-direction:column}
.topbar{border-bottom:1px solid var(--border);background:linear-gradient(180deg,#0d1017,#0a0c11);position:sticky;top:0;z-index:60}
.topbar-in{display:flex;align-items:center;gap:18px;height:62px}
.brand{display:flex;align-items:center;gap:10px;cursor:pointer;flex:none}
.logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-weight:700;font-size:15px;color:#fff;box-shadow:0 6px 18px rgba(60,120,255,.28)}
.brand-t{display:flex;flex-direction:column;line-height:1.25}
.brand-t b{font-size:16px;letter-spacing:.5px}
.brand-t span{font-size:11px;color:var(--muted2);letter-spacing:.14em}
.nav{display:flex;gap:4px;flex:none}
.nav-btn{border:none;background:transparent;color:var(--muted);font-size:13px;padding:6px 12px;
  border-radius:8px;cursor:pointer;transition:.15s}
.nav-btn:hover{color:var(--text);background:var(--surface2)}
.nav-btn.on{color:#cfe0ff;background:var(--primary-soft)}
.notice{flex:1;min-width:0}
.notice-in{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;
  background:var(--surface2);border:1px solid var(--border);font-size:12.5px;color:var(--muted);
  white-space:nowrap;overflow:hidden}
.notice-in i{font-style:normal;color:var(--amber);flex:none}
.notice-in span{overflow:hidden;text-overflow:ellipsis}
.notice-in .x{margin-left:auto;border:none;background:transparent;color:var(--muted2);cursor:pointer;font-size:15px;line-height:1}
.userbox{display:flex;align-items:center;gap:10px;flex:none}
.quota{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--green-soft);
  border:1px solid rgba(51,201,138,.28);color:#7ee6b7;cursor:pointer}
.quota b{color:#a9f5d1}
.uname{font-size:13px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(140deg,#3a4c78,#243049);
  display:grid;place-items:center;font-size:12px;color:#cfe0ff;border:1px solid var(--border2)}
.main{flex:1;min-height:0}
@media (max-width:1120px){
  .notice{display:none}
  .uname{display:none}
}
</style>
