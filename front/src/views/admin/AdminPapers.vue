<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCourseStore } from '../../stores/course.js'
import { useBankStore } from '../../stores/bank.js'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const router = useRouter()
const course = useCourseStore()
const bank = useBankStore()
const ui = useUiStore()

const tab = ref('paper')        // paper | node
const curPaper = ref('')
const curNode = ref('')
const loading = ref(true)
const qlist = ref([])
const kw = ref('')

const paperCounts = computed(() => {
  const m = {}
  for (const q of bank.rows) {
    for (const p of String(q.papers || '').split(',').filter(Boolean)) m[p] = (m[p] || 0) + 1
  }
  return m
})
const nodeCounts = computed(() => {
  const m = {}
  for (const q of bank.rows) {
    for (const c of String(q.chapters || '').split(',').filter(Boolean)) m[c] = (m[c] || 0) + 1
  }
  return m
})

const paperGroups = computed(() => {
  const normal = course.papers.filter((p) => p.kind !== 'extra' && p.id !== 'EXTRA')
  const extra = course.papers.filter((p) => p.kind === 'extra' || p.id === 'EXTRA')
  return [
    normal.length ? { title: '模拟卷', items: normal } : null,
    extra.length ? { title: '附加题', items: extra } : null,
  ].filter(Boolean)
})

const curTitle = computed(() => {
  if (tab.value === 'paper') {
    const p = course.papers.find((x) => x.id === curPaper.value)
    return p ? p.name : '全部试卷'
  }
  const n = course.chapters.find((x) => String(x.code) === curNode.value)
  return n ? n.name : '全部章节'
})

async function loadQuestions() {
  try {
    const r = await adminApi.listQuestions(kw.value)
    let rows = r.rows || []
    if (tab.value === 'paper' && curPaper.value) {
      rows = rows.filter((q) => String(q.papers || '').includes(curPaper.value))
    }
    qlist.value = rows
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  }
}

function pickPaper(id) { tab.value = 'paper'; curPaper.value = id; curNode.value = ''; loadQuestions() }
function pickNode(code) { tab.value = 'node'; curNode.value = String(code); curPaper.value = ''; loadQuestions() }

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([course.load(true), bank.load(true)])
    await loadQuestions()
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally { loading.value = false }
})
</script>

<template>
  <div class="app">
    <div class="top">
      <div class="logo">墨</div>
      <div class="crumb">题库 <span>›</span> <em>试卷与大纲</em></div>
      <div class="seg">
        <button :class="{ on: tab === 'paper' }" @click="tab = 'paper'">试卷</button>
        <button :class="{ on: tab === 'node' }" @click="tab = 'node'">大纲</button>
      </div>
      <div class="sp"></div>
      <button class="tbtn" @click="router.push({ name: 'admin-overview' })">返回后台</button>
      <button class="tbtn primary" @click="router.push('/admin')">去概览</button>
    </div>

    <div class="body">
      <!-- 左：试卷 / 章节 -->
      <aside class="left">
        <div class="left-h">{{ tab === 'paper' ? '试卷' : '章节' }}</div>
        <div class="pwrap">
          <template v-if="tab === 'paper'">
            <template v-for="g in paperGroups" :key="g.title">
              <div class="gh">{{ g.title }}</div>
              <div
                v-for="p in g.items" :key="p.id"
                class="pi" :class="{ on: curPaper === p.id }"
                @click="pickPaper(p.id)"
              >
                <div class="pi-t">{{ p.name }}</div>
                <div class="pi-s">{{ paperCounts[p.id] || 0 }} 题</div>
              </div>
            </template>
          </template>
          <template v-else>
            <div class="gh">CTFL 大纲</div>
            <div
              v-for="c in course.chapters" :key="c.id"
              class="pi" :class="{ on: curNode === String(c.code) }"
              @click="pickNode(c.code)"
            >
              <div class="pi-t">{{ c.no || c.code }} {{ c.name }}</div>
              <div class="pi-s">{{ nodeCounts[String(c.code)] || 0 }} 题</div>
            </div>
          </template>
        </div>
      </aside>

      <!-- 中：题目列表 -->
      <main class="mid">
        <div class="mid-h">
          <b>{{ curTitle }}</b>
          <span class="hint">{{ qlist.length }} 题</span>
          <div class="sp"></div>
          <input v-model="kw" class="inp" placeholder="搜题号/题干" @keydown.enter="loadQuestions" />
          <button class="tbtn" @click="loadQuestions">搜索</button>
        </div>
        <div class="qwrap">
          <div v-for="q in qlist" :key="q.id" class="qrow" @click="router.push('/admin/question/' + q.id)">
            <span class="qid">{{ q.id }}</span>
            <span class="qstem">{{ q.stem }}</span>
            <span class="qtag">{{ q.papers }}</span>
            <span class="qgo">编辑 ›</span>
          </div>
          <div v-if="!qlist.length" class="hint pad">没有题目</div>
        </div>
      </main>

      <!-- 右：属性 -->
      <aside class="right">
        <div class="right-h">统计</div>
        <div class="fields">
          <div class="row"><span class="k">试卷数</span><span class="v">{{ course.papers.length }}</span></div>
          <div class="row"><span class="k">章节数</span><span class="v">{{ course.chapters.length }}</span></div>
          <div class="row"><span class="k">题库总量</span><span class="v">{{ bank.rows.length }}</span></div>
        </div>
        <div class="right-h mt">各卷题数</div>
        <div class="fields">
          <div v-for="p in course.papers" :key="p.id" class="row">
            <span class="k">{{ p.id }}</span>
            <span class="v">{{ paperCounts[p.id] || 0 }}</span>
          </div>
        </div>
        <div class="right-f">
          <p class="hint">点中间任意一题进入编辑器。试卷与章节的增删改还没做，需要的话告我。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.app{height:100vh;display:flex;flex-direction:column;background:var(--bg)}
