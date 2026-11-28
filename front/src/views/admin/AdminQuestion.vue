<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const qid = ref(String(route.params.qid || ''))
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const list = ref([])
const kw = ref('')
const filter = ref('all')
const form = ref({ id: '', stem: '', options: ['', '', '', ''], answer: [], explain: '', lo: '', k_level: '', pts: 1 })
const figure = ref(null)
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

const shown = computed(() => list.value.filter((r) => {
  if (filter.value === 'multi') return (r.id || '').length > 0 && false
  return true
}))

async function loadList() {
  try {
    const r = await adminApi.listQuestions(kw.value)
    list.value = r.rows || []
  } catch { list.value = [] }
}

async function loadOne(id) {
  loading.value = true
  try {
    const r = await adminApi.getQuestion(id)
    form.value = { ...r.question, answer: r.question.answer || [] }
    if (!form.value.options.length) form.value.options = ['', '', '', '']
    figure.value = r.figure
    dirty.value = false
    qid.value = id
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally { loading.value = false }
}

function pick(id) {
  if (dirty.value) {
    ui.ask({ title: '有未保存的修改', message: '切换题目会丢掉刚才的改动。', confirmText: '仍然切换' })
      .then((ok) => { if (ok) loadOne(id) })
    return
  }
  router.replace('/admin/question/' + id)
  loadOne(id)
}

function touch() { dirty.value = true }

function toggleAnswer(letter) {
  const s = new Set(form.value.answer)
  if (s.has(letter)) s.delete(letter)
  else {
    if (s.size >= 1) s.clear()
    s.add(letter)
  }
  form.value.answer = [...s].sort()
  touch()
}

function addOption() {
  if (form.value.options.length >= 6) return
  form.value.options.push('')
  touch()
}
function removeOption(i) {
  if (form.value.options.length <= 2) return
  form.value.options.splice(i, 1)
  form.value.answer = form.value.answer.filter((x) => x !== LETTERS[i])
  touch()
}

async function save() {
  if (!form.value.stem.trim()) return ui.toast('题干不能为空', 'warn')
  if (!form.value.answer.length) return ui.toast('至少标一个正确答案', 'warn')
  saving.value = true
  try {
    await adminApi.saveQuestion({ ...form.value, course_id: 'ctfl' })
    dirty.value = false
    ui.toast('已保存', 'success')
    loadList()
  } catch (e) {
    ui.toast(e.message || '保存失败', 'error')
  } finally { saving.value = false }
}

onMounted(async () => {
  await Promise.all([loadList(), loadOne(qid.value)])
})
</script>

<template>
  <div class="app">
    <div class="top">
      <div class="crumb">
        题库 <span>›</span> <em>{{ qid }}</em>
      </div>
      <span v-if="dirty" class="dirty">未保存</span>
      <div class="sp"></div>
      <button class="tbtn" @click="router.push({ name: 'admin-papers' })">返回试卷</button>
      <button class="tbtn primary" :disabled="saving || loading" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>

    <div class="body">
      <aside class="list">
        <div class="list-h">题目列表<span>{{ list.length }}</span></div>
        <div class="search">
          <span>🔍</span>
          <input v-model="kw" placeholder="搜题号或题干" @keydown.enter="loadList" />
        </div>
        <div class="qlist">
          <div
            v-for="q in list" :key="q.id"
            class="qi" :class="{ on: q.id === qid }"
            @click="pick(q.id)"
          >
            <div class="qi-t">{{ q.id }}</div>
            <div class="qi-s">{{ q.stem }}</div>
            <div class="qi-c">{{ q.papers }}</div>
          </div>
        </div>
      </aside>

      <main class="mid">
        <div v-if="loading" class="hint pad">加载中…</div>
        <template v-else>
          <label class="lb" v-pre>题干（支持 {{FIG:题号}} 占位插图）</label>
          <textarea v-model="form.stem" class="ta mono" rows="7" @input="touch"></textarea>

          <label class="lb mt">选项</label>
          <div class="opts">
            <div v-for="(o, i) in form.options" :key="i" class="orow">
              <button class="lt" :class="{ on: form.answer.includes(LETTERS[i]) }"
                @click="toggleAnswer(LETTERS[i])">{{ LETTERS[i] }}</button>
              <textarea v-model="form.options[i]" class="ta sm" rows="2" @input="touch"></textarea>
              <button class="delx" @click="removeOption(i)">×</button>
            </div>
          </div>
          <button class="tbtn" @click="addOption">加一个选项</button>

          <label class="lb mt">解析</label>
          <textarea v-model="form.explain" class="ta" rows="5" @input="touch"></textarea>
        </template>
      </main>

      <aside class="right">
        <div class="right-h">属性</div>
        <div class="fields">
          <div class="row"><span class="k">正确答案</span><span class="v ans">{{ form.answer.join('') || '未设置' }}</span></div>
          <div class="row"><span class="k">题号</span><span class="v mono">{{ qid }}</span></div>
          <label class="row"><span class="k">LO</span><input v-model="form.lo" class="inp" @input="touch" /></label>
          <label class="row"><span class="k">K 等级</span><input v-model="form.k_level" class="inp" @input="touch" /></label>
          <label class="row"><span class="k">分值</span><input v-model.number="form.pts" class="inp" type="number" min="1" @input="touch" /></label>
        </div>

        <div v-if="figure" class="right-h mt">配图（{{ figure.kind }}）</div>
        <div v-if="figure" class="figbox" v-html="figure.html"></div>

        <div class="right-f">
          <p class="hint">改动直接写库，前端下次加载即生效。点选项左边的字母设为正确答案，选多个就是多选题。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.app{height:100vh;display:flex;flex-direction:column;background:var(--bg)}
.top{flex:none;display:flex;align-items:center;gap:12px;height:52px;padding:0 20px;
  border-bottom:1px solid var(--border);background:var(--surface)}
.crumb{font-size:12.5px;color:var(--muted2)}
.crumb em{font-style:normal;color:var(--text);font-family:ui-monospace,Menlo,Consolas,monospace}
.dirty{font-size:10.5px;color:var(--amber);background:var(--amber-soft);border:1px solid rgba(229,163,60,.3);
  padding:2px 8px;border-radius:6px}
.sp{flex:1}
.tbtn{border:1px solid var(--border2);background:var(--surface2);color:var(--text);border-radius:8px;
  padding:6px 14px;font-size:12.5px;cursor:pointer;font-family:inherit}
.tbtn:hover{background:var(--surface3)}
.tbtn.primary{background:rgba(76,141,255,.16);border-color:rgba(76,141,255,.45);color:#bcd6ff}
.tbtn:disabled{opacity:.5;cursor:not-allowed}
.body{flex:1;min-height:0;display:grid;grid-template-columns:240px minmax(0,1fr) 260px}
.list{border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0;background:var(--surface)}
.list-h{display:flex;justify-content:space-between;padding:12px 14px 8px;font-size:11.5px;color:var(--muted2)}
.search{display:flex;align-items:center;gap:6px;margin:0 12px 8px;background:var(--surface2);
  border:1px solid var(--border);border-radius:8px;padding:5px 9px}
.search span{font-size:10px;opacity:.6}
.search input{border:none;background:transparent;color:var(--text);font-size:12px;outline:none;width:100%;font-family:inherit}
.qlist{flex:1;overflow-y:auto;padding:0 8px 12px}
.qi{padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.qi:hover{background:var(--surface2)}
.qi.on{background:var(--primary-soft);border-color:rgba(76,141,255,.35)}
.qi-t{font-size:11.5px;color:var(--primary);font-family:ui-monospace,Menlo,Consolas,monospace}
.qi-s{font-size:11.5px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.5}
.qi-c{font-size:10px;color:var(--muted2);margin-top:3px}
.mid{padding:18px 20px;overflow-y:auto;min-height:0}
.lb{display:block;font-size:11.5px;color:var(--muted2);margin-bottom:6px}
.mt{margin-top:16px}
.ta{width:100%;resize:vertical;background:var(--surface2);border:1px solid var(--border2);border-radius:9px;
  color:var(--text);padding:10px 12px;font-size:13px;line-height:1.75;outline:none;font-family:inherit}
.ta.sm{font-size:12.5px;padding:7px 10px}
.ta.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.ta:focus{border-color:var(--primary)}
.opts{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.orow{display:flex;align-items:flex-start;gap:9px}
.lt{width:28px;height:28px;flex:none;border-radius:8px;border:1px solid var(--border2);background:var(--surface2);
  color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;margin-top:5px;font-family:inherit}
.lt.on{background:var(--green);border-color:transparent;color:#06251a}
.delx{width:24px;height:24px;flex:none;border:none;background:transparent;color:var(--muted2);
  font-size:16px;cursor:pointer;margin-top:7px;border-radius:6px}
.delx:hover{color:var(--red);background:var(--red-soft)}
.right{border-left:1px solid var(--border);padding:14px 14px 20px;overflow-y:auto;background:var(--surface);min-height:0}
.right-h{font-size:11.5px;color:var(--muted2);margin-bottom:10px;display:flex;justify-content:space-between}
.fields{display:flex;flex-direction:column;gap:9px}
.row{display:flex;align-items:center;justify-content:space-between;font-size:12px}
.row .k{color:var(--muted2)}
.row .v{color:#c8cfdb}
.row .v.ans{color:var(--green);font-weight:600;letter-spacing:1px}
.row .v.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px}
.inp{width:96px;height:28px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;
  color:var(--text);font-size:12px;padding:0 8px;outline:none;font-family:inherit;text-align:right}
.inp:focus{border-color:var(--primary)}
.figbox{margin-top:8px;max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:9px;padding:8px}
.figbox :deep(img){max-width:100%;border-radius:6px}
.figbox :deep(table){border-collapse:collapse;font-size:11px;width:100%}
.figbox :deep(th),.figbox :deep(td){border:1px solid var(--border2);padding:3px 6px}
.right-f{margin-top:18px}
.hint{font-size:11px;color:var(--muted2);line-height:1.7}
.pad{padding:20px}
@media (max-width:1120px){
  .body{grid-template-columns:1fr}
  .list,.right{display:none}
}
</style>
