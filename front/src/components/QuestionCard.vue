<script setup>
import { ref, computed, watch } from 'vue'
import StemView from './StemView.vue'
import OptionList from './OptionList.vue'
import ExplainView from './ExplainView.vue'

const props = defineProps({
  question: { type: Object, required: true },
  order: { type: Array, default: null },
  answered: { type: Object, default: null },   // { chosen, correct, answer, explain }
  index: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
})
const emit = defineEmits(['submit', 'ai', 'feedback'])

const picked = ref([])
const multi = computed(() => (props.question.answer || []).length > 1)
const submitted = computed(() => Boolean(props.answered && props.answered.answer))

// 切题时同步已答状态
watch(() => [props.question.id, props.answered], () => {
  picked.value = props.answered?.chosen ? [...props.answered.chosen] : []
}, { immediate: true })

function pick(pos) {
  if (submitted.value) return
  if (multi.value) {
    const s = new Set(picked.value)
    s.has(pos) ? s.delete(pos) : s.add(pos)
    picked.value = [...s]
  } else {
    picked.value = [pos]
    emit('submit', [...picked.value])
  }
}

function submitMulti() {
  if (!picked.value.length) return
  emit('submit', [...picked.value])
}
</script>

<template>
  <div class="qc card">
    <div class="head">
      <span class="qno num">{{ index + 1 }} / {{ total }}</span>
      <span class="qid">{{ question.id }}</span>
      <span v-if="question.k_level" class="tag">{{ String(question.k_level).toUpperCase() }}</span>
      <span v-if="question.lo" class="tag lo">LO {{ question.lo }}</span>
      <span v-if="multi" class="tag multi">多选</span>
      <div class="acts">
        <button class="tar" @click="emit('ai')">问 AI</button>
        <button class="tar" @click="emit('feedback')">反馈</button>
      </div>
    </div>

    <StemView :stem="question.stem" :figure="question.figure" />

    <OptionList
      class="opts"
      :options="question.options"
      :order="order"
      :chosen="picked"
      :answer="answered?.answer || null"
      :submitted="submitted"
      :multi="multi"
      @pick="pick"
    />

    <div v-if="multi && !submitted" class="submit-row">
      <button class="btn primary" :disabled="!picked.length" @click="submitMulti">
        提交答案{{ picked.length ? `（已选 ${picked.length}）` : '' }}
      </button>
    </div>

    <div v-if="submitted" class="verdict" :class="answered.correct ? 'ok' : 'bad'">
      {{ answered.correct ? '答对了' : '答错了' }}
      <span v-if="answered.weight !== undefined" class="hint num">掌握度 {{ answered.weight }}</span>
    </div>

    <ExplainView
      v-if="submitted"
      :explain="answered.explain || question.explain"
      :options="question.options"
      :order="order"
      :answer="answered.answer || []"
    />
  </div>
</template>

<style scoped>
.qc{padding:20px 22px 22px}
.head{display:flex;align-items:center;gap:9px;margin-bottom:14px;flex-wrap:wrap}
.qno{font-size:13px;color:var(--text);font-weight:600}
.qid{font-size:12px;color:var(--muted2);font-family:ui-monospace,Menlo,Consolas,monospace}
.tag{font-size:10.5px;padding:2px 7px;border-radius:6px;background:var(--surface3);color:var(--muted2);
  border:1px solid var(--border)}
.tag.multi{background:var(--amber-soft);color:#f3cd8a;border-color:rgba(229,163,60,.3)}
.tag.lo{color:var(--primary);background:var(--primary-soft);border-color:rgba(76,141,255,.25)}
.acts{margin-left:auto;display:flex;gap:6px}
.tar{border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;
  padding:4px 10px;border-radius:8px;cursor:pointer;font-family:inherit}
.tar:hover{color:var(--text);border-color:var(--border2);background:var(--surface2)}
.opts{margin-top:16px}
.submit-row{margin-top:14px}
.verdict{margin-top:14px;font-size:13.5px;display:flex;align-items:center;gap:12px}
.verdict.ok{color:var(--green)}
.verdict.bad{color:var(--red)}
</style>
