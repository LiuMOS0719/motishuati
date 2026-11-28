<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ResultHero from '../components/ResultHero.vue'
import ReviewList from '../components/ReviewList.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import ErrorBlock from '../components/ErrorBlock.vue'
import { renderMarkdown } from '../composables/useMarkdown.js'
import { useBankStore } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useCourseStore } from '../stores/course.js'
import { useAuthStore } from '../stores/auth.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'
import * as aiApi from '../api/ai.js'

const route = useRoute()
const router = useRouter()
const bank = useBankStore()
const mastery = useMasteryStore()
const course = useCourseStore()
const auth = useAuthStore()
const ui = useUiStore()

const sid = String(route.params.sid || '')
const loading = ref(true)
const err = ref('')
const detail = ref(null)
const prev = ref(null)
const review = ref('')
const reviewing = ref(false)
const reviewCost = ref(0)

const items = computed(() => detail.value?.items || [])
const sess = computed(() => detail.value?.session || {})

const stats = computed(() => {
  const answered = items.value.filter((i) => i.chosen !== null)
  const right = answered.filter((i) => i.correct === true)
  const total = items.value.length
  return {
    total, answered: answered.length, right: right.length,
    wrong: answered.length - right.length, blank: total - answered.length,
    rate: answered.length ? Math.round((right.length / answered.length) * 100) : 0,
  }
})

const weights = computed(() => mastery.byQid)

