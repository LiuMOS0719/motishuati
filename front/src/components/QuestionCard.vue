<script setup>
import { ref, computed, watch } from 'vue'
import StemView from './StemView.vue'
import OptionList from './OptionList.vue'
import ExplainView from './ExplainView.vue'

const props = defineProps({
  question: { type: Object, required: true },
  order: { type: Array, default: null },
  answered: { type: Object, default: null },
  index: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  weight: { type: Number, default: null },
  chapterName: { type: String, default: '' },
  marked: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})
const emit = defineEmits(['submit', 'prev', 'next', 'feedback', 'mark'])

const picked = ref([])
const multi = computed(() => (props.question.answer || []).length > 1)
const submitted = computed(() => Boolean(props.answered && props.answered.answer))
const weightShow = computed(() => (props.answered?.weight ?? props.weight ?? null))

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
  }
}

function confirm() {
  if (!picked.value.length || submitted.value) return
  emit('submit', [...picked.value])
}

const myAnswerText = computed(() => {
  if (!submitted.value) return ''
  const LET = 'ABCDEFGH'
  return '你选了 ' + (props.answered.chosen || []).map((p) => LET[p]).join('')
})
</script>

<template>
  <div class="card">
    <div class="meta">
      <span class="k">第 {{ index + 1 }} 题</span>
      <span class="tag">{{ multi ? '多选' : '单选' }}</span>
      <span v-if="weightShow !== null" class="tag">权重 {{ weightShow }}</span>
      <span v-if="chapterName">{{ chapterName }}</span>
      <span class="fbk" @click="emit('feedback')">题目反馈</span>
    </div>

    <StemView class="stem" :stem="question.stem" :figure="question.figure" />

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

    <div class="sol" :class="{ show: submitted }">
      <div class="sol-h">
        <span class="verdict" :class="answered && answered.correct ? 'ok' : 'bad'">
          {{ answered && answered.correct ? '回答正确' : '回答错误' }}
        </span>
        <span class="myans">{{ myAnswerText }}</span>
      </div>
      <div class="sol-b">
        <ExplainView
          :explain="answered?.explain || question.explain"
          :options="question.options"
          :order="order"
          :answer="answered?.answer || []"
        />
      </div>
    </div>

    <div class="acts">
      <div class="acts-l">
        <button class="btn prev" :disabled="index === 0" @click="emit('prev')">上一题</button>
        <span class="mark" :class="{ on: marked }" @click="emit('mark')">
          {{ marked ? '★ 已标记' : '☆ 标记' }}
        </span>
      </div>
      <div class="acts-r">
        <button v-if="!submitted" class="btn main" :disabled="!picked.length" @click="confirm">
          确认答案
        </button>
        <button v-else class="btn main" :disabled="isLast" @click="emit('next')">下一题</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 24px}
.meta{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--muted2);margin-bottom:14px;flex-wrap:wrap}
.meta .k{color:#8fb8ff}
.meta .tag{padding:2px 7px;border-radius:5px;border:1px solid var(--border);color:var(--muted)}
.fbk{margin-left:auto;cursor:pointer;color:var(--muted2);font-size:11.5px;border-bottom:1px dashed var(--border2)}
.fbk:hover{color:var(--primary)}
.stem{font-size:15.5px;line-height:1.95;color:#e9edf5;letter-spacing:.2px}
.opts{margin-top:18px}
.sol{margin-top:16px;border-radius:11px;border:1px solid var(--border);background:#10141b;padding:14px 16px;display:none}
.sol.show{display:block}
.sol-h{display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:8px}
.verdict{font-weight:600}
.verdict.ok{color:#6fe0ab}
.verdict.bad{color:#ff8f98}
.myans{color:#697182;font-size:11.5px}
.sol-b{font-size:13px;line-height:1.9;color:var(--muted)}
.acts{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;margin-top:20px}
.acts-l{display:flex;align-items:center;gap:16px;min-width:0}
.acts-r{width:96px;flex:none}
.mark{font-size:12px;color:var(--muted2);cursor:pointer;flex:none}
.mark.on{color:#f0c684}
.btn prev{height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--border2);
  background:var(--surface2);color:var(--text);font-size:13px;cursor:pointer;font-family:inherit}
.btn prev:disabled{opacity:.4;cursor:not-allowed}
.btn.main{height:36px;padding:0 18px;border-radius:9px;border:none;color:#fff;font-size:13.5px;
  font-weight:500;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#3f7cf5,#5b96ff);
  box-shadow:0 6px 18px rgba(63,124,245,.3)}
.btn.main:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
@media (max-width:1120px){ .card{padding:16px 16px} }
</style>
