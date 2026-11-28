<script setup>
import { computed } from 'vue'

const props = defineProps({
  options: { type: Array, default: () => [] },
  order: { type: Array, default: null },
  chosen: { type: Array, default: () => [] },
  answer: { type: Array, default: null },
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
    realIdx, pos, letter: LETTERS[pos],
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
    <div
      v-for="o in display" :key="o.pos"
      class="opt"
      :class="{ on: o.picked && !submitted, right: o.isAnswer, wrong: o.wrongPick, done: submitted }"
      @click="pick(o.pos)"
    >
      <div class="l">{{ o.letter }}</div>
      <div class="t" v-html="o.text"></div>
    </div>
  </div>
</template>

<style scoped>
.opts{display:flex;flex-direction:column;gap:9px}
.opt{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:10px;
  border:1px solid var(--border);background:var(--surface2);cursor:pointer;transition:.13s}
.opt:hover{border-color:var(--border2);background:var(--surface3)}
.opt.done{cursor:default}
.opt .l{flex:none;width:24px;height:24px;border-radius:7px;border:1px solid var(--border2);
  display:grid;place-items:center;font-size:12px;color:var(--muted);font-weight:600}
.opt .t{font-size:14.5px;line-height:1.7;color:#dfe5ef;min-width:0;word-break:break-word}
.opt .t :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px;font-size:13px}
.opt.on{border-color:rgba(76,141,255,.55);background:rgba(76,141,255,.1)}
.opt.on .l{background:var(--primary);border-color:var(--primary);color:#fff}
.opt.right{border-color:rgba(51,201,138,.5);background:rgba(51,201,138,.09)}
.opt.right .l{background:var(--green);border-color:var(--green);color:#08210f}
.opt.wrong{border-color:rgba(239,95,107,.5);background:rgba(239,95,107,.09)}
.opt.wrong .l{background:var(--red);border-color:var(--red);color:#2a0509}
</style>
