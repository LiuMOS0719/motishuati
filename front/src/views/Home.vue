<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import StepCard from '../components/StepCard.vue'
import ChapterRow from '../components/ChapterRow.vue'
import HistoryList from '../components/HistoryList.vue'
import RankCard from '../components/RankCard.vue'
import SiteFeedbackCard from '../components/SiteFeedbackCard.vue'
import CopyrightDialog from '../components/CopyrightDialog.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import { useBankStore, sampleOrdered } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useCourseStore } from '../stores/course.js'
import { useSessionStore } from '../stores/session.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'

const router = useRouter()
const bank = useBankStore()
const mastery = useMasteryStore()
const course = useCourseStore()
const session = useSessionStore()
const ui = useUiStore()

const loading = ref(true)
const starting = ref(false)
const papers = ref([])
const chapters = ref([])
const wrongOnly = ref(false)         // 「未掌握题集」与章节互斥
const mode = ref('order')            // order | random
const count = ref(20)
const customCount = ref(null)
const resume = ref(null)
const resumeInfo = ref('')
const copyOpen = ref(false)
const histRows = ref([])
const histTotal = ref(0)

const QTYS = [10, 20, 30, 40, 60, 80, 100]

// 章节短名：库里是「第 1 章 测试基础」→ 显示「测试基础」
const shortName = (n) => n.short_name || String(n.name || '').replace(/^第\s*\d+\s*章\s*/, '')

const counts = computed(() => {
  const paper = {}
  const chapter = {}
  for (const q of bank.rows) {
    for (const p of String(q.papers || '').split(',').filter(Boolean)) paper[p] = (paper[p] || 0) + 1
    for (const c of String(q.chapters || '').split(',').filter(Boolean)) chapter[c] = (chapter[c] || 0) + 1
  }
  return { paper, chapter }
})

const pool = computed(() => bank.filter({ papers: papers.value, chapters: wrongOnly.value ? [] : chapters.value }))
const weightOf = (qid) => mastery.byQid[qid] ?? 0
const wrongPool = computed(() => pool.value.filter((q) => weightOf(q.id) < 70))
const effectivePool = computed(() => (wrongOnly.value ? wrongPool.value : pool.value))
const thisRound = computed(() => Math.min(count.value, effectivePool.value.length))

const poolRate = computed(() => {
  const p = effectivePool.value
  if (!p.length) return 0
  const m = p.filter((q) => weightOf(q.id) >= 70).length
  return Math.round((m / p.length) * 100)
})
const poolWrong = computed(() => wrongPool.value.filter((q) => effectivePool.value.includes(q)).length)

const chapterStats = computed(() => course.chapters.map((c, i) => {
  const code = String(c.code || '')
  const inCh = bank.rows.filter((q) => String(q.chapters || '').split(',').includes(code))
  const ids = new Set(inCh.map((q) => q.id))
  const rows = mastery.rows.filter((r) => ids.has(r.qid))
  return {
    key: c.id, no: code || i + 1, name: shortName(c),
    total: inCh.length, done: rows.length,
    mastered: rows.filter((r) => Number(r.weight) >= 70).length,
  }
}))