function parseDate(s) {
  if (!s) return null
  const t = new Date(String(s).replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : null
}

const durationSec = computed(() => {
  const a = parseDate(sess.value.started_at)
  const b = parseDate(sess.value.finished_at)
  if (!a || !b || b < a) return 0
  return Math.round((b - a) / 1000)
})
const duration = computed(() => {
  const s = durationSec.value
  if (!s) return '—'
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
})
const perQ = computed(() => {
  const n = stats.value.answered
  if (!durationSec.value || !n) return '—'
  return `${Math.round(durationSec.value / n)} 秒`
})
const timeText = computed(() => {
  const t = parseDate(sess.value.started_at)
  if (!t) return ''
  const d = new Date(t)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
})

const title = computed(() => {
  const srcs = String(sess.value.sources || '').split(',').filter(Boolean)
  const name = srcs.length > 1 ? '多卷混合' : (srcs[0] ? course.paperName(srcs[0]) : '练习')
  return `${name} · ${sess.value.mode === 'random' ? '随机' : '顺序'} ${stats.value.total} 题`
})

// grid4：本场题量 / 正确率（含与上一场对比）/ 掌握度 / 新增未掌握
const prevRate = computed(() => {
  const p = prev.value
  if (!p || !p.answered) return null
  return Math.round((Number(p.correct) / Number(p.answered)) * 100)
})
const diffRate = computed(() => (prevRate.value === null ? null : stats.value.rate - prevRate.value))

const masteryRate = computed(() => {
  const total = Number(mastery.stats?.total || 0)
  const m = Number(mastery.stats?.mastered || 0)
  return total ? Math.round((m / total) * 100) : 0
})
const newLow = computed(() => items.value.filter((i) => i.chosen !== null && !i.correct
  && (weights.value[i.qid] ?? 0) < 70).length)

const changedWeights = computed(() => items.value
  .filter((i) => i.chosen !== null)
  .map((i) => ({ qid: i.qid, ok: i.correct === true, w: weights.value[i.qid] ?? 0 }))
  .filter((x) => x.w < 70)
  .slice(0, 5))

async function load() {
  loading.value = true
  err.value = ''
  try {
    detail.value = await sessionApi.detail(sid)
    const qids = items.value.map((i) => i.qid)
    await Promise.all([bank.ensure(qids), mastery.load('ctfl', true), course.load()])
    // 上一场的正确率
    const hs = await sessionApi.list('ctfl', 50).catch(() => ({ rows: [] }))
    const sorted = (hs.rows || []).filter((r) => r.ext_id !== sid && r.finished)
      .sort((a, b) => Number(b.ts) - Number(a.ts))
    prev.value = sorted[0] || null
  } catch (e) {
    err.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function doReview() {
  reviewing.value = true
  try {
    const LETTER = 'ABCDEFGH'
    const lines = items.value.filter((i) => i.chosen !== null && !i.correct).slice(0, 20).map((i) => {
      const q = bank.get(i.qid)
      const right = ((q && q.answer) || []).map((c) => LETTER[c]).join('')
      return `${i.qid} 你选 ${(i.chosen || []).map((c) => LETTER[c]).join('')} 正确 ${right}`
    })
    const r = await aiApi.review({
      course: 'ctfl',
      sources: String(sess.value.sources || '').split(',').filter(Boolean),
      right: stats.value.right, answered: stats.value.answered,
      wrongList: lines, model: 'deepseek', session_id: sid,
    })
    review.value = r.answer || ''
    reviewCost.value = r.tokens_cost || 0
    if (typeof r.tokens === 'number') auth.me = { ...(auth.me || {}), tokens: r.tokens }
  } catch (e) {
    if (e.code === 'NO_TOKENS') ui.toast('AI 余额不足', 'warn', 4000)
    else ui.toast(e.message || '生成失败', 'error')
  } finally {
    reviewing.value = false
  }
}

function exportWrong() {
  const LETTER = 'ABCDEFGH'
  const list = items.value.filter((i) => i.chosen !== null && !i.correct)
  if (!list.length) return ui.toast('这一场没有错题', 'warn')
  const lines = [`# ${title.value} 错题（${list.length} 题）`, '']
  for (const i of list) {
    const q = bank.get(i.qid)
    if (!q) continue
    lines.push(`## ${i.qid}`)
    lines.push(q.stem, '')
    q.options.forEach((o, idx) => lines.push(`${LETTER[idx]}. ${o}`))
    lines.push('')
    lines.push(`我的答案：${(i.chosen || []).map((c) => LETTER[c]).join('')}`)
    lines.push(`正确答案：${(q.answer || []).map((c) => LETTER[c]).join('')}`)
    if (q.explain) lines.push('', `解析：${q.explain}`)
    lines.push('', '---', '')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `错题-${sid}.md`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function redoWrong() {
  const qids = items.value.filter((i) => i.chosen !== null && !i.correct).map((i) => i.qid)
  if (!qids.length) return ui.toast('这一场没有错题', 'warn')
  try {
    const r = await sessionApi.create({ course: 'ctfl', qids, sources: [], mode: 'order' })
    router.push('/quiz/' + r.sid)
  } catch (e) {
    ui.toast(e.message || '开局失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="wrap top-in">
        <div class="back" @click="router.push('/')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
          返回主页
        </div>
        <div class="tname">{{ title }}</div>
        <div class="spacer"></div>
        <button class="btn" @click="redoWrong">重做错题</button>
        <button class="btn p" @click="router.push('/')">再来一场</button>
      </div>
    </div>

    <LoadingBlock v-if="loading" />
    <ErrorBlock v-else-if="err" :message="err" @retry="load" />

    <div v-else class="wrap layout">
      <section>
        <div class="card">
          <ResultHero
            :rate="stats.rate" :right="stats.right" :total="stats.total"
            :wrong="stats.wrong" :blank="stats.blank"
            :duration="duration" :per-q="perQ" :mode="sess.mode" :time="timeText"
          />
        </div>

        <div class="grid4">
          <div class="cell">
            <div class="k">本场题量</div>
            <div class="v">{{ stats.total }}<small>题</small></div>
            <div class="t">题库 {{ mastery.stats?.total || '—' }} 题中抽</div>
          </div>
          <div class="cell">
            <div class="k">正确率</div>
            <div class="v">{{ stats.rate }}<small>%</small></div>
            <div class="t">
              上一场 {{ prevRate === null ? '—' : prevRate + '%' }}
              <template v-if="diffRate !== null">（{{ diffRate >= 0 ? '+' : '' }}{{ diffRate }}）</template>
            </div>
          </div>
          <div class="cell">
            <div class="k">总体掌握度</div>
            <div class="v" :class="{ up: masteryRate >= 70 }">{{ masteryRate }}<small>%</small></div>
            <div class="t">已掌握 {{ mastery.stats?.mastered ?? 0 }} / {{ mastery.stats?.total ?? 0 }}</div>
          </div>
          <div class="cell">
            <div class="k">新增未掌握</div>
            <div class="v">{{ newLow }}<small>题</small></div>
            <div class="t">权重低于 70</div>
          </div>
        </div>

        <div class="mt">
          <ReviewList :items="items" :weights="weights" />
        </div>

        <div class="card mt ai">
          <div class="h">
            <b>整场评价<span v-if="reviewCost" class="cost">已扣 {{ reviewCost }} token</span></b>
            <span class="r" @click="doReview">{{ reviewing ? '分析中…' : (review ? '重新生成 ›' : '生成评价 ›') }}</span>
          </div>
          <div v-if="review" class="ai-body md" v-html="renderMarkdown(review)"></div>
          <div v-else class="ai-body empty">
            让 AI 看完这 {{ stats.answered }} 题的作答，指出你反复踩的坑，以及下一场该重点练哪几章。
          </div>
        </div>
      </section>

      <aside class="side">
        <div class="card">
          <div class="h"><b>接下来</b></div>
          <div class="act">
            <button class="btn p" @click="exportWrong">导出错题（{{ stats.wrong }} 题）</button>
            <button class="btn" @click="redoWrong">重做答错的题</button>
            <button class="btn" @click="router.push('/')">回到主页</button>
          </div>
          <div class="hint">导出的是本场答错的题，含题干、选项、正确答案与解析，Markdown 格式。</div>
        </div>

        <div class="card">
          <div class="h"><b>还需加强</b><span class="r">权重 &lt; 70</span></div>
          <div class="wlist" v-if="changedWeights.length">
            <div v-for="c in changedWeights" :key="c.qid" class="wrow">
              <span class="k">{{ c.qid }}</span>
              <span class="v" :class="c.ok ? 'ok' : 'bad'">权重 {{ c.w }}</span>
            </div>
          </div>
          <div v-else class="hint">这一场没有落进未掌握的题。</div>
          <div class="hint">权重按最近 5 次作答滚算，连错 2 次直接归 0。</div>
        </div>

        <div class="card">
          <div class="h"><b>本场信息</b></div>
          <div class="wlist">
            <div class="wrow"><span class="k">场次</span><span class="v">{{ sid.slice(-8) }}</span></div>
            <div class="wrow"><span class="k">科目</span><span class="v">{{ course.course.short || 'CTFL' }}</span></div>
            <div class="wrow"><span class="k">范围</span><span class="v">{{ String(sess.sources || '').split(',').filter(Boolean).join(' + ') || '全部' }}</span></div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page{min-height:100vh;padding-bottom:40px}
.top{position:sticky;top:0;z-index:30;background:rgba(10,12,17,.94);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--border)}
.top-in{display:flex;align-items:center;gap:14px;height:56px}
.back{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);cursor:pointer}
.back:hover{color:var(--text)}
.back svg{width:14px;height:14px}
.tname{font-size:13px;color:var(--muted2)}
.spacer{flex:1}
.btn{background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:9px;
  padding:7px 15px;font-size:12.5px;font-family:inherit;cursor:pointer;white-space:nowrap}
.btn:hover{color:var(--text);border-color:var(--border2)}
.btn.p{background:rgba(76,141,255,.14);border-color:rgba(76,141,255,.42);color:#bcd6ff}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 304px;gap:18px;padding:22px 0 40px;align-items:start}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 24px}
.mt{margin-top:16px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.cell{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:14px 16px}
.cell .k{font-size:11.5px;color:var(--muted2);margin-bottom:6px}
.cell .v{font-size:24px;font-weight:600;letter-spacing:-.5px}
.cell .v small{font-size:12px;color:var(--muted2);margin-left:2px;font-weight:400}
.cell .v.up{color:var(--green)}
.cell .t{font-size:11px;color:var(--muted2);margin-top:5px}
.side{display:flex;flex-direction:column;gap:14px}
.side .card+.card{margin-top:0}
.h{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;gap:10px}
.h b{font-size:13px;display:flex;align-items:center;gap:8px}
.h .r{font-size:11.5px;color:var(--primary);cursor:pointer;white-space:nowrap}
.cost{font-style:normal;font-size:10px;color:var(--muted2);background:var(--surface2);
  padding:1px 6px;border-radius:5px;font-weight:400}
.act{display:flex;flex-direction:column;gap:8px}
.act .btn{width:100%}
.hint{font-size:11px;color:var(--muted2);margin-top:10px;line-height:1.65}
.ai-body{font-size:13px;line-height:1.9;color:var(--muted)}
.ai-body.empty{color:#697182;font-size:12.5px}
.ai-body :deep(.md-h){font-weight:600;color:var(--text);margin:9px 0 4px}
.ai-body :deep(.md-ul){margin:5px 0;padding-left:20px}
.ai-body :deep(.md-p){margin:4px 0}
.ai-body :deep(.md-hr){border:none;border-top:1px solid var(--border);margin:10px 0}
.ai-body :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px}
.wlist{display:flex;flex-direction:column;gap:7px}
.wrow{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--muted2)}
.wrow .k{color:var(--muted2)}
.wrow .v{color:#c2cad8;font-variant-numeric:tabular-nums}
.wrow .v.ok{color:#7ee6b7}
.wrow .v.bad{color:#ff9aa3}
@media (max-width:1120px){
  .layout{grid-template-columns:1fr}
  .grid4{grid-template-columns:repeat(2,1fr)}
}
</style>
