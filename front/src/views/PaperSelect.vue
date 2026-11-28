<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import LoadingBlock from '../components/LoadingBlock.vue'
import { useCourseStore } from '../stores/course.js'
import { useBankStore } from '../stores/bank.js'
import { useMasteryStore } from '../stores/mastery.js'
import { useUiStore } from '../stores/ui.js'

const router = useRouter()
const course = useCourseStore()
const bank = useBankStore()
const mastery = useMasteryStore()
const ui = useUiStore()

const loading = ref(true)
const picked = ref(new Set())

const cards = computed(() => course.papers.map((p) => {
  const qs = bank.rows.filter((q) => String(q.papers || '').split(',').includes(p.id))
  const ids = new Set(qs.map((q) => q.id))
  const done = mastery.rows.filter((r) => ids.has(r.qid))
  const mastered = done.filter((r) => Number(r.weight) >= 70).length
  return {
    ...p,
    total: qs.length,
    done: done.length,
    mastered,
    rate: qs.length ? Math.round((mastered / qs.length) * 100) : 0,
  }
}))

function toggle(id) {
  if (picked.value.has(id)) picked.value.delete(id)
  else picked.value.add(id)
  picked.value = new Set(picked.value)
}

function startOne(id) {
  router.push({ name: 'home', query: { paper: id } })
}

function startBatch() {
  if (!picked.value.size) return
  router.push({ name: 'home', query: { paper: [...picked.value].join(',') } })
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([course.load(), bank.load(), mastery.load('ctfl', true)])
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppShell>
    <div class="wrap page">
      <div class="hd">
        <h1>试卷选择</h1>
        <span class="hint">勾选多张可以一起练</span>
        <div class="hd-r">
          <span class="hint num">已选 {{ picked.size }} 张</span>
          <button class="btn sm primary" :disabled="!picked.size" @click="startBatch">练习选中</button>
        </div>
      </div>

      <LoadingBlock v-if="loading" />

      <div v-else class="grid">
        <div
          v-for="c in cards" :key="c.id"
          class="card pc" :class="{ on: picked.has(c.id) }"
        >
          <div class="pc-h">
            <button class="chk" :class="{ on: picked.has(c.id) }" @click="toggle(c.id)"></button>
            <b>{{ c.name }}</b>
          </div>
          <div class="meta">
            <span class="num">{{ c.total }} 题</span>
            <span class="hint num">做过 {{ c.done }}</span>
            <span class="hint num">掌握 {{ c.mastered }}</span>
          </div>
          <div class="bar"><i :style="{ width: c.rate + '%' }"></i></div>
          <div class="pc-f">
            <span class="hint num">掌握率 {{ c.rate }}%</span>
            <button class="btn sm" @click="startOne(c.id)">练这张</button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.page{padding:22px 0 60px}
.hd{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.hd-r{margin-left:auto;display:flex;align-items:center;gap:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.pc{padding:15px 16px;display:flex;flex-direction:column;gap:11px;transition:.15s}
.pc.on{border-color:rgba(76,141,255,.5);background:var(--primary-soft)}
.pc-h{display:flex;align-items:center;gap:9px}
.pc-h b{font-size:13.5px;font-weight:500}
.chk{width:16px;height:16px;border-radius:5px;border:1px solid var(--border2);background:var(--surface2);
  cursor:pointer;flex:none;position:relative}
.chk.on{background:var(--primary);border-color:transparent}
.chk.on:after{content:"";position:absolute;left:5px;top:1.5px;width:4px;height:8px;
  border:2px solid #fff;border-top:0;border-left:0;transform:rotate(42deg)}
.meta{display:flex;gap:10px;font-size:12px;color:var(--muted)}
.bar{height:5px;border-radius:999px;background:var(--surface3);overflow:hidden}
.bar i{display:block;height:100%;background:var(--green);transition:width .3s}
.pc-f{display:flex;align-items:center;justify-content:space-between}
</style>