function togglePaper(id) {
  const s = new Set(papers.value)
  s.has(id) ? s.delete(id) : s.add(id)
  papers.value = [...s]
}
function toggleChapter(code) {
  wrongOnly.value = false
  const s = new Set(chapters.value)
  s.has(code) ? s.delete(code) : s.add(code)
  chapters.value = [...s]
}
function toggleWrong() {
  wrongOnly.value = !wrongOnly.value
  if (wrongOnly.value) chapters.value = []
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([course.load(), bank.load(), mastery.load('ctfl', true)])
    const [st, hs] = await Promise.all([
      sessionApi.state('ctfl').catch(() => ({ current: null })),
      sessionApi.list('ctfl', 5).catch(() => ({ rows: [] })),
    ])
    resume.value = st.current || null
    if (resume.value) {
      const srcs = (resume.value.sources || []).map((s) => course.paperName(s)).join(' · ')
      const done = (resume.value.items || []).length
      const all = (resume.value.qids || []).length
      resumeInfo.value = `${srcs || '练习'} · 已完成 ${done} 题，剩 ${Math.max(all - done, 0)} 题`
    }
    histRows.value = hs.rows || []
    histTotal.value = histRows.value.length
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

// 加权随机：越不熟越常被抽到（权重 0 的题概率是满分的 11 倍）
function weightedPick(list, n) {
  const pool = list.map((q) => ({ q, w: 1 + Math.round((100 - weightOf(q.id)) / 10) }))
  const picked = []
  let total = pool.reduce((s, x) => s + x.w, 0)
  const bag = pool.slice()
  while (picked.length < n && bag.length) {
    let r = Math.random() * total
    let i = 0
    for (; i < bag.length; i++) { r -= bag[i].w; if (r <= 0) break }
    i = Math.min(i, bag.length - 1)
    picked.push(bag[i].q)
    total -= bag[i].w
    bag.splice(i, 1)
  }
  return picked
}

async function start() {
  if (!effectivePool.value.length) {
    ui.toast(wrongOnly.value ? '这个范围里没有未掌握的题' : '所选范围里没有题目', 'warn')
    return
  }
  const n = thisRound.value
  let picked
  if (mode.value === 'order') {
    picked = wrongOnly.value ? sampleOrdered(effectivePool.value, n) : sampleOrdered(pool.value, n)
  } else {
    picked = weightedPick(effectivePool.value, n)
  }
  if (!picked.length) return
  starting.value = true
  try {
    const r = await sessionApi.create({
      course: 'ctfl', qids: picked.map((q) => q.id),
      sources: papers.value, mode: mode.value,
    })
    session.start({ ...r, sources: papers.value, mode: mode.value })
    router.push('/quiz/' + r.sid)
  } catch (e) {
    ui.toast(e.message || '开局失败', 'error')
  } finally {
    starting.value = false
  }
}

async function continueLast() {
  session.restore(resume.value)
  router.push('/quiz/' + resume.value.id)
}

async function dropLast() {
  const ok = await ui.ask({ title: '放弃这一场？', message: '已作答的题目不会计入成绩。', confirmText: '放弃' })
  if (!ok) return
  try {
    await sessionApi.remove(resume.value.id)
    resume.value = null
    ui.toast('已放弃', 'success')
  } catch (e) {
    ui.toast(e.message || '删除失败', 'error')
  }
}

onMounted(loadAll)
</script>

<template>
  <AppShell>
    <LoadingBlock v-if="loading" />
    <main v-else class="wrap layout">
      <section>
        <!-- 1 选择题库范围 -->
        <StepCard step="1" title="选择题库范围" hint="两侧都选时取交集 · 未掌握题集与其他互斥">
          <div class="row">
            <div class="row-k">模拟卷</div>
            <div class="chips">
              <button v-for="p in course.papers" :key="p.id"
                class="tg" :class="{ on: papers.includes(p.id) }" @click="togglePaper(p.id)">
                {{ p.id === 'EXTRA' ? '附加题' : p.id + ' 卷' }}
              </button>
            </div>
          </div>
          <div class="row">
            <div class="row-k">章节</div>
            <div class="chips">
              <button v-for="c in chapterStats" :key="c.key"
                class="tg" :class="{ on: chapters.includes(String(c.no)) }"
                @click="toggleChapter(String(c.no))">
                {{ c.no }} {{ c.name }}
              </button>
              <button class="tg" :class="{ on: wrongOnly, warn: wrongOnly }" @click="toggleWrong">
                未掌握题集
              </button>
            </div>
          </div>
          <div class="copyline">
            <span class="copylink" @click="copyOpen = true">题目版权说明</span>
          </div>
        </StepCard>

        <!-- 2 出题设置 -->
        <StepCard step="2" title="出题设置" hint="随机按掌握度加权，越不熟越常出现">
          <div class="row">
            <div class="row-k">方式</div>
            <div class="seg">
              <button :class="{ on: mode === 'order' }" @click="mode = 'order'">顺序</button>
              <button :class="{ on: mode === 'random' }" @click="mode = 'random'">随机</button>
            </div>
          </div>
          <div class="row">
            <div class="row-k">题量</div>
            <div class="chips">
              <button v-for="q in QTYS" :key="q" class="tg"
                :class="{ on: !customCount && count === q }"
                @click="customCount = null; count = q">{{ q }}</button>
              <div class="qty">
                <span class="qty-t">自定义</span>
                <input
                  :value="customCount" type="number" inputmode="numeric" min="1"
                  :max="effectivePool.length || 1" placeholder="—"
                  :class="{ on: customCount }"
                  @input="(e) => { const v = Number(e.target.value); customCount = v || null; if (v > 0) count = v }"
                />
                <span class="qty-t">题</span>
              </div>
            </div>
          </div>
          <div class="startline">
            <div class="pool">
              题池 <b>{{ effectivePool.length }}</b> 题 · 本轮 <b>{{ thisRound }}</b> 题<br>
              掌握度 <b>{{ poolRate }}%</b> · 未掌握 <b>{{ poolWrong }}</b> 题
            </div>
            <button class="btn-start" :disabled="starting || !effectivePool.length" @click="start">
              {{ starting ? '开局中…' : '开始练习' }}
            </button>
          </div>
        </StepCard>

        <!-- 3 章节掌握 -->
        <StepCard step="3" title="章节掌握" hint="掌握 = 权重 ≥ 70；章节达标需 ≥90% 且做过 ≥50%">
          <ChapterRow v-for="c in chapterStats" :key="c.key"
            :no="c.no" :name="c.name" :total="c.total" :done="c.done" :mastered="c.mastered" />
          <div class="legend">
            <span><i class="dot" style="background:#33c98a"></i>已掌握</span>
            <span><i class="dot" style="background:#ef5f6b"></i>做过未掌握</span>
            <span><i class="dot" style="background:#232a36"></i>没做过</span>
          </div>
        </StepCard>
      </section>

      <aside class="side">
        <div v-if="resume" class="card cont">
          <div class="cont-ic">▶</div>
          <div class="cont-t"><b>继续上次练习</b><span>{{ resumeInfo }}</span></div>
          <div class="cont-go" @click="continueLast">继续</div>
        </div>

        <HistoryList :rows="histRows" :total="histTotal" />
        <RankCard />
        <SiteFeedbackCard />
      </aside>
    </main>

    <CopyrightDialog v-model:open="copyOpen" />
  </AppShell>
</template>

<style scoped>
.layout{display:grid;grid-template-columns:minmax(0,1fr) 372px;gap:20px;padding:22px 0 40px;align-items:start}
.card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:16px 18px}
.side{display:flex;flex-direction:column;gap:16px;position:sticky;top:18px}
.row{display:flex;align-items:flex-start;gap:12px;padding:9px 0}
.row+.row{border-top:1px dashed rgba(255,255,255,.045)}
.row-k{flex:none;width:76px;font-size:12.5px;color:var(--muted2);padding-top:5px;letter-spacing:.3px}
.chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tg{cursor:pointer;padding:5px 13px;border-radius:8px;font-size:13px;font-family:inherit;
  background:var(--surface2);border:1px solid var(--border);color:var(--muted);transition:.15s}
