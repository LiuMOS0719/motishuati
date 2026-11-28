<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const qid = String(route.params.qid || '')
const loading = ref(true)
const saving = ref(false)
const form = ref({ id: qid, stem: '', options: ['', '', '', ''], answer: [], explain: '', lo: '', k_level: '', pts: 1 })
const figure = ref(null)
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

const isMulti = computed(() => form.value.answer.length > 1)

async function load() {
  loading.value = true
  try {
    const r = await adminApi.getQuestion(qid)
    form.value = { ...r.question, answer: r.question.answer || [] }
    if (!form.value.options.length) form.value.options = ['', '', '', '']
    figure.value = r.figure
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

function toggleAnswer(letter) {
  const s = new Set(form.value.answer)
  if (s.has(letter)) s.delete(letter)
  else {
    if (!isMulti.value && s.size >= 1) s.clear()   // 默认单选
    s.add(letter)
  }
  form.value.answer = [...s].sort()
}

function addOption() {
  if (form.value.options.length >= 6) return
  form.value.options.push('')
}
function removeOption(i) {
  if (form.value.options.length <= 2) return
  form.value.options.splice(i, 1)
  form.value.answer = form.value.answer.filter((x) => x !== LETTERS[i])
}

async function save() {
  if (!form.value.stem.trim()) return ui.toast('题干不能为空', 'warn')
  if (!form.value.answer.length) return ui.toast('至少标一个正确答案', 'warn')
  saving.value = true
  try {
    await adminApi.saveQuestion({ ...form.value, course_id: 'ctfl' })
    ui.toast('已保存', 'success')
  } catch (e) {
    ui.toast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="hd">
      <button class="btn sm" @click="router.back()">返回</button>
      <h1>{{ qid }}</h1>
      <span class="hint">改动会直接写库，前端下一次加载即生效</span>
      <div class="hd-r">
        <button class="btn primary" :disabled="saving || loading" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="hint pad">加载中…</div>

    <div v-else class="cols">
      <div class="card pad">
        <label class="lb" v-pre>题干（支持 {{FIG:题号}} 占位插图）</label>
        <textarea v-model="form.stem" class="ta mono" rows="7"></textarea>

        <label class="lb mt">选项</label>
        <div class="opts">
          <div v-for="(o, i) in form.options" :key="i" class="orow">
            <button class="lt" :class="{ on: form.answer.includes(LETTERS[i]) }" @click="toggleAnswer(LETTERS[i])">
              {{ LETTERS[i] }}
            </button>
            <textarea v-model="form.options[i]" class="ta sm" rows="2"></textarea>
            <button class="delx" title="删除这个选项" @click="removeOption(i)">×</button>
          </div>
        </div>
        <button class="btn sm" @click="addOption">加一个选项</button>

        <label class="lb mt">解析</label>
        <textarea v-model="form.explain" class="ta" rows="5"></textarea>

        <div class="meta-row">
          <div><label class="lb">LO</label><input v-model="form.lo" class="inp" placeholder="如 1.2" /></div>
          <div><label class="lb">K 等级</label><input v-model="form.k_level" class="inp" placeholder="K1/K2/K3" /></div>
          <div><label class="lb">分值</label><input v-model.number="form.pts" class="inp" type="number" min="1" /></div>
        </div>
      </div>

      <aside class="side">
        <div class="card pad">
          <div class="ch"><h2>正确答案</h2></div>
          <div class="ans">{{ form.answer.join('') || '未设置' }}</div>
          <p class="hint">点选项左边的字母设为正确答案；同时选多个就是多选题。</p>
        </div>

        <div v-if="figure" class="card pad">
          <div class="ch"><h2>配图预览</h2><span class="hint">{{ figure.kind }}</span></div>
          <div class="figbox" v-html="figure.html"></div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.hd{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.hd h1{margin:0;font-size:16px;font-family:ui-monospace,Menlo,Consolas,monospace}
.hd-r{margin-left:auto}
.pad{padding:16px 18px}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}
.lb{display:block;font-size:12px;color:var(--muted2);margin-bottom:6px}
.mt{margin-top:14px}
.ta{width:100%;resize:vertical;background:var(--surface2);border:1px solid var(--border2);border-radius:9px;
  color:var(--text);padding:10px 12px;font-size:13px;line-height:1.75;outline:none;font-family:inherit}
.ta.sm{font-size:12.5px;padding:7px 10px}
.ta.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.ta:focus{border-color:var(--primary)}
.opts{display:flex;flex-direction:column;gap:8px;margin-bottom:9px}
.orow{display:flex;align-items:flex-start;gap:9px}
.lt{width:28px;height:28px;flex:none;border-radius:8px;border:1px solid var(--border2);background:var(--surface2);
  color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;margin-top:5px;font-family:inherit}
.lt.on{background:var(--green);border-color:transparent;color:#06251a}
.delx{width:24px;height:24px;flex:none;border:none;background:transparent;color:var(--muted2);
  font-size:16px;cursor:pointer;margin-top:7px;border-radius:6px}
.delx:hover{color:var(--red);background:var(--red-soft)}
.meta-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
.inp{width:100%;height:32px;padding:0 10px;border-radius:8px;background:var(--surface2);
  border:1px solid var(--border2);color:var(--text);font-size:13px;outline:none}
.side{display:flex;flex-direction:column;gap:14px;position:sticky;top:16px}
.ch{display:flex;align-items:center;gap:9px;margin-bottom:10px}
.ch h2{margin:0;font-size:13.5px;font-weight:600}
.ans{font-size:22px;font-weight:700;color:var(--green);letter-spacing:2px;margin-bottom:8px}
.figbox{max-height:300px;overflow:auto}
.figbox :deep(img){max-width:100%;border-radius:8px}
.figbox :deep(table){border-collapse:collapse;font-size:11.5px}
.figbox :deep(th),.figbox :deep(td){border:1px solid var(--border2);padding:4px 7px}
@media (max-width:1120px){.cols{grid-template-columns:1fr}.side{position:static}}
</style>
