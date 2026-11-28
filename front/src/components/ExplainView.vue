<script setup>
import { computed } from 'vue'

const props = defineProps({
  explain: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  order: { type: Array, default: null },
  answer: { type: Array, default: () => [] },
})

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// 解析里写的是原始选项字母（A/B/C/D），展示顺序变了，要按展示位置重映射
const remap = computed(() => {
  const map = {}
  const idx = props.order && props.order.length === props.options.length
    ? props.order : props.options.map((_, i) => i)
  idx.forEach((realIdx, pos) => { map[LETTERS[realIdx]] = LETTERS[pos] })
  return map
})

const text = computed(() => {
  let s = props.explain || ''
  if (!s) return ''
  // 只替换「单独出现的选项字母」，避免把英文单词里的字母也换掉
  return s.replace(/(^|[^A-Za-z])([A-H])(?=[^A-Za-z]|$)/g, (all, pre, ch) => pre + (remap.value[ch] || ch))
})
</script>

<template>
  <div v-if="explain" class="exp">
    <div class="h">解析</div>
    <div class="t" v-html="text.replace(/\n/g, '<br>')"></div>
  </div>
</template>

<style scoped>
.exp{margin-top:14px;padding:13px 15px;border-radius:11px;background:var(--surface2);border:1px solid var(--border)}
.h{font-size:12px;color:var(--amber);margin-bottom:7px;letter-spacing:.04em}
.t{font-size:13.5px;line-height:1.85;color:var(--muted);word-break:break-word}
.t :deep(b),.t :deep(strong){color:var(--text)}
</style>
