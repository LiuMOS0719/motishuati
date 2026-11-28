<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import QuestionCard from '../components/QuestionCard.vue'
import AiDrawer from '../components/AiDrawer.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import ErrorBlock from '../components/ErrorBlock.vue'
import { useSessionStore } from '../stores/session.js'
import { useBankStore } from '../stores/bank.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const bank = useBankStore()
const ui = useUiStore()

const sid = String(route.params.sid || '')
const loading = ref(true)
const err = ref('')
const aiOpen = ref(false)
const fbOpen = ref(false)
const elapsed = ref(0)
const finishing = ref(false)

const current = computed(() => bank.get(session.currentQid))
const answered = computed(() => session.answers[session.currentQid] || null)
const order = computed(() => {
  const q = current.value
  if (!q) return null
  return session.ensureOrder(q.id, q.options.length)
})
const doneCount = computed(() => session.answeredCount)
const canFinish = computed(() => doneCount.value > 0)

let timer = null
function tick() {
  elapsed.value = Math.max(0, Math.floor((Date.now() - (session.startedAt || Date.now())) / 1000))
}
const clock = computed(() => {
  const s = elapsed.value
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
})

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
      id: s0.ext_id,
      ts: Number(s0.ts) || Date.now(),
      qids: items.map((i) => i.qid),
      items,
      perms,
      sources: String(s0.sources || '').split(',').filter(Boolean),
      mode: s0.mode,
      finished: Boolean(s0.finished),
    })
    await bank.ensure(session.qids)
    if (s0.finished) {
      router.replace('/result/' + sid)
      return
    }
    // 定位到第一道没答的题
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
  const qid = session.currentQid
  try {
    await session.submit(qid, chosen)
  } catch (e) {
    ui.toast(e.message || '提交失败', 'error')
  }
}

function goto(i) {
  if (i >= 0 && i < session.total) session.index = i
  document.querySelector('.qi-main')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function next() {
  if (session.index < session.total - 1) goto(session.index + 1)
}

function prev() {
  if (session.index > 0) goto(session.index - 1)
}

async function finish() {
  if (!canFinish.value) {
    ui.toast('至少答一题再交卷', 'warn')
    return
  }
  const unanswered = session.total - doneCount.value
  const ok = await ui.ask({
    title: '交卷？',
    message: unanswered > 0 ? `还有 ${unanswered} 题没答，交卷后不能再改。` : '交卷后不能修改答案。',
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

function feedback() {
  fbOpen.value = true
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <LoadingBlock v-if="loading" />
      <ErrorBlock v-else-if="err" :message="err" @retry="load" />

      <template v-else>
        <div class="bar card">
          <div class="bar-l">
            <span class="badge num">{{ doneCount }} / {{ session.total }}</span>
            <div class="prog"><i :style="{ width: session.progress + '%' }"></i></div>
            <span class="hint num">{{ session.progress }}%</span>
          </div>
          <div class="bar-r">
            <span class="clock num">{{ clock }}</span>
            <button class="btn sm" @click="finish" :disabled="finishing || !canFinish">
              {{ finishing ? '交卷中…' : '交卷' }}
            </button>
          </div>
        </div>

        <div class="cols">
          <div class="qi-main">
            <QuestionCard
              v-if="current"
              :question="current"
              :order="order"
              :answered="answered"
              :index="session.index"
              :total="session.total"
              @submit="submit"
              @ai="aiOpen = true"
              @feedback="feedback"
            />
            <div v-else class="card pad hint">题目正在加载…</div>

            <div class="nav-row">
              <button class="btn" :disabled="session.index === 0" @click="prev">上一题</button>
              <button class="btn primary" :disabled="session.index >= session.total - 1" @click="next">
                {{ answered || !current ? '下一题' : '先答这题' }}
              </button>
            </div>
          </div>

          <aside class="qi-side card">
            <div class="side-h">题号</div>
            <div class="grid">
              <button
                v-for="(q, i) in session.qids" :key="q"
                class="cell" :class="{
                  on: i === session.index,
                  done: Boolean(session.answers[q]),
                  right: session.answers[q]?.correct === true,
                  wrong: session.answers[q]?.correct === false,
                }"
                @click="goto(i)"
              >{{ i + 1 }}</button>
            </div>
            <div class="legend">
              <span><i class="d g"></i>对</span>
              <span><i class="d r"></i>错</span>
              <span><i class="d n"></i>未答</span>
            </div>
          </aside>
        </div>
      </template>
    </div>

    <FeedbackDialog v-model:open="fbOpen" :qid="session.currentQid" />

    <AiDrawer
      v-model:open="aiOpen"
      :qid="session.currentQid"
      :sid-ext="sid"
      :answered="Boolean(answered)"
      :perm="order"
    />
  </AppShell>
</template>

<style scoped>
.page{padding:18px 0 60px}
.bar{display:flex;align-items:center;gap:16px;padding:11px 16px;margin-bottom:14px}
.bar-l{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
.badge{font-size:12.5px;color:var(--text);background:var(--surface2);border:1px solid var(--border);
  padding:3px 10px;border-radius:999px}
.prog{flex:1;max-width:320px;height:6px;border-radius:999px;background:var(--surface3);overflow:hidden}
.prog i{display:block;height:100%;background:linear-gradient(90deg,#2f6bff,#4c8dff);transition:width .25s}
.bar-r{display:flex;align-items:center;gap:12px;flex:none}
.clock{font-size:13px;color:var(--muted);letter-spacing:.04em}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:16px;align-items:start}
.pad{padding:18px}
.nav-row{display:flex;justify-content:space-between;gap:10px;margin-top:14px}
.qi-side{padding:14px;position:sticky;top:78px}
.side-h{font-size:12px;color:var(--muted2);margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;max-height:320px;overflow-y:auto}
.cell{height:30px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);
  color:var(--muted);font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums;transition:.14s}
.cell:hover{border-color:var(--border2);color:var(--text)}
.cell.done.right{background:var(--green-soft);border-color:rgba(51,201,138,.45);color:#8fe9c2}
.cell.done.wrong{background:var(--red-soft);border-color:rgba(239,95,107,.45);color:#ffb3b9}
.cell.on{outline:2px solid var(--primary);outline-offset:1px}
.legend{display:flex;gap:10px;margin-top:12px;font-size:11px;color:var(--muted2)}
.legend .d{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:1px}
.d.g{background:var(--green)}.d.r{background:var(--red)}.d.n{background:#2a3140}
@media (max-width:1120px){
  .cols{grid-template-columns:1fr}
  .qi-side{position:static;order:-1}
  .grid{grid-template-columns:repeat(10,1fr);max-height:none}
}
</style>
