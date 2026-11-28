<script setup>
import { ref, watch } from 'vue'
import { useUiStore } from '../stores/ui.js'
import * as fbApi from '../api/feedback.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  qid: { type: String, default: '' },
})
const emit = defineEmits(['update:open'])

const ui = useUiStore()
const KINDS = ['题干错字', '选项有误', '解析有问题', '图表不对', '答案存疑', '其他']
const kind = ref(KINDS[0])
const note = ref('')
const busy = ref(false)

watch(() => props.open, (v) => { if (v) { kind.value = KINDS[0]; note.value = '' } })

async function submit() {
  busy.value = true
  try {
    await fbApi.submit(props.qid, kind.value, note.value.trim() || '（用户未填写具体描述）', 'ctfl')
    ui.toast('已提交，谢谢反馈', 'success')
    emit('update:open', false)
  } catch (e) {
    ui.toast(e.message || '提交失败', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click.self="emit('update:open', false)">
        <div class="box">
          <div class="hd">反馈题目 <b class="qid">{{ qid }}</b></div>
          <div class="kinds">
            <button v-for="k in KINDS" :key="k" class="kind" :class="{ on: kind === k }" @click="kind = k">
              {{ k }}
            </button>
          </div>
          <textarea v-model="note" class="ta" rows="3" placeholder="具体描述（可以不填）"></textarea>
          <div class="ft">
            <button class="btn" @click="emit('update:open', false)">取消</button>
            <button class="btn primary" :disabled="busy" @click="submit">{{ busy ? '提交中…' : '提交' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask{position:fixed;inset:0;background:rgba(6,8,12,.66);z-index:3800;display:grid;place-items:center;padding:20px}
.box{width:min(420px,92vw);background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:20px}
.hd{font-size:14px;margin-bottom:14px}
.qid{font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--primary);font-weight:500}
.kinds{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
.kind{border:1px solid var(--border);background:var(--surface2);color:var(--muted);font-size:12px;
  padding:5px 11px;border-radius:999px;cursor:pointer;font-family:inherit}
.kind.on{background:var(--primary-soft);border-color:rgba(76,141,255,.5);color:#cfe0ff}
.ta{width:100%;resize:vertical;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;
  color:var(--text);padding:10px 12px;font-size:13px;line-height:1.7;outline:none;font-family:inherit}
.ta:focus{border-color:var(--primary)}
.ft{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}
.fade-enter-active,.fade-leave-active{transition:.16s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
