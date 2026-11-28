<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import { useCourseStore } from '../stores/course.js'
import { useBankStore } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useUiStore } from '../stores/ui.js'

const router = useRouter()
const course = useCourseStore()
const bank = useBankStore()
const mastery = useMasteryStore()
const ui = useUiStore()

const loading = ref(true)
const picked = ref(new Set())
const kw = ref('')
const onlyUnfinished = ref(false)

const cards = computed(() => course.papers
  .filter((p) => !kw.value.trim() || p.name.toLowerCase().includes(kw.value.trim().toLowerCase()))
  .map((p) => {
    const qs = bank.rows.filter((q) => String(q.papers || '').split(',').includes(p.id))
    const ids = new Set(qs.map((q) => q.id))
    const done = mastery.rows.filter((r) => ids.has(r.qid))
    const mastered = done.filter((r) => Number(r.weight) >= 70).length
    return { ...p, total: qs.length, done: done.length, mastered,
      rate: qs.length ? Math.round((mastered / qs.length) * 100) : 0 }
  })
  .filter((c) => !onlyUnfinished.value || c.done < c.total))

const pickedCount = computed(() => picked.value.size)
const pickedQ = computed(() => cards.value.filter((c) => picked.value.has(c.id)).reduce((s, c) => s + c.total, 0))

function toggle(id) {
  const s = new Set(picked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  picked.value = s
}
function toggleAll() {
  picked.value = picked.value.size === cards.value.length ? new Set() : new Set(cards.value.map((c) => c.id))
}
function startOne(id) { router.push({ name: 'home', query: { paper: id } }) }
function startBatch() {
  if (!picked.value.size) return
  router.push({ name: 'home', query: { paper: [...picked.value].join(',') } })
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([course.load(), bank.load(), mastery.load('ctfl', true)])
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally { loading.value = false }
})
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <div class="head">
        <h1>试卷选择</h1>
        <p>勾选多张可以一起练 · 点「练这张」直接开始</p>
      </div>

      <div class="toolbar">
        <div class="search">
          <span>🔍</span>
          <input v-model="kw" placeholder="搜索试卷" />
        </div>
        <button class="chip" :class="{ on: onlyUnfinished }" @click="onlyUnfinished = !onlyUnfinished">
          只看没做完的
        </button>
        <div class="sp"></div>
        <button class="btn" @click="toggleAll">
          {{ pickedCount === cards.length && cards.length ? '取消全选' : '全选' }}
        </button>
        <button class="btn p" :disabled="!pickedCount" @click="startBatch">练习选中</button>
      </div>

      <LoadingBlock v-if="loading" />

      <div v-else class="cards">
        <div v-for="c in cards" :key="c.id" class="card pc" :class="{ on: picked.has(c.id) }">
          <div class="pc-h">
            <button class="check" :class="{ on: picked.has(c.id) }" @click="toggle(c.id)"></button>
            <div class="nm">{{ c.name }}</div>
          </div>
          <div class="mt">
            <span>{{ c.total }} 题</span>
            <span>做过 {{ c.done }}</span>
            <span>掌握 {{ c.mastered }}</span>
          </div>
          <div class="bar"><i :style="{ width: c.rate + '%' }"></i></div>
          <div class="pc-f">
            <span class="rate">掌握率 {{ c.rate }}%</span>
            <button class="btn" @click="startOne(c.id)">练这张</button>
          </div>
        </div>
      </div>

      <div class="footbar" v-if="pickedCount">
        <div class="sum">已选 <b>{{ pickedCount }}</b> 张 · 共 <b>{{ pickedQ }}</b> 题</div>
        <button class="btn-go" @click="startBatch">开始练习</button>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:22px 0 90px}
.head{margin-bottom:16px}
.head h1{margin:0 0 5px;font-size:19px;font-weight:600}
.head p{margin:0;font-size:12px;color:var(--muted2)}
.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;margin-bottom:16px;
  background:var(--surface);border:1px solid var(--border);border-radius:12px}
.search{display:flex;align-items:center;gap:7px;background:var(--surface2);border:1px solid var(--border);
  border-radius:8px;padding:5px 10px}
.search span{font-size:11px;opacity:.6}
.search input{border:none;background:transparent;color:var(--text);font-size:12.5px;outline:none;width:150px;font-family:inherit}
.chip{cursor:pointer;padding:5px 13px;border-radius:8px;font-size:12.5px;font-family:inherit;
  background:var(--surface2);border:1px solid var(--border);color:var(--muted)}
.chip.on{background:rgba(76,141,255,.15);border-color:rgba(76,141,255,.5);color:#c7dbff}
.sp{flex:1}
.btn{border:1px solid var(--border2);background:var(--surface2);color:var(--text);border-radius:9px;
  padding:6px 14px;font-size:12.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
.btn:hover{background:var(--surface3)}
.btn.p{background:rgba(76,141,255,.14);border-color:rgba(76,141,255,.42);color:#bcd6ff}
.btn:disabled{opacity:.45;cursor:not-allowed}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:14px}
.pc{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:16px 18px;
  display:flex;flex-direction:column;gap:11px;transition:.15s}
.pc.on{border-color:rgba(76,141,255,.5);background:rgba(76,141,255,.06)}
.pc-h{display:flex;align-items:flex-start;gap:10px}
.check{width:16px;height:16px;border-radius:5px;border:1px solid var(--border2);background:var(--surface2);
  cursor:pointer;flex:none;position:relative;margin-top:3px}
.check.on{background:var(--primary);border-color:transparent}
.check.on:after{content:"";position:absolute;left:5px;top:1.5px;width:4px;height:8px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(42deg)}
.nm{font-size:13.5px;line-height:1.5;color:#c8cfdb}
.mt{display:flex;gap:12px;font-size:11.5px;color:var(--muted2)}
.bar{height:5px;border-radius:999px;background:#1b202b;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#2fb87d,#41d99a)}
.pc-f{display:flex;align-items:center;justify-content:space-between}
.rate{font-size:11.5px;color:var(--muted2)}
.footbar{position:fixed;left:0;right:0;bottom:0;background:rgba(12,16,23,.96);backdrop-filter:blur(10px);
  border-top:1px solid var(--border);z-index:80}
.footbar::after{content:"";display:block}
.footbar{display:flex;align-items:center;gap:16px;padding:12px 28px;justify-content:center}
.sum{font-size:13px;color:var(--muted)}
.sum b{color:#c8cfdb}
.btn-go{border:none;border-radius:10px;padding:10px 30px;font-size:14px;font-weight:600;color:#fff;
  font-family:inherit;cursor:pointer;background:linear-gradient(135deg,#3f7cf5,#5b96ff);
  box-shadow:0 8px 22px rgba(63,124,245,.3)}
</style>
