<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import RangePicker from '../components/RangePicker.vue'
import ChapterBar from '../components/ChapterBar.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import { useBankStore, sampleOrdered } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useCourseStore } from '../stores/course.js'
import { useSessionStore } from '../stores/session.js'
import { useUiStore } from '../stores/ui.js'
import * as sessionApi from '../api/session.js'

const router = useRouter()
const route = useRoute()
const bank = useBankStore()
const mastery = useMasteryStore()
const course = useCourseStore()
const session = useSessionStore()
const ui = useUiStore()

const loading = ref(true)
const starting = ref(false)
const papers = ref(String(route.query.paper || '').split(',').filter(Boolean))
const chapters = ref(String(route.query.chapter || '').split(',').filter(Boolean))
const mode = ref('random')          // random | order | wrong
const count = ref(20)
const resume = ref(null)            // 未完成的场次

const MODES = [
  { id: 'random', label: '随机抽题', hint: '从所选范围里随机抽' },
  { id: 'order', label: '顺序练习', hint: '抽完仍按卷面题号顺序' },
  { id: 'wrong', label: '未掌握题集', hint: '只练权重低于 70 的题' },
]

// 各卷 / 各章题数（用于 chip 上的数字）
const counts = computed(() => {
  const paper = {}
  const chapter = {}
  for (const q of bank.rows) {
    for (const p of String(q.papers || '').split(',').filter(Boolean)) paper[p] = (paper[p] || 0) + 1
    for (const c of String(q.chapters || '').split(',').filter(Boolean)) {
      chapter[c] = (chapter[c] || 0) + 1
    }
  }
  return { paper, chapter }
})

const pool = computed(() => bank.filter({ papers: papers.value, chapters: chapters.value }))

const wrongPool = computed(() => pool.value.filter((q) => (mastery.byQid[q.id] ?? 0) < 70))

const available = computed(() => (mode.value === 'wrong' ? wrongPool.value.length : pool.value.length))

const chapterStats = computed(() => {
  const out = []
  for (const c of course.chapters) {
    const code = String(c.code || '')
    const inCh = bank.rows.filter((q) => String(q.chapters || '').split(',').includes(code))
    const ids = new Set(inCh.map((q) => q.id))
    const rows = mastery.rows.filter((r) => ids.has(r.qid))
    out.push({
      id: c.id, name: c.name, total: inCh.length, done: rows.length,
      mastered: rows.filter((r) => Number(r.weight) >= 70).length,
    })
  }
  return out
})

