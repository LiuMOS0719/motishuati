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
const fRange = ref('all')
const fMode = ref('')
const kw = ref('')

function label(src) {
  const v = String(src || '').trim()
  if (!v) return '练习'
  if (v === 'WRONG') return '未掌握题集'
  const ch = v.match(/^CH(\d+)$/i)
  if (ch) return `第 ${ch[1]} 章`
  if (v === 'EXTRA') return '附加题'
  if (/^[A-D]$/.test(v)) return course.paperName(v)
  if (v === 'MULTI') return '多卷混合'
  return v
}

const titleOf = (r) => {
  const srcs = String(r.sources || r.source || '').split(',').filter(Boolean)
  return srcs.length > 1 ? '多卷混合' : label(srcs[0])
}
const rateOf = (r) => (r.answered ? Math.round((Number(r.correct) / Number(r.answered)) * 100) : 0)
const dateOf = (ts) => {
  const d = new Date(Number(ts) || 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const clockOf = (ts) => {
  const d = new Date(Number(ts) || 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const stats = computed(() => {
  const all = rows.value
  const sumA = all.reduce((s, r) => s + Number(r.answered || 0), 0)
  const sumC = all.reduce((s, r) => s + Number(r.correct || 0), 0)
  const days = [...new Set(all.map((r) => dateOf(r.ts)))].sort().reverse()
  // 连续天数：从最近一天往前数
  let streak = 0
  if (days.length) {
    const dayMs = 86400000
    let cur = new Date(days[0] + 'T00:00:00').getTime()
    for (const d of days) {
      if (new Date(d + 'T00:00:00').getTime() === cur) { streak++; cur -= dayMs } else break
    }
  }
  return {
    n: all.length, answered: sumA,
    rate: sumA ? Math.round((sumC / sumA) * 100) : 0,
    streak,
  }
})

const filtered = computed(() => {
  const now = Date.now()
  const kwv = kw.value.trim()
  return rows.value
    .filter((r) => {
      if (fRange.value !== 'all') {
        const days = Number(fRange.value)
        if (now - Number(r.ts) > days * 86400000) return false
      }
      if (fMode.value && r.mode !== fMode.value) return false
      if (kwv) {
        const hay = `${titleOf(r)} ${r.source || ''} ${r.sources || ''}`
        if (!hay.toLowerCase().includes(kwv.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => Number(b.ts) - Number(a.ts))
})

// 按日期分组
const groups = computed(() => {
  const map = new Map()
  for (const r of filtered.value) {
    const d = dateOf(r.ts)
    if (!map.has(d)) map.set(d, [])
    map.get(d).push(r)
  }
  return [...map.entries()].map(([date, list]) => ({ date, list }))
})

async function load() {
  loading.value = true
  try {
    await course.load()
    const r = await sessionApi.list('ctfl', 200)
    rows.value = r.rows || []
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function drop(r) {
  const ok = await ui.ask({
    title: '删除这条记录？',
    message: `${dateOf(r.ts)} ${clockOf(r.ts)} 的这场练习会被删掉，题目掌握度也会重算。`,
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
      <div class="head">
        <h1>做题记录</h1>
        <p>按场次记录每一次练习 · 点任意一场查看逐题明细</p>
      </div>

      <div class="stats">
        <div class="stat"><div class="k">总场次</div><div class="v">{{ stats.n }}</div></div>
        <div class="stat"><div class="k">累计作答</div><div class="v">{{ stats.answered }}<small>题</small></div></div>
        <div class="stat"><div class="k">平均正确率</div><div class="v g">{{ stats.rate }}<small>%</small></div></div>
        <div class="stat"><div class="k">连续练习</div><div class="v y">{{ stats.streak }}<small>天</small></div></div>
      </div>

      <div class="toolbar">
        <span class="fl">时间</span>
        <div class="tabs">
          <button :class="{ on: fRange === 'all' }" @click="fRange = 'all'">全部</button>
          <button :class="{ on: fRange === '30' }" @click="fRange = '30'">近 30 天</button>
          <button :class="{ on: fRange === '7' }" @click="fRange = '7'">近 7 天</button>
        </div>
        <span class="fl">模式</span>
        <div class="tabs">
          <button :class="{ on: !fMode }" @click="fMode = ''">全部</button>
          <button :class="{ on: fMode === 'order' }" @click="fMode = 'order'">顺序</button>
          <button :class="{ on: fMode === 'random' }" @click="fMode = 'random'">随机</button>
        </div>
        <div class="search">
          <span>🔍</span>
          <input v-model="kw" placeholder="搜索卷名 / 章节" />
        </div>
      </div>

      <LoadingBlock v-if="loading" />
      <EmptyState v-else-if="!filtered.length" title="还没有符合条件的记录" hint="换个筛选，或去主页开一场" />

      <div v-else class="groups">
        <div v-for="g in groups" :key="g.date" class="group">
          <div class="gdate">{{ g.date }}<span>{{ g.list.length }} 场</span></div>
          <div class="card list">
            <div v-for="r in g.list" :key="r.ext_id" class="row" @click="router.push('/result/' + r.ext_id)">
              <span class="clock">{{ clockOf(r.ts) }}</span>
              <span class="ttl">{{ titleOf(r) }}</span>
              <span class="mode">{{ r.mode === 'random' ? '随机' : '顺序' }}</span>
              <span class="cnt">{{ r.answered }} / {{ r.qcount }} 题</span>
              <span class="rate" :class="rateOf(r) >= 70 ? 'g' : (rateOf(r) >= 50 ? 'a' : 'r')">{{ rateOf(r) }}%</span>
              <span class="st" :class="{ done: r.finished }">{{ r.finished ? '已完成' : '未完成' }}</span>
              <button class="del" @click.stop="drop(r)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:22px 0 60px}
.head{margin-bottom:18px}
.head h1{margin:0 0 5px;font-size:19px;font-weight:600;letter-spacing:.3px}
.head p{margin:0;font-size:12px;color:var(--muted2)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:14px 16px}
.stat .k{font-size:11.5px;color:var(--muted2);margin-bottom:6px}
.stat .v{font-size:24px;font-weight:600;letter-spacing:-.5px}
.stat .v small{font-size:12px;color:var(--muted2);margin-left:2px;font-weight:400}
.stat .v.g{color:var(--green)}
.stat .v.y{color:var(--amber)}
.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 14px;margin-bottom:16px;
  background:var(--surface);border:1px solid var(--border);border-radius:12px}
.fl{font-size:11.5px;color:var(--muted2)}
.tabs{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:2px;gap:2px}
.tabs button{border:none;background:transparent;color:var(--muted2);font-size:11.5px;padding:4px 11px;
  border-radius:6px;cursor:pointer;font-family:inherit}
.tabs button.on{background:var(--surface3);color:var(--text)}
.search{margin-left:auto;display:flex;align-items:center;gap:7px;background:var(--surface2);
  border:1px solid var(--border);border-radius:8px;padding:5px 10px}
.search span{font-size:11px;opacity:.6}
.search input{border:none;background:transparent;color:var(--text);font-size:12px;outline:none;width:150px;font-family:inherit}
.group+.group{margin-top:16px}
.gdate{font-size:12px;color:var(--muted2);margin-bottom:8px;display:flex;align-items:center;gap:10px}
.gdate span{font-size:11px;color:#4f5766}
.list{overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:13px}
.row{display:flex;align-items:center;gap:14px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer}
.row:last-child{border-bottom:none}
.row:hover{background:var(--surface2)}
.clock{flex:none;width:44px;font-size:12px;color:var(--muted2);font-variant-numeric:tabular-nums}
.ttl{flex:1;min-width:0;font-size:13px;color:#c8cfdb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mode{flex:none;font-size:11px;color:var(--muted2);padding:2px 7px;border-radius:5px;background:var(--surface2)}
.cnt{flex:none;width:86px;text-align:right;font-size:12px;color:var(--muted2);font-variant-numeric:tabular-nums}
.rate{flex:none;width:48px;text-align:right;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.rate.g{color:#41d99a}
.rate.a{color:var(--amber)}
.rate.r{color:#ef6d79}
.st{flex:none;width:54px;text-align:right;font-size:11px;color:var(--muted2)}
.st.done{color:var(--green)}
.del{border:none;background:transparent;color:var(--muted2);font-size:11.5px;cursor:pointer;padding:3px 7px;border-radius:6px}
.del:hover{color:var(--red);background:var(--red-soft)}
@media (max-width:1120px){ .stats{grid-template-columns:repeat(2,1fr)} }
</style>
