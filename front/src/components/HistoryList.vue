<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCourseStore } from '../stores/course.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})
const router = useRouter()
const course = useCourseStore()

// 旧数据里 source 可能是 WRONG / CH4 这类内部值，显示要转成人话
function label(src) {
  const v = String(src || '').trim()
  if (!v) return '练习'
  if (v === 'WRONG') return '未掌握题集'
  const ch = v.match(/^CH(\d+)$/i)
  if (ch) return `第 ${ch[1]} 章`
  if (v === 'EXTRA') return '附加题'
  if (/^[A-D]$/.test(v)) return course.paperName(v)
  if (v === 'MULTI') return '多卷混合'
  return v
}

const list = computed(() => props.rows.slice(0, 5).map((r) => {
  const srcs = String(r.sources || r.source || '').split(',').filter(Boolean)
  const title = srcs.length > 1 ? '多卷混合' : label(srcs[0])
  const rate = r.answered ? Math.round((Number(r.correct) / Number(r.answered)) * 100) : 0
  const d = new Date(Number(r.ts) || 0)
  const p = (n) => String(n).padStart(2, '0')
  return {
    sid: r.ext_id,
    date: `${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    title,
    n: Number(r.qcount || 0),
    rate,
    cls: rate >= 80 ? 'p-ok' : rate >= 60 ? 'p-mid' : 'p-bad',
  }
}))
</script>

<template>
  <div class="card">
    <div class="sec-h">
      <b>历史场次</b>
      <a @click="router.push('/history')">全部 {{ total || list.length }} 场 ›</a>
    </div>
    <div v-if="!list.length" class="hint">还没有练习记录</div>
    <div v-for="h in list" :key="h.sid" class="hist" @click="router.push('/result/' + h.sid)">
      <div class="hist-d">{{ h.date }}</div>
      <div class="hist-s">{{ h.title }}</div>
      <div class="hist-n">{{ h.n }} 题</div>
      <div class="hist-p" :class="h.cls">{{ h.rate }}%</div>
    </div>
  </div>
</template>

<style scoped>
.card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:16px 18px}
.sec-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.sec-h b{font-size:13px}
.sec-h a{font-size:11.5px;color:var(--muted2);cursor:pointer}
.sec-h a:hover{color:var(--primary)}
.hist{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:12.5px;cursor:pointer;transition:.13s}
.hist:hover{color:var(--text)}
.hist+.hist{border-top:1px dashed rgba(255,255,255,.05)}
.hist-d{flex:none;width:46px;color:var(--muted2);font-variant-numeric:tabular-nums}
.hist-s{flex:1;color:#c2cad8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.hist-n{flex:none;color:var(--muted);font-variant-numeric:tabular-nums;font-size:11.5px}
.hist-p{flex:none;width:40px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.p-ok{color:#41d99a}
.p-mid{color:#e5a33c}
.p-bad{color:#ef6d79}
</style>
