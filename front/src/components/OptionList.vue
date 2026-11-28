<script setup>
import { computed } from 'vue'

const props = defineProps({
  options: { type: Array, default: () => [] },   // 原始顺序的纯文本
  order: { type: Array, default: null },          // 展示顺序（索引）
  chosen: { type: Array, default: () => [] },     // 已选（展示位置的索引）
  answer: { type: Array, default: null },         // 正确答案（原始索引）
  submitted: { type: Boolean, default: false },
  multi: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const display = computed(() => {
  const idx = props.order && props.order.length === props.options.length
    ? props.order
    : props.options.map((_, i) => i)
  return idx.map((realIdx, pos) => ({
    realIdx,
    pos,
    letter: LETTERS[pos],
    text: props.options[realIdx] ?? '',
    picked: props.chosen.includes(pos),
    isAnswer: props.submitted && Array.isArray(props.answer) && props.answer.includes(realIdx),
    wrongPick: props.submitted && props.chosen.includes(pos)
      && !(Array.isArray(props.answer) && props.answer.includes(realIdx)),
  }))
})

function pick(pos) {
  if (props.submitted) return
  emit('pick', pos)
}
</script>

<template>
  <div class="opts">
    <button
      v-for="o in display" :key="o.pos"
      class="opt"
      :class="{
        picked: o.picked && !submitted,
        ok: o.isAnswer,
        bad: o.wrongPick,
        done: submitted,
      }"
      @click="pick(o.pos)"
      type="button"
    >
      <span class="lt">{{ o.letter }}</span>
      <span class="tx" v-html="o.text"></span>
    </button>
  </div>
</template>

<style scoped>
.opts{display:flex;flex-direction:column;gap:9px}
.opt{display:flex;gap:12px;align-items:flex-start;text-align:left;padding:12px 14px;border-radius:11px;
  border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;
  transition:.15s;font-family:inherit;font-size:13.5px;line-height:1.7}
.opt:hover:not(.done){border-color:var(--border2);background:var(--surface3)}
.opt.done{cursor:default}
.lt{flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;
  font-size:12px;font-weight:600;background:var(--surface3);color:var(--muted);border:1px solid var(--border2)}
.tx{flex:1;min-width:0;word-break:break-word}
.tx :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px;font-size:12.5px}
.opt.picked{border-color:rgba(76,141,255,.55);background:var(--primary-soft)}
.opt.picked .lt{background:var(--primary);color:#fff;border-color:transparent}
.opt.ok{border-color:rgba(51,201,138,.55);background:var(--green-soft)}
.opt.ok .lt{background:var(--green);color:#06251a;border-color:transparent}
.opt.bad{border-color:rgba(239,95,107,.55);background:var(--red-soft)}
.opt.bad .lt{background:var(--red);color:#2a0509;border-color:transparent}
</style>
