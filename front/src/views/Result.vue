<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import ErrorBlock from '../components/ErrorBlock.vue'
import { useBankStore } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useAuthStore } from '../stores/auth.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'
import * as aiApi from '../api/ai.js'
import { renderMarkdown } from '../composables/useMarkdown.js'

const route = useRoute()
const router = useRouter()
const bank = useBankStore()
const mastery = useMasteryStore()
const auth = useAuthStore()
const ui = useUiStore()

const sid = String(route.params.sid || '')
const loading = ref(true)
const err = ref('')
const detail = ref(null)
const review = ref('')
const reviewing = ref(false)
const model = ref('deepseek')

const stats = computed(() => {
  const items = detail.value?.items || []
  const answered = items.filter((i) => i.chosen !== null)
  const right = answered.filter((i) => i.correct)
  const rate = answered.length ? Math.round((right.length / answered.length) * 100) : 0
  return {
    total: items.length, answered: answered.length,
    right: right.length, wrong: answered.length - right.length,
    blank: items.length - answered.length, rate,
  }
})

const wrongList = computed(() => (detail.value?.items || []).filter((i) => i.chosen !== null && !i.correct))

const duration = computed(() => {
  const s = detail.value?.session
  if (!s || !s.started_at || !s.finished_at) return '—'
  const start = new Date(String(s.started_at).replace(' ', 'T')).getTime()
  const end = new Date(String(s.finished_at).replace(' ', 'T')).getTime()
  if (!start || !end || end < start) return '—'
  const sec = Math.round((end - start) / 1000)
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
})

