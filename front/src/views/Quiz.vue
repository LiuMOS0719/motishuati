<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QuestionCard from '../components/QuestionCard.vue'
import AiDrawer from '../components/AiDrawer.vue'
import FeedbackDialog from '../components/FeedbackDialog.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import ErrorBlock from '../components/ErrorBlock.vue'
import { useSessionStore } from '../stores/session.js'
import { useBankStore } from '../stores/bank.js'
import { useCourseStore } from '../stores/course.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const bank = useBankStore()
const course = useCourseStore()
const mastery = useMasteryStore()
const ui = useUiStore()

const sid = String(route.params.sid || '')
const loading = ref(true)
const err = ref('')
const aiOpen = ref(false)
const fbOpen = ref(false)
const elapsed = ref(0)
const finishing = ref(false)
const marks = ref(new Set())

const current = computed(() => bank.get(session.currentQid))
const answered = computed(() => session.answers[session.currentQid] || null)
const order = computed(() => {
  const q = current.value
  if (!q) return null
  return session.ensureOrder(q.id, q.options.length)
})
const doneCount = computed(() => session.answeredCount)
const isLast = computed(() => session.index >= session.total - 1)

const chapterName = computed(() => {
  const q = current.value
  if (!q) return ''
  const codes = String((bank.rows.find((r) => r.id === q.id) || {}).chapters || '').split(',').filter(Boolean)
  const names = codes.map((c) => {
    const n = course.chapters.find((x) => String(x.code) === c)
    return n ? (n.short_name || String(n.name).replace(/^第\s*\d+\s*章\s*/, '')) : ''
  }).filter(Boolean)
  return names.length ? `${course.course.short || 'CTFL'} · 第 ${codes[0]} 章 ${names[0]}` : ''
})

const clock = computed(() => {
  const s = elapsed.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})
const progress = computed(() => (session.total ? Math.round((doneCount.value / session.total) * 100) : 0))

let timer = null
const tick = () => { elapsed.value = Math.max(0, Math.floor((Date.now() - (session.startedAt || Date.now())) / 1000)) }

