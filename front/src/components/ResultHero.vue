<script setup>
import { computed } from 'vue'

const props = defineProps({
  rate: { type: Number, default: 0 },
  right: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  wrong: { type: Number, default: 0 },
  blank: { type: Number, default: 0 },
  duration: { type: String, default: '—' },
  perQ: { type: String, default: '—' },
  mode: { type: String, default: '' },
  time: { type: String, default: '' },
})

const title = computed(() => {
  if (props.rate >= 90) return '这一场很稳'
  if (props.rate >= 75) return '这一场做得不错'
  if (props.rate >= 60) return '及格线上下，还有空间'
  return '这一场失分比较多'
})

// conic-gradient 三段：绿=对、红=错、灰=未答
const ringStyle = computed(() => {
  const t = Math.max(props.total, 1)
  const g = (props.right / t) * 100
  const r = (props.wrong / t) * 100
  return {
    background: `conic-gradient(#33c98a 0 ${g}%, #ef5f6b ${g}% ${g + r}%, #2a3140 ${g + r}% 100%)`,
  }
})
const segStyle = computed(() => {
  const t = Math.max(props.total, 1)
  return {
    ok: (props.right / t) * 100,
    bad: (props.wrong / t) * 100,
    na: (props.blank / t) * 100,
  }
})
</script>

<template>
  <div class="hero">
    <div class="ring" :style="ringStyle">
      <div class="in">
        <span>{{ rate }}%</span>
        <i class="num">{{ right }} / {{ total }}</i>
      </div>
    </div>
    <div class="hero-t">
      <h2>{{ title }}</h2>
      <div class="meta">
        <span>用时 {{ duration }}</span>
        <span>平均每题 {{ perQ }}</span>
        <span v-if="mode">{{ mode === 'random' ? '随机抽题' : '顺序抽题' }}</span>
        <span>{{ time }}</span>
      </div>
      <div class="seg">
        <i class="ok" :style="{ width: segStyle.ok + '%' }"></i>
        <i class="bad" :style="{ width: segStyle.bad + '%' }"></i>
        <i class="na" :style="{ width: segStyle.na + '%' }"></i>
      </div>
      <div class="legend">
        <span><i class="dot" style="background:#33c98a"></i>答对 {{ right }}</span>
        <span><i class="dot" style="background:#ef5f6b"></i>答错 {{ wrong }}</span>
        <span><i class="dot" style="background:#2a3140"></i>未答 {{ blank }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero{display:flex;gap:26px;align-items:center}
.ring{flex:none;width:132px;height:132px;border-radius:50%;display:grid;place-items:center;position:relative}
.ring:before{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--surface)}
.ring .in{position:relative;text-align:center}
.ring span{font-size:30px;font-weight:600;letter-spacing:-.5px}
.ring i{font-style:normal;font-size:12px;color:var(--muted2);display:block;text-align:center;margin-top:2px}
.hero-t{flex:1;min-width:0}
.hero-t h2{margin:0 0 4px;font-size:18px;font-weight:600;letter-spacing:.3px}
.meta{font-size:12px;color:var(--muted2);display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.seg{height:9px;border-radius:5px;overflow:hidden;display:flex;background:#1b202b}
.seg i{display:block;height:100%}
.seg .ok{background:linear-gradient(90deg,#2fb87d,#41d99a)}
.seg .bad{background:linear-gradient(90deg,#d95662,#ef6d79)}
.seg .na{background:#2a3140}
.legend{display:flex;gap:18px;margin-top:11px;font-size:11.5px;color:var(--muted2);flex-wrap:wrap}
.legend .dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px;vertical-align:1px}
@media (max-width:1120px){ .hero{gap:16px} .ring{width:104px;height:104px} .ring span{font-size:24px} }
</style>