const overall = computed(() => ({
  total: mastery.stats?.total ?? bank.rows.length,
  done: mastery.stats?.done ?? 0,
  mastered: mastery.stats?.mastered ?? 0,
  sessions: mastery.stats?.sessions ?? 0,
}))

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([
      course.load(),
      bank.load(),
      mastery.load('ctfl', true),
    ])
    // 有未完成的场次 → 提示继续
    try {
      const st = await sessionApi.state('ctfl')
      resume.value = st.current || null
    } catch { resume.value = null }
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function start() {
  if (!available.value) {
    ui.toast(mode.value === 'wrong' ? '这个范围里没有未掌握的题' : '所选范围里没有题目', 'warn')
    return
  }
  let picked
  if (mode.value === 'wrong') {
    picked = sampleOrdered(wrongPool.value, Math.min(count.value, wrongPool.value.length))
  } else {
    picked = sampleOrdered(pool.value, Math.min(count.value, pool.value.length))
  }
  if (!picked.length) return
  starting.value = true
  try {
    const r = await sessionApi.create({
      course: 'ctfl',
      qids: picked.map((q) => q.id),
      sources: papers.value,
      mode: mode.value,
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
  if (!resume.value) return
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
    <div class="wrap page">
      <LoadingBlock v-if="loading" />

      <template v-else>
        <!-- 继续上次 -->
        <div v-if="resume" class="resume">
          <div class="ri">
            <b>有一场没做完</b>
            <span class="hint num">
              {{ (resume.items || []).length }} / {{ (resume.qids || []).length }} 题
            </span>
          </div>
          <div class="ro">
            <button class="btn sm" @click="dropLast">放弃</button>
            <button class="btn sm primary" @click="continueLast">继续作答</button>
          </div>
        </div>

        <div class="cols">
          <!-- 左：出题设置 -->
          <section class="card pad main-card">
            <div class="ch">
              <h2>开始练习</h2>
              <span class="hint">按卷与章节筛范围，两个都选时取交集</span>
            </div>

            <RangePicker
              v-model:papers="papers" v-model:chapters="chapters"
              :paper-defs="course.papers" :chapter-defs="course.chapters"
              :counts="counts"
            />

            <div class="divider"></div>

            <div class="modes">
              <button
                v-for="m in MODES" :key="m.id"
                class="mode" :class="{ on: mode === m.id }"
                @click="mode = m.id"
              >
                <b>{{ m.label }}</b>
                <span>{{ m.hint }}</span>
              </button>
            </div>

            <div class="countrow">
              <span class="lbl">题量</span>
              <div class="nums">
                <button v-for="n in [10, 20, 40]" :key="n"
                  class="nbtn" :class="{ on: count === n }" @click="count = n">{{ n }}</button>
                <input v-model.number="count" class="ninput num" type="number" min="1" :max="available || 1" />
              </div>
              <span class="hint num">可选 {{ available }} 题</span>
            </div>

            <button class="btn primary go" :disabled="starting || !available" @click="start">
              {{ starting ? '正在开局…' : (mode === 'wrong' ? '开始刷未掌握的题' : '开始练习') }}
            </button>
          </section>

          <!-- 右：掌握度 -->
          <aside class="side">
            <div class="card pad">
              <div class="ch">
                <h2>整体进度</h2>
                <span class="hint num">{{ overall.mastered }} / {{ overall.total }}</span>
              </div>
              <div class="nums3">
                <div><b class="num">{{ overall.done }}</b><span>做过</span></div>
                <div><b class="num green">{{ overall.mastered }}</b><span>已掌握</span></div>
                <div><b class="num">{{ overall.sessions }}</b><span>场次</span></div>
              </div>
            </div>

            <div class="card pad">
              <div class="ch"><h2>各章掌握</h2></div>
              <div class="bars">
                <ChapterBar v-for="c in chapterStats" :key="c.id"
                  :name="c.name" :total="c.total" :done="c.done" :mastered="c.mastered" />
              </div>
              <p class="hint legend">
                <i class="dot g"></i>已掌握
                <i class="dot r"></i>做过未掌握
                <i class="dot n"></i>没做过
              </p>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:22px 0 60px}
.resume{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;
  background:var(--amber-soft);border:1px solid rgba(229,163,60,.3);margin-bottom:16px}
.ri{display:flex;align-items:baseline;gap:10px;flex:1;min-width:0}
.ri b{font-size:13px;color:#f3cd8a}
.ro{display:flex;gap:8px;flex:none}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start}
.pad{padding:18px 20px}
.main-card{display:flex;flex-direction:column;gap:16px}
.ch{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
.ch h2{margin:0;font-size:15px;font-weight:600}
.divider{height:1px;background:var(--border);margin:2px 0}
.modes{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.mode{display:flex;flex-direction:column;gap:3px;align-items:flex-start;padding:11px 13px;border-radius:11px;
  border:1px solid var(--border);background:var(--surface2);cursor:pointer;text-align:left;transition:.15s;font-family:inherit}
.mode b{font-size:13px;color:var(--text);font-weight:500}
.mode span{font-size:11.5px;color:var(--muted2);line-height:1.5}
.mode:hover{border-color:var(--border2)}
.mode.on{border-color:rgba(76,141,255,.5);background:var(--primary-soft)}
.mode.on b{color:#cfe0ff}
.countrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.lbl{font-size:12.5px;color:var(--muted)}
.nums{display:flex;align-items:center;gap:6px}
.nbtn{height:30px;min-width:44px;padding:0 10px;border-radius:8px;border:1px solid var(--border);
  background:var(--surface2);color:var(--muted);font-size:12.5px;cursor:pointer;font-family:inherit}
.nbtn.on{background:var(--primary-soft);border-color:rgba(76,141,255,.5);color:#cfe0ff}
.ninput{width:74px;height:30px;padding:0 9px;border-radius:8px;background:var(--surface2);
  border:1px solid var(--border);color:var(--text);font-size:12.5px;outline:none}
.go{height:44px;font-size:14.5px;margin-top:2px}
.side{display:flex;flex-direction:column;gap:14px;position:sticky;top:78px}
.nums3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
.nums3 b{display:block;font-size:20px;font-weight:600;color:var(--text)}
.nums3 b.green{color:var(--green)}
.nums3 span{font-size:11.5px;color:var(--muted2)}
.bars{display:flex;flex-direction:column;gap:9px}
.legend{display:flex;align-items:center;gap:12px;margin:12px 0 0;font-size:11px}
.legend .dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:1px}
.dot.g{background:var(--green)}.dot.r{background:var(--red)}.dot.n{background:#2a3140}
@media (max-width:1120px){
  .cols{grid-template-columns:1fr}
  .side{position:static}
  .modes{grid-template-columns:1fr}
}
</style>