async function load() {
  loading.value = true
  err.value = ''
  try {
    detail.value = await sessionApi.detail(sid)
    const qids = (detail.value.items || []).map((i) => i.qid)
    await bank.ensure(qids)
    await mastery.load('ctfl', true)
  } catch (e) {
    err.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function letterOf(optionIdx, qid) {
  const q = bank.get(qid)
  if (!q || optionIdx === undefined || optionIdx === null) return ''
  return String.fromCharCode(65 + Number(optionIdx))
}

// 单场详情里没有正确答案，去题库缓存拿（answer 是原始选项索引）
function rightLetters(qid) {
  const q = bank.get(qid)
  if (!q || !Array.isArray(q.answer)) return ''
  return q.answer.map((i) => String.fromCharCode(65 + Number(i))).join('')
}

async function doReview() {
  reviewing.value = true
  try {
    const items = detail.value?.items || []
    const lines = items
      .filter((i) => i.chosen !== null && !i.correct)
      .slice(0, 20)
      .map((i) => `${i.qid} 你选 ${(i.chosen || []).map((c) => letterOf(c, i.qid)).join('')} 正确 ${rightLetters(i.qid)}`)
    const r = await aiApi.review({
      course: 'ctfl',
      sources: String(detail.value?.session?.sources || '').split(',').filter(Boolean),
      right: stats.value.right,
      answered: stats.value.answered,
      wrongList: lines,
      model: model.value,
      session_id: sid,
    })
    review.value = r.answer || ''
    if (typeof r.tokens === 'number') auth.me = { ...(auth.me || {}), tokens: r.tokens }
  } catch (e) {
    if (e.code === 'NO_TOKENS') {
      ui.toast('AI 余额不足，可以切到 GLM（免费）', 'warn', 4000)
      model.value = 'glm'
    } else {
      ui.toast(e.message || '复盘失败', 'error')
    }
  } finally {
    reviewing.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <LoadingBlock v-if="loading" />
      <ErrorBlock v-else-if="err" :message="err" @retry="load" />

      <template v-else>
        <div class="card hero">
          <div class="score">
            <div class="big num">{{ stats.rate }}<em>%</em></div>
            <div class="cap">正确率</div>
          </div>
          <div class="nums">
            <div><b class="num green">{{ stats.right }}</b><span>答对</span></div>
            <div><b class="num red">{{ stats.wrong }}</b><span>答错</span></div>
            <div><b class="num">{{ stats.blank }}</b><span>未答</span></div>
            <div><b class="num">{{ duration }}</b><span>用时</span></div>
          </div>
          <div class="ops">
            <button class="btn" @click="router.push('/history')">看记录</button>
            <button class="btn primary" @click="router.push('/')">再来一场</button>
          </div>
        </div>

        <div class="card pad ai-card">
          <div class="ch">
            <h2>AI 复盘</h2>
            <div class="ch-r">
              <select v-model="model" class="sel">
                <option value="deepseek">DeepSeek</option>
                <option value="glm">GLM（免费）</option>
              </select>
              <button class="btn sm primary" :disabled="reviewing" @click="doReview">
                {{ reviewing ? '分析中…' : (review ? '重新分析' : '生成复盘') }}
              </button>
            </div>
          </div>
          <div v-if="review" class="review md" v-html="renderMarkdown(review)"></div>
          <p v-else class="hint">让 AI 看看这场的薄弱点，给下一步建议。</p>
        </div>

        <div class="card pad">
          <div class="ch">
            <h2>错题（{{ wrongList.length }}）</h2>
            <span class="hint">点题号回看</span>
          </div>
          <div v-if="!wrongList.length" class="hint">这一场没有错题。</div>
          <div v-else class="wrongs">
            <div v-for="w in wrongList" :key="w.qid" class="wrow">
              <span class="wid">{{ w.qid }}</span>
              <span class="wq">{{ (bank.get(w.qid)?.stem || '').slice(0, 60) }}</span>
              <span class="wtags">
                <em class="bad">你选 {{ (w.chosen || []).map((c) => letterOf(c, w.qid)).join('') }}</em>
                <em class="ok">正确 {{ rightLetters(w.qid) }}</em>
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:20px 0 60px;display:flex;flex-direction:column;gap:14px}
.hero{display:flex;align-items:center;gap:28px;padding:22px 24px;flex-wrap:wrap}
.score{text-align:center;flex:none}
.big{font-size:44px;font-weight:700;line-height:1;color:var(--text)}
.big em{font-size:19px;font-style:normal;color:var(--muted2);margin-left:2px}
.cap{font-size:11.5px;color:var(--muted2);margin-top:7px;letter-spacing:.1em}
.nums{display:flex;gap:26px;flex:1;flex-wrap:wrap}
.nums b{display:block;font-size:19px;font-weight:600}
.nums b.green{color:var(--green)}
.nums b.red{color:var(--red)}
.nums span{font-size:11.5px;color:var(--muted2)}
.ops{display:flex;gap:9px;flex:none}
.pad{padding:18px 20px}
.ch{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.ch h2{margin:0;font-size:14.5px;font-weight:600}
.ch-r{margin-left:auto;display:flex;align-items:center;gap:8px}
.sel{background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:12px;
  border-radius:7px;padding:4px 7px;outline:none;font-family:inherit}
.review{font-size:13.5px;line-height:1.9;color:var(--muted);white-space:pre-wrap}
.review :deep(b){color:var(--text)}
.review :deep(.md-h){font-weight:600;color:var(--text);margin:10px 0 4px}
.review :deep(.md-ul){margin:5px 0;padding-left:20px}
.review :deep(.md-ul li){margin:3px 0}
.review :deep(.md-p){margin:4px 0}
.review :deep(.md-hr){border:none;border-top:1px solid var(--border);margin:10px 0}
.review :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px}
.wrongs{display:flex;flex-direction:column;gap:7px}
.wrow{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:9px;background:var(--surface2);
  border:1px solid var(--border)}
.wid{font-size:11.5px;color:var(--primary);font-family:ui-monospace,Menlo,Consolas,monospace;flex:none;width:52px}
.wq{flex:1;min-width:0;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wtags{display:flex;gap:6px;flex:none}
.wtags em{font-style:normal;font-size:11px;padding:2px 7px;border-radius:6px}
.wtags .bad{background:var(--red-soft);color:#ffb3b9}
.wtags .ok{background:var(--green-soft);color:#8fe9c2}
@media (max-width:1120px){
  .hero{gap:16px}
  .nums{gap:16px}
}
</style>
