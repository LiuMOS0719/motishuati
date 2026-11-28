<script setup>
import { computed } from 'vue'
import FigureView from './FigureView.vue'

const props = defineProps({
  stem: { type: String, default: '' },
  figure: { type: Object, default: null },
})

// 题干里的 {{FIG:id}} 占位符 → 在它所在的位置插入图
const parts = computed(() => {
  const s = props.stem || ''
  const out = []
  const re = /\{\{FIG:[^}]+\}\}/g
  let last = 0
  let m
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) })
    out.push({ type: 'fig' })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) })
  return out.length ? out : [{ type: 'text', text: s }]
})
</script>

<template>
  <div class="stem">
    <template v-for="(p, i) in parts" :key="i">
      <FigureView v-if="p.type === 'fig'" :figure="figure" />
      <div v-else class="text" v-html="p.text"></div>
    </template>
  </div>
</template>

<style scoped>
.stem{font-size:14.5px;line-height:1.85;color:var(--text)}
.text{white-space:pre-wrap;word-break:break-word}
.text :deep(b),.text :deep(strong){color:#fff}
.text :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px;font-size:12.5px}
</style>
