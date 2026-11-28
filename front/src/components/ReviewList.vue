<script setup>
import { ref, computed } from 'vue'
import { useBankStore } from '../stores/bank.js'

const props = defineProps({
  items: { type: Array, default: () => [] },
  weights: { type: Object, default: () => ({}) },
})
const bank = useBankStore()
const expanded = ref(false)

const LETTER = 'ABCDEFGH'
const rows = computed(() => props.items.map((it, i) => {
  const q = bank.get(it.qid)
  const chosen = it.chosen ?? []
  const answer = (q && q.answer) || []
  const ok = it.correct === true
  return {
    i, qid: it.qid, ok, blank: it.chosen === null,
    stem: (q && q.stem || '').slice(0, 70),
    mine: chosen.map((c) => LETTER[c]).join(''),
    right: answer.map((c) => LETTER[c]).join(''),
    weight: props.weights[it.qid] ?? null,
  }
}))
const shown = computed(() => (expanded.value ? rows.value : rows.value.slice(0, 6)))
</script>

<template>
  <div class="card">
    <div class="h">
      <b>逐题回顾</b>
      <span class="r" @click="expanded = !expanded">
        {{ expanded ? '收起' : `展开全部 ${rows.length} 题` }}
      </span>
    </div>
    <div class="list">
      <div v-for="r in shown" :key="r.qid" class="row" :class="{ bad: !r.ok, blank: r.blank }">
        <div class="no">{{ r.i + 1 }}</div>
        <div class="stem">{{ r.stem }}</div>
        <div class="ans">
          <span v-if="r.blank" class="na">未答</span>
          <template v-else>
            <em :class="r.ok ? 'ok' : 'bad'">{{ r.mine }}</em>
            <em v-if="!r.ok" class="right">正确 {{ r.right }}</em>
          </template>
        </div>
        <div v-if="r.weight !== null" class="w" :class="{ low: r.weight < 70 }">{{ r.weight }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 24px}
.h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.h b{font-size:13.5px}
.h .r{font-size:11.5px;color:var(--primary);cursor:pointer}
.list{display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:12px;padding:9px 0;font-size:12.5px}
.row+.row{border-top:1px dashed rgba(255,255,255,.045)}
.no{flex:none;width:24px;height:24px;border-radius:6px;background:var(--surface2);color:var(--muted2);
  display:grid;place-items:center;font-size:11px;font-variant-numeric:tabular-nums}
.row.bad .no{background:rgba(239,95,107,.14);color:#ff9aa3}
.stem{flex:1;min-width:0;color:#c2cad8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.ans{flex:none;display:flex;gap:8px;align-items:center}
.ans em{font-style:normal;font-size:11.5px;padding:2px 7px;border-radius:5px}
.ans em.ok{background:rgba(51,201,138,.14);color:#7ee6b7}
.ans em.bad{background:rgba(239,95,107,.14);color:#ff9aa3}
.ans em.right{background:var(--surface3);color:var(--muted)}
.ans .na{color:var(--muted2);font-size:11.5px}
.w{flex:none;width:34px;text-align:right;color:var(--muted2);font-variant-numeric:tabular-nums;font-size:11.5px}
.w.low{color:#ff9aa3}
</style>
