<script setup>
import { computed } from 'vue'

const props = defineProps({
  no: { type: [Number, String], default: '' },
  name: { type: String, default: '' },
  total: { type: Number, default: 0 },
  done: { type: Number, default: 0 },
  mastered: { type: Number, default: 0 },
})

// 条：绿段=已掌握、红段=做过未掌握，其余是轨道底色
const seg = computed(() => {
  const t = Math.max(props.total, 1)
  const m = Math.min(props.mastered, props.total)
  const d = Math.min(Math.max(props.done - m, 0), props.total - m)
  return { ok: (m / t) * 100, bad: (d / t) * 100 }
})
const pct = computed(() => (props.total ? Math.round((props.mastered / props.total) * 100) : 0))

// 达标：掌握率 ≥90% 且做过 ≥50%
const badge = computed(() => {
  const doneRate = props.total ? props.done / props.total : 0
  if (pct.value >= 90 && doneRate >= 0.5) return { cls: 'ok', text: '已掌握' }
  if (props.done > 0) return { cls: 'bad', text: '未达标' }
  return { cls: 'none', text: '未开始' }
})
</script>

<template>
  <div class="ch">
    <div class="ch-no">{{ no }}</div>
    <div class="ch-name" :title="name">{{ name }}</div>
    <div class="bar" :title="`共 ${total} 题 · 做过 ${done} · 已掌握 ${mastered}`">
      <i class="ok" :style="{ width: seg.ok + '%' }"></i>
      <i class="bad" :style="{ width: seg.bad + '%' }"></i>
    </div>
    <div class="ch-pct">{{ pct }}%</div>
    <div class="badge" :class="badge.cls">{{ badge.text }}</div>
  </div>
</template>

<style scoped>
.ch{display:flex;align-items:center;gap:12px;padding:7px 0}
.ch+.ch{border-top:1px dashed rgba(255,255,255,.045)}
.ch-no{flex:none;width:26px;height:26px;border-radius:7px;background:var(--surface2);
  display:grid;place-items:center;font-size:12px;color:var(--muted)}
.ch-name{flex:none;width:188px;font-size:13px;color:#c8cfdb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{flex:1;height:7px;border-radius:4px;background:#1b202b;display:flex;overflow:hidden}
.bar i{display:block;height:100%}
.bar .ok{background:linear-gradient(90deg,#2fb87d,#41d99a)}
.bar .bad{background:linear-gradient(90deg,#d95662,#ef6d79)}
.ch-pct{flex:none;width:52px;text-align:right;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.badge{flex:none;width:62px;text-align:center;font-size:11px;padding:3px 0;border-radius:6px;border:1px solid transparent}
.badge.ok{color:#7ee6b7;background:var(--green-soft);border-color:rgba(51,201,138,.25)}
.badge.bad{color:#ff9aa3;background:var(--red-soft);border-color:rgba(239,95,107,.22)}
.badge.none{color:var(--muted2);background:#181c24;border-color:var(--border)}
@media (max-width:1120px){ .ch-name{width:110px} }
</style>
