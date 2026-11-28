<script setup>
import { ref, onMounted } from 'vue'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const emit = defineEmits(['changed'])
const ui = useUiStore()

const text = ref('')
const active = ref(false)
const saving = ref(false)
const ov = ref(null)

async function load() {
  try {
    const [n, o] = await Promise.all([adminApi.getNotice(), adminApi.overview()])
    text.value = n.text || ''
    active.value = Boolean(n.active)
    ov.value = o
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  }
}

async function save() {
  saving.value = true
  try {
    await adminApi.setNotice(text.value, active.value)
    ui.toast('公告已保存', 'success')
    emit('changed')
  } catch (e) {
    ui.toast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function download() {
  window.open(adminApi.backupUrl(), '_blank')
}

onMounted(load)
</script>

<template>
  <div>
    <div class="hd"><h1>公告与备份</h1></div>

    <div class="two">
      <div class="card pad">
        <div class="ch">
          <h2>站内公告</h2>
          <label class="sw">
            <input v-model="active" type="checkbox" /> 在顶栏显示
          </label>
        </div>
        <textarea v-model="text" class="ta" rows="5" placeholder="写给用户看的公告，会显示在顶部横条里"></textarea>
        <button class="btn primary mt" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存公告' }}</button>
      </div>

      <div class="side">
        <div class="card pad">
          <div class="ch"><h2>概览</h2></div>
          <div class="nums" v-if="ov">
            <div><b class="num">{{ ov.users }}</b><span>用户</span></div>
            <div><b class="num">{{ ov.questions }}</b><span>题目</span></div>
            <div><b class="num">{{ ov.sessions }}</b><span>场次</span></div>
            <div><b class="num">{{ ov.feedback_open }}</b><span>待处理反馈</span></div>
            <div><b class="num">{{ ov.notes_open }}</b><span>待办想法</span></div>
            <div><b class="num">{{ ov.ai_7d?.calls }}</b><span>7 日 AI 调用</span></div>
          </div>
        </div>

        <div class="card pad">
          <div class="ch"><h2>题库备份</h2></div>
          <p class="hint">导出全部题目与配图为 JSON，可用于恢复或换环境。</p>
          <button class="btn mt" @click="download">下载备份</button>
        </div>

        <div class="card pad" v-if="ov?.hot_questions?.length">
          <div class="ch"><h2>被反馈最多的题</h2></div>
          <div class="hot">
            <div v-for="h in ov.hot_questions" :key="h.qid" class="hrow">
              <span class="qid">{{ h.qid }}</span>
              <span class="hint num">{{ h.n }} 条</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hd{margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.two{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.pad{padding:16px 18px}
.ch{display:flex;align-items:center;gap:10px;margin-bottom:11px}
.ch h2{margin:0;font-size:14px;font-weight:600}
.sw{margin-left:auto;font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer}
.ta{width:100%;resize:vertical;background:var(--surface2);border:1px solid var(--border2);border-radius:9px;
  color:var(--text);padding:10px 12px;font-size:13px;line-height:1.8;outline:none;font-family:inherit}
.ta:focus{border-color:var(--primary)}
.mt{margin-top:12px}
.side{display:flex;flex-direction:column;gap:14px}
.nums{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.nums b{display:block;font-size:18px;font-weight:600}
.nums span{font-size:11px;color:var(--muted2)}
.hot{display:flex;flex-direction:column;gap:6px}
.hrow{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 8px;border-radius:7px;background:var(--surface2)}
.qid{color:var(--primary);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px}
@media (max-width:1120px){.two{grid-template-columns:1fr}}
</style>
