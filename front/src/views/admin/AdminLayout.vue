<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import * as adminApi from '../../api/admin.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const ov = ref(null)

const menus = computed(() => [
  { name: 'admin-users', label: '用户', badge: 0 },
  { name: 'admin-feedback', label: '题目反馈', badge: ov.value?.feedback_open || 0 },
  { name: 'admin-site-feedback', label: '想法记录', badge: ov.value?.notes_open || 0 },
  { name: 'admin-papers', label: '试卷与大纲', badge: 0 },
  { name: 'admin-notice', label: '公告与备份', badge: 0 },
  { name: 'admin-logs', label: '操作日志', badge: 0 },
])

async function loadOverview() {
  try { ov.value = await adminApi.overview() } catch {}
}

onMounted(loadOverview)
defineExpose({ loadOverview })
</script>

<template>
  <div class="admin">
    <aside class="side">
      <div class="brand" @click="router.push('/')">
        <div class="logo">墨</div>
        <div class="bt"><b>后台</b><span>管理控制台</span></div>
      </div>

      <nav class="menu">
        <button
          v-for="m in menus" :key="m.name"
          class="mi" :class="{ on: route.name === m.name }"
          @click="router.push({ name: m.name })"
        >
          <span>{{ m.label }}</span>
          <em v-if="m.badge" class="badge num">{{ m.badge }}</em>
        </button>
      </nav>

      <div class="ov" v-if="ov">
        <div class="ov-row"><span>用户</span><b class="num">{{ ov.users }}</b></div>
        <div class="ov-row"><span>题库</span><b class="num">{{ ov.questions }}</b></div>
        <div class="ov-row"><span>场次</span><b class="num">{{ ov.sessions }}</b></div>
        <div class="ov-row"><span>7 日 AI</span><b class="num">{{ ov.ai_7d?.calls }}</b></div>
      </div>

      <div class="ft">
        <span class="hint">{{ auth.username }}</span>
        <button class="link" @click="router.push('/')">返回前台</button>
      </div>
    </aside>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <component :is="Component" @changed="loadOverview" />
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.admin{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:100vh;background:var(--bg)}
.side{border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;
  padding:16px 12px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;padding:0 6px 16px;cursor:pointer}
.logo{width:32px;height:32px;border-radius:9px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-weight:700;font-size:14px;color:#fff}
.bt{display:flex;flex-direction:column;line-height:1.25}
.bt b{font-size:14px}
.bt span{font-size:10.5px;color:var(--muted2);letter-spacing:.1em}
.menu{display:flex;flex-direction:column;gap:2px;flex:1}
.mi{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;border:none;
  background:transparent;color:var(--muted);font-size:13px;cursor:pointer;text-align:left;font-family:inherit}
.mi:hover{background:var(--surface2);color:var(--text)}
.mi.on{background:var(--primary-soft);color:#cfe0ff}
.badge{margin-left:auto;font-style:normal;font-size:10.5px;min-width:18px;height:18px;border-radius:9px;
  background:var(--red);color:#fff;display:grid;place-items:center;padding:0 5px}
.ov{border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:6px}
.ov-row{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted2);padding:0 6px}
.ov-row b{color:var(--muted)}
.ft{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);
  padding-top:12px;margin-top:12px}
.link{border:none;background:transparent;color:var(--primary);font-size:11.5px;cursor:pointer}
.content{padding:22px 26px 60px;min-width:0}
@media (max-width:1120px){
  .admin{grid-template-columns:1fr}
  .side{position:static;height:auto;flex-direction:row;align-items:center;overflow-x:auto;gap:10px}
  .menu{flex-direction:row}
  .ov,.ft{display:none}
}
</style>