.tg:hover{border-color:var(--border2);color:var(--text)}
.tg.on{background:rgba(76,141,255,.15);border-color:rgba(76,141,255,.5);color:#c7dbff}
.tg.on.warn{background:var(--amber-soft);border-color:rgba(229,163,60,.45);color:#f0c684}
.copyline{display:flex;justify-content:flex-end;margin-top:4px}
.copylink{font-size:11.5px;color:var(--muted2);cursor:pointer;border-bottom:1px dashed var(--border2);padding-bottom:1px}
.copylink:hover{color:var(--primary)}
.seg{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px}
.seg button{border:none;background:transparent;cursor:pointer;padding:5px 16px;border-radius:7px;
  font-size:13px;color:var(--muted);font-family:inherit}
.seg button.on{background:var(--surface3);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.qty{display:inline-flex;align-items:center;gap:6px;padding-left:6px;border-left:1px dashed rgba(255,255,255,.07);margin-left:2px;flex:none}
.qty input{width:56px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  padding:5px 8px;font-size:13px;font-family:inherit;color:var(--text);font-variant-numeric:tabular-nums;outline:none}
.qty input::placeholder{color:var(--muted2);font-size:12px}
.qty input:focus{border-color:rgba(76,141,255,.55);background:rgba(76,141,255,.07)}
.qty input.on{border-color:rgba(76,141,255,.55);background:rgba(76,141,255,.15);color:#c7dbff}
.qty input::-webkit-outer-spin-button,.qty input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.qty-t{font-size:12px;color:var(--muted2)}
.startline{display:flex;align-items:center;gap:16px;margin-top:14px;padding-top:14px;border-top:1px dashed rgba(255,255,255,.06)}
.pool{font-size:12px;color:var(--muted2);line-height:1.7}
.pool b{color:#9fb3d6;font-weight:600;font-variant-numeric:tabular-nums}
.btn-start{margin-left:auto;flex:none;cursor:pointer;border:none;border-radius:10px;padding:11px 34px;
  font-size:14.5px;font-weight:600;color:#fff;letter-spacing:.5px;font-family:inherit;
  background:linear-gradient(135deg,#3f7cf5,#5b96ff);box-shadow:0 8px 22px rgba(63,124,245,.32)}
.btn-start:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.legend{display:flex;gap:16px;margin-top:12px;font-size:11.5px;color:var(--muted2)}
.legend .dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px;vertical-align:1px}
.cont{display:flex;align-items:center;gap:12px;background:linear-gradient(120deg,#141a26,#121620);
  border:1px solid rgba(76,141,255,.22)}
.cont-ic{width:34px;height:34px;border-radius:9px;background:var(--primary-soft);display:grid;
  place-items:center;color:#8fb8ff;font-size:15px;flex:none}
.cont-t{flex:1;line-height:1.4;min-width:0}
.cont-t b{display:block;font-size:13px}
.cont-t span{font-size:11.5px;color:var(--muted2);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cont-go{font-size:12px;color:#8fb8ff;border:1px solid rgba(76,141,255,.3);padding:5px 12px;
  border-radius:8px;flex:none;cursor:pointer}
.cont-go:hover{background:var(--primary-soft)}
@media (max-width:1120px){
  .layout{grid-template-columns:1fr}
  .side{position:static}
}
</style>
