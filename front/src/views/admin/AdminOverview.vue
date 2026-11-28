<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const router = useRouter()
const ui = useUiStore()

const loading = ref(true)
const ov = ref(null)
const logs = ref([])
const hot = ref([])

async function load() {
  loading.value = true
  try {
    const [o, l] = await Promise.all([adminApi.overview(), adminApi.logs(8)])
    ov.value = o
    logs.value = l.rows || []
    hot.value = o.hot_questions || []
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="hd"><h1>概览</h1><button class="btn sm" @click="load">刷新</button></div>

    <div class="grid4">
      <div class="card">
        <div class="k">用户</div>
        <div class="v">{{ ov?.users ?? '—' }}</div>
        <div class="t">在用账号</div>
      </div>
      <div class="card">
        <div class="k">题库</div>
        <div class="v">{{ ov?.questions ?? '—' }}</div>
        <div class="t">道题目</div>
      </div>
      <div class="card">
        <div class="k">练习场次</div>
        <div class="v">{{ ov?.sessions ?? '—' }}</div>
        <div class="t">累计</div>
      </div>
      <div class="card">
        <div class="k">7 日 AI</div>
        <div class="v">{{ ov?.ai_7d?.calls ?? '—' }}</div>
        <div class="t">消耗 {{ ov?.ai_7d?.cost ?? 0 }} token</div>
      </div>
    </div>

    <div class="box">
      <div class="box-h">
        <b>待处理</b>
        <span class="r" @click="router.push({ name: 'admin-feedback' })">去处理 ›</span>
      </div>
      <div class="rows">
        <div class="row"><span class="k">题目反馈</span><span class="v" :class="{ warn: ov?.feedback_open }">{{ ov?.feedback_open ?? 0 }} 条</span></div>
        <div class="row"><span class="k">想法记录</span><span class="v" :class="{ warn: ov?.notes_open }">{{ ov?.notes_open ?? 0 }} 条</span></div>
      </div>
    </div>

    <div class="box">
      <div class="box-h"><b>被反馈最多的题</b></div>
      <div v-if="hot.length" class="rows">
        <div v-for="h in hot" :key="h.qid" class="row">
          <span class="k mono">{{ h.qid }}</span>
          <span class="v">{{ h.n }} 条</span>
          <span class="r" @click="router.push('/admin/question/' + h.qid)">编辑 ›</span>
        </div>
      </div>
      <div v-else class="none">暂无反馈</div>
    </div>

    <div class="box">
      <div class="box-h"><b>最近操作</b><span class="r" @click="router.push({ name: 'admin-logs' })">全部日志 ›</span></div>
      <div v-if="logs.length" class="rows">
        <div v-for="l in logs" :key="l.id" class="row">
          <span class="k">{{ l.created_at }}</span>
          <span class="mid">{{ l.username || '—' }} · {{ l.action }}</span>
          <span class="v small">{{ (l.detail || '').slice(0, 40) }}</span>
        </div>
      </div>
      <div v-else class="none">还没有操作记录</div>
    </div>
  </div>
</template>

<style scoped>
.hd{display:flex;align-items:center;margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.hd .btn{margin-left:auto}
.btn{border:1px solid var(--border2);background:var(--surface2);color:var(--text);border-radius:9px;
  padding:6px 14px;font-size:12.5px;cursor:pointer;font-family:inherit}
.btn.sm{padding:5px 12px;font-size:12px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:15px 17px}
.card .k{font-size:11.5px;color:var(--muted2);margin-bottom:6px}
.card .v{font-size:25px;font-weight:600;letter-spacing:-.5px}
.card .t{font-size:11px;color:var(--muted2);margin-top:5px}
.box{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:16px 18px;margin-bottom:14px}
.box-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.box-h b{font-size:13.5px}
.box-h .r{font-size:11.5px;color:var(--primary);cursor:pointer}
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:12px;padding:8px 0;font-size:12.5px;color:var(--muted2)}
.row+.row{border-top:1px dashed rgba(255,255,255,.045)}
.row .k{flex:none;width:78px}
.row .k.mono{font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--primary);font-size:11.5px}
.row .mid{flex:1;min-width:0;color:#c2cad8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .v{color:#c2cad8;margin-left:auto;font-variant-numeric:tabular-nums}
.row .v.warn{color:var(--amber)}
.row .v.small{font-size:11.5px;color:var(--muted2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .r{font-size:11.5px;color:var(--primary);cursor:pointer;margin-left:10px}
.none{font-size:12px;color:var(--muted2);padding:8px 0}
@media (max-width:1120px){ .grid4{grid-template-columns:repeat(2,1fr)} }
</style>
