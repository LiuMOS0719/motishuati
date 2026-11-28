<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  total: { type: Number, default: 0 },
  done: { type: Number, default: 0 },
  mastered: { type: Number, default: 0 },
})

// 三段条：绿=已掌握 / 红=做过未掌握 / 灰=没做
const seg = computed(() => {
  const t = Math.max(props.total, 1)
  const m = Math.min(props.mastered, props.total)
  const d = Math.min(Math.max(props.done - m, 0), props.total - m)
  const n = Math.max(props.total - m - d, 0)
  return {
    m: (m / t) * 100, d: (d / t) * 100, n: (n / t) * 100,
    rate: props.total ? Math.round((m / props.total) * 100) : 0,
  }
})
</script>

<template>
  <div class="cb">
    <div class="row">
      <span class="nm">{{ name }}</span>
      <span class="rate num">{{ seg.rate }}%</span>
    </div>
    <div class="bar" :title="`共 ${total} 题 · 已做 ${done} · 已掌握 ${mastered}`">
      <i class="g" :style="{ width: seg.m + '%' }"></i>
      <i class="r" :style="{ width: seg.d + '%' }"></i>
      <i class="n" :style="{ width: seg.n + '%' }"></i>
    </div>
    <div class="sub num">{{ mastered }} / {{ total }} 题已掌握</div>
  </div>
</template>

<style scoped>
.cb{padding:11px 13px;border:1px solid var(--border);border-radius:11px;background:var(--surface2)}
.row{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px}
.nm{font-size:12.5px;color:var(--muted)}
.rate{font-size:12.5px;color:var(--text)}
.bar{display:flex;height:6px;border-radius:999px;overflow:hidden;background:var(--surface3)}
.bar i{display:block;height:100%;transition:width .3s}
.bar i.g{background:var(--green)}
.bar i.r{background:var(--red)}
.bar i.n{background:#2a3140}
.sub{margin-top:7px;font-size:11px;color:var(--muted2)}
</style>