.top{flex:none;display:flex;align-items:center;gap:14px;height:52px;padding:0 20px;
  border-bottom:1px solid var(--border);background:var(--surface)}
.logo{width:26px;height:26px;border-radius:8px;background:linear-gradient(145deg,#2f6bff,#6ea8ff);
  display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff}
.crumb{font-size:12.5px;color:var(--muted2)}
.crumb em{font-style:normal;color:var(--text)}
.seg{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:2px;gap:2px}
.seg button{border:none;background:transparent;color:var(--muted2);font-size:12px;padding:4px 14px;
  border-radius:6px;cursor:pointer;font-family:inherit}
.seg button.on{background:var(--surface3);color:var(--text)}
.sp{flex:1}
.tbtn{border:1px solid var(--border2);background:var(--surface2);color:var(--text);border-radius:8px;
  padding:6px 14px;font-size:12.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
.tbtn:hover{background:var(--surface3)}
.tbtn.primary{background:rgba(76,141,255,.16);border-color:rgba(76,141,255,.45);color:#bcd6ff}
.body{flex:1;min-height:0;display:grid;grid-template-columns:250px minmax(0,1fr) 240px}
.left{border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;min-height:0}
.left-h{padding:12px 14px 8px;font-size:11.5px;color:var(--muted2)}
.pwrap{flex:1;overflow-y:auto;padding:0 8px 14px}
.gh{font-size:10.5px;color:#4f5766;padding:10px 8px 5px;letter-spacing:.1em}
.pi{padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.pi:hover{background:var(--surface2)}
.pi.on{background:var(--primary-soft);border-color:rgba(76,141,255,.35)}
.pi-t{font-size:12.5px;color:#c8cfdb;line-height:1.5}
.pi-s{font-size:10.5px;color:var(--muted2);margin-top:2px}
.mid{display:flex;flex-direction:column;min-height:0}
.mid-h{flex:none;display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border)}
.mid-h b{font-size:13.5px}
.hint{font-size:11.5px;color:var(--muted2)}
.inp{width:180px;height:30px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);font-size:12px;padding:0 10px;outline:none;font-family:inherit}
.qwrap{flex:1;overflow-y:auto;padding:8px 12px 20px}
.qrow{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:8px;cursor:pointer}
.qrow:hover{background:var(--surface2)}
.qid{flex:none;width:74px;font-size:11.5px;color:var(--primary);font-family:ui-monospace,Menlo,Consolas,monospace}
.qstem{flex:1;min-width:0;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qtag{flex:none;font-size:10.5px;color:var(--muted2);background:var(--surface2);padding:2px 7px;border-radius:5px}
.qgo{flex:none;font-size:11.5px;color:var(--primary)}
.right{border-left:1px solid var(--border);background:var(--surface);padding:14px;overflow-y:auto;min-height:0}
.right-h{font-size:11.5px;color:var(--muted2);margin-bottom:10px}
.mt{margin-top:18px}
.fields{display:flex;flex-direction:column;gap:8px}
.row{display:flex;align-items:center;justify-content:space-between;font-size:12px}
.row .k{color:var(--muted2)}
.row .v{color:#c8cfdb;font-variant-numeric:tabular-nums}
.right-f{margin-top:20px}
.pad{padding:20px}
@media (max-width:1120px){ .body{grid-template-columns:1fr} .left,.right{display:none} }
</style>
