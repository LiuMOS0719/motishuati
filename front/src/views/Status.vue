<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { health, notice } from '../api/course.js'
import LoadingBlock from '../components/LoadingBlock.vue'

const router = useRouter()
const loading = ref(true)
const info = ref(null)
const noticeText = ref('')
const err = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    const [h, n] = await Promise.all([health(), notice()])
    info.value = h
    noticeText.value = n.text || ''
  } catch (e) {
    err.value = e.message || '服务不可用'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="wrap inner">
      <div class="card pad">
        <div class="hd">
          <div class="logo">墨</div>
          <div>
            <div class="t">服务状态</div>
            <div class="s">ISTQB® CTFL 基础级刷题</div>
          </div>
        </div>

        <LoadingBlock v-if="loading" />

        <div v-else-if="err" class="down">
          <div class="badge red">服务不可用</div>
          <p>{{ err }}</p>
          <button class="btn sm" @click="load">重新检查</button>
        </div>

        <div v-else class="ok">
          <div class="badge green">运行正常</div>
          <dl>
            <dt>题库</dt><dd class="num">{{ info?.questions }} 题</dd>
            <dt>AI 助手</dt><dd>{{ info?.ai ? '已启用（' + info.model + '）' : '未启用' }}</dd>
            <dt>版本</dt><dd>{{ info?.version }}</dd>
          </dl>
          <div v-if="noticeText" class="notice-box">
            <b>公告</b>
            <p>{{ noticeText }}</p>
          </div>
          <div class="ops">
            <button class="btn primary" @click="router.push('/')">进入刷题</button>
            <button class="btn" @click="load">刷新状态</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page{min-height:100vh;display:flex;align-items:center;padding:30px 0}
.inner{display:flex;justify-content:center}
.pad{width:min(520px,94vw);padding:26px 26px 22px}
.hd{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.logo{width:42px;height:42px;border-radius:11px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-size:19px;font-weight:700;color:#fff}
.t{font-size:17px;font-weight:600}
.s{font-size:11.5px;color:var(--muted2);letter-spacing:.06em}
.badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;margin-bottom:14px}
.badge.green{background:var(--green-soft);color:#8fe9c2;border:1px solid rgba(51,201,138,.3)}
.badge.red{background:var(--red-soft);color:#ffb3b9;border:1px solid rgba(239,95,107,.35)}
dl{display:grid;grid-template-columns:88px 1fr;gap:9px 14px;margin:0 0 16px;font-size:13px}
dt{color:var(--muted2)}
dd{margin:0;color:var(--text)}
.notice-box{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px}
.notice-box b{font-size:12px;color:var(--amber)}
.notice-box p{margin:6px 0 0;font-size:13px;color:var(--muted);line-height:1.7;white-space:pre-wrap}
.ops{display:flex;gap:10px}
.down p{font-size:13px;color:var(--red);margin:0 0 14px}
</style>