async function load() {
  loading.value = true
  err.value = ''
  try {
    const d = await sessionApi.detail(sid)
    const s0 = d.session || {}
    const items = d.items || []
    const perms = {}
    for (const it of items) if (it.option_order && it.option_order.length) perms[it.qid] = it.option_order
    session.restore({
      id: s0.ext_id, ts: Number(s0.ts) || Date.now(),
      qids: items.map((i) => i.qid), items, perms,
      sources: String(s0.sources || '').split(',').filter(Boolean),
      mode: s0.mode, finished: Boolean(s0.finished),
    })
    await Promise.all([bank.ensure(session.qids), course.load(), mastery.load('ctfl')])
    if (s0.finished) { router.replace('/result/' + sid); return }
    const firstOpen = session.qids.findIndex((q) => !session.answers[q])
    session.index = firstOpen >= 0 ? firstOpen : 0
    tick()
    timer = setInterval(tick, 1000)
  } catch (e) {
    err.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function submit(chosen) {
  try {
    await session.submit(session.currentQid, chosen)
  } catch (e) {
    ui.toast(e.message || '提交失败', 'error')
  }
}

function goto(i) {
  if (i >= 0 && i < session.total) session.index = i
}
const prev = () => goto(session.index - 1)
const next = () => goto(session.index + 1)

function toggleMark() {
  const id = session.currentQid
  const s = new Set(marks.value)
  s.has(id) ? s.delete(id) : s.add(id)
  marks.value = s
}

async function exit() {
  const ok = await ui.ask({
    title: '退出这场练习？', message: '已答的题目会保留，可以在主页「继续上次练习」接上。', confirmText: '退出',
  })
  if (!ok) return
  router.push('/')
}

async function finish() {
  if (!doneCount.value) return ui.toast('至少答一题再交卷', 'warn')
  const left = session.total - doneCount.value
  const ok = await ui.ask({
    title: '交卷？',
    message: left > 0 ? `还有 ${left} 题没答，交卷后不能再改。` : '交卷后不能修改答案。',
    confirmText: '交卷',
  })
  if (!ok) return
  finishing.value = true
  try {
    await session.close()
    if (timer) clearInterval(timer)
    router.replace('/result/' + sid)
  } catch (e) {
    ui.toast(e.message || '交卷失败', 'error')
  } finally {
    finishing.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="stage">
    <LoadingBlock v-if="loading" />
    <ErrorBlock v-else-if="err" :message="err" @retry="load" />

    <template v-else>
      <div class="top">
        <div class="top-in">
          <div class="qbtn" title="退出" @click="exit">✕</div>
          <div class="pnum">第 <b>{{ session.index + 1 }}</b> / {{ session.total }} 题</div>
          <div class="spacer"></div>
          <div class="timer">⏱ <span>{{ clock }}</span></div>
          <div class="answered">已答 <span>{{ doneCount }}</span></div>
        </div>
        <div class="bar"><div class="track"><i :style="{ width: progress + '%' }"></i></div></div>
      </div>

      <div class="main">
        <div>
          <QuestionCard
            v-if="current"
            :question="current"
            :order="order"
            :answered="answered"
            :index="session.index"
            :total="session.total"
            :weight="mastery.byQid[current.id] ?? null"
            :chapter-name="chapterName"
            :marked="marks.has(current.id)"
            :is-last="isLast"
            @submit="submit"
            @prev="prev"
            @next="next"
            @mark="toggleMark"
            @feedback="fbOpen = true"
          />
          <div v-else class="card loading">题目正在加载…</div>
        </div>

        <aside class="pad">
          <div class="pad-h"><span>答题进度</span><span>{{ doneCount }} / {{ session.total }}</span></div>
          <div class="grid">
            <button
              v-for="(q, i) in session.qids" :key="q"
              class="cell" :class="{
                on: i === session.index,
                right: session.answers[q]?.correct === true,
                wrong: session.answers[q]?.correct === false,
                marked: marks.has(q),
              }"
              @click="goto(i)"
            >{{ i + 1 }}</button>
          </div>
          <button class="finish" :disabled="finishing" @click="finish">
            {{ finishing ? '交卷中…' : '交卷' }}
          </button>
        </aside>
      </div>
    </template>

    <div class="ai-fab" :class="{ on: aiOpen }" @click="aiOpen = !aiOpen" title="问 AI">
      <span>AI</span>
    </div>

    <AiDrawer
      v-model:open="aiOpen"
      :qid="session.currentQid"
      :sid-ext="sid"
      :answered="Boolean(answered)"
      :perm="order"
    />
    <FeedbackDialog v-model:open="fbOpen" :qid="session.currentQid" />
  </div>
</template>

<style scoped>
.stage{min-height:100vh;display:flex;flex-direction:column;position:relative}
.top{position:sticky;top:0;z-index:40;background:rgba(10,12,17,.94);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.top-in{max-width:1080px;margin:0 auto;padding:10px 22px 0;display:flex;align-items:center;gap:14px}
.qbtn{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:var(--muted);
  cursor:pointer;font-size:16px;flex:none}
.qbtn:hover{background:var(--surface2);color:var(--text)}
.pnum{font-size:13px;color:var(--muted)}
.pnum b{color:var(--text);font-size:15px;font-variant-numeric:tabular-nums}
.spacer{flex:1}
.timer{font-size:12.5px;color:var(--muted2);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px}
.answered{font-size:12.5px;color:var(--muted2);font-variant-numeric:tabular-nums}
.bar{max-width:1080px;margin:0 auto;padding:8px 22px 9px}
.track{height:3px;background:#1b202b;border-radius:2px;overflow:hidden}
.track i{display:block;height:100%;background:linear-gradient(90deg,#3f7cf5,#6ea8ff);border-radius:2px;transition:.3s}
.main{flex:1;max-width:1080px;width:100%;margin:0 auto;padding:22px;display:grid;
  grid-template-columns:minmax(0,1fr) 208px;gap:22px;align-items:start}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 24px}
.loading{color:var(--muted2);font-size:13px}
.pad{position:sticky;top:76px;background:var(--surface);border:1px solid var(--border);border-radius:12px;
  padding:14px;display:flex;flex-direction:column;gap:10px}
.pad-h{font-size:12px;color:var(--muted2);display:flex;justify-content:space-between}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;max-height:300px;overflow-y:auto}
.cell{height:30px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);
  color:var(--muted);font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums;transition:.13s;position:relative}
.cell:hover{border-color:var(--border2);color:var(--text)}
.cell.right{background:rgba(51,201,138,.14);border-color:rgba(51,201,138,.45);color:#7ee6b7}
.cell.wrong{background:rgba(239,95,107,.14);border-color:rgba(239,95,107,.45);color:#ff9aa3}
.cell.on{outline:2px solid var(--primary);outline-offset:1px;color:#fff}
.cell.marked:after{content:"★";position:absolute;top:-4px;right:-2px;font-size:8px;color:#f0c684}
.finish{border:1px solid rgba(76,141,255,.35);background:rgba(76,141,255,.12);color:#bcd6ff;
  border-radius:9px;padding:9px;font-size:13px;font-family:inherit;cursor:pointer;margin-top:2px}
.finish:hover{background:rgba(76,141,255,.2)}
.finish:disabled{opacity:.5;cursor:not-allowed}
.ai-fab{position:fixed;right:22px;bottom:26px;width:48px;height:48px;border-radius:50%;cursor:pointer;
  display:grid;place-items:center;z-index:1200;color:#fff;font-size:12.5px;font-weight:600;letter-spacing:.5px;
  background:linear-gradient(140deg,#3f7cf5,#6ea8ff);box-shadow:0 10px 28px rgba(63,124,245,.45);
  transition:.18s;user-select:none}
.ai-fab:hover{transform:translateY(-2px)}
.ai-fab.on{background:linear-gradient(140deg,#2b3a55,#3a4c78);box-shadow:0 8px 20px rgba(0,0,0,.4)}
@media (max-width:1120px){
  .main{grid-template-columns:1fr;padding:14px}
  .pad{position:static;order:-1}
  .grid{grid-template-columns:repeat(10,1fr);max-height:none}
}
</style>
