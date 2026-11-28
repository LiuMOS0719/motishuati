<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import EmptyState from '../components/EmptyState.vue'
import { useCourseStore } from '../stores/course.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'

const router = useRouter()
const course = useCourseStore()
const ui = useUiStore()

const loading = ref(true)
const rows = ref([])
const sortKey = ref('ts')

const list = computed(() => {
  const arr = rows.value.slice()
  if (sortKey.value === 'rate') {
    arr.sort((a, b) => rateOf(b) - rateOf(a))
  } else {
    arr.sort((a, b) => Number(b.ts) - Number(a.ts))
  }
  return arr
})

const rateOf = (r) => (r.answered ? Math.round((Number(r.correct) / Number(r.answered)) * 100) : 0)

function fmtTs(ts) {
  const d = new Date(Number(ts) || 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    await course.load()
    const r = await sessionApi.list('ctfl', 100)
    rows.value = r.rows || []
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function open(r) {
  router.push('/result/' + r.ext_id)
}

async function drop(r) {
  const ok = await ui.ask({
    title: '删除这条记录？',
    message: `${fmtTs(r.ts)} 的这场练习会被删掉，题目掌握度也会重算。`,
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await sessionApi.remove(r.ext_id)
    rows.value = rows.value.filter((x) => x.ext_id !== r.ext_id)
    ui.toast('已删除', 'success')
  } catch (e) {
    ui.toast(e.message || '删除失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <div class="hd">
        <h1>做题记录</h1>
        <div class="hd-r">
          <button class="tab" :class="{ on: sortKey === 'ts' }" @click="sortKey = 'ts'">按时间</button>
          <button class="tab" :class="{ on: sortKey === 'rate' }" @click="sortKey = 'rate'">按正确率</button>
        </div>
      </div>

      <LoadingBlock v-if="loading" />
      <EmptyState v-else-if="!list.length" title="还没有练习记录" hint="去主页开一场试试">
        <button class="btn primary" @click="router.push('/')">去练习</button>
      </EmptyState>
      <div v-else class="card list">
        <div v-for="r in list" :key="r.ext_id" class="row" @click="open(r)">
          <span class="ts num">{{ fmtTs(r.ts) }}</span>
          <span class="src">
            <em v-for="s in String(r.sources || r.source || '').split(',').filter(Boolean)" :key="s">{{ course.paperName(s) }}</em>
          </span>
          <span class="cnt num">{{ r.answered }} / {{ r.qcount }} 题</span>
          <span class="rate num" :class="rateOf(r) >= 70 ? 'g' : (rateOf(r) >= 50 ? 'a' : 'r')">{{ rateOf(r) }}%</span>
          <span class="state" :class="{ done: r.finished }">{{ r.finished ? '已完成' : '未完成' }}</span>
          <button class="del" @click.stop="drop(r)">删除</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:22px 0 60px}
.hd{display:flex;align-items:center;margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.hd-r{margin-left:auto;display:flex;gap:5px}
.tab{border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;
  padding:5px 12px;border-radius:999px;cursor:pointer;font-family:inherit}
.tab.on{background:var(--primary-soft);border-color:rgba(76,141,255,.45);color:#cfe0ff}
.list{overflow:hidden}
.row{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--border);
  cursor:pointer;transition:.13s}
.row:last-child{border-bottom:none}
.row:hover{background:var(--surface2)}
.ts{font-size:12.5px;color:var(--muted);width:130px;flex:none}
.src{display:flex;gap:5px;flex:1;min-width:0;flex-wrap:wrap}
.src em{font-style:normal;font-size:11px;padding:2px 8px;border-radius:6px;background:var(--surface3);
  color:var(--muted);border:1px solid var(--border)}
.cnt{font-size:12.5px;color:var(--muted2);width:86px;text-align:right;flex:none}
.rate{font-size:13px;font-weight:600;width:52px;text-align:right;flex:none}
.rate.g{color:var(--green)}
.rate.a{color:var(--amber)}
.rate.r{color:var(--red)}
.state{font-size:11px;color:var(--muted2);width:52px;text-align:right;flex:none}
.state.done{color:var(--green)}
.del{border:none;background:transparent;color:var(--muted2);font-size:11.5px;cursor:pointer;padding:3px 7px;border-radius:6px}
.del:hover{color:var(--red);background:var(--red-soft)}
</style>
