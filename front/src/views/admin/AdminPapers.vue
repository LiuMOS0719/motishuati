<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCourseStore } from '../../stores/course.js'
import { useBankStore } from '../../stores/bank.js'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const course = useCourseStore()
const bank = useBankStore()
const ui = useUiStore()

const loading = ref(true)
const paperCounts = computed(() => {
  const m = {}
  for (const q of bank.rows) {
    for (const p of String(q.papers || '').split(',').filter(Boolean)) m[p] = (m[p] || 0) + 1
  }
  return m
})
const nodeCounts = computed(() => {
  const m = {}
  for (const q of bank.rows) {
    for (const c of String(q.chapters || '').split(',').filter(Boolean)) m[c] = (m[c] || 0) + 1
  }
  return m
})

const questionList = ref([])
const kw = ref('')

async function search() {
  try { questionList.value = (await adminApi.listQuestions(kw.value)).rows || [] }
  catch (e) { ui.toast(e.message || '搜索失败', 'error') }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([course.load(true), bank.load(true)])
    await search()
  } catch (e) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="hd"><h1>试卷与大纲</h1></div>

    <div class="two">
      <div class="card pad">
        <div class="ch"><h2>试卷</h2><span class="hint">{{ course.papers.length }} 张</span></div>
        <div class="plist">
          <div v-for="p in course.papers" :key="p.id" class="prow">
            <span class="pid">{{ p.id }}</span>
            <span class="pname">{{ p.name }}</span>
            <span class="hint num">{{ paperCounts[p.id] || 0 }} 题</span>
          </div>
        </div>
      </div>

      <div class="card pad">
        <div class="ch"><h2>大纲章节</h2><span class="hint">{{ course.chapters.length }} 章</span></div>
        <div class="plist">
          <div v-for="c in course.chapters" :key="c.id" class="prow">
            <span class="pid">{{ c.code }}</span>
            <span class="pname">{{ c.name }}</span>
            <span class="hint num">{{ nodeCounts[c.code] || 0 }} 题</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card pad mt">
      <div class="ch">
        <h2>题目列表</h2>
        <div class="ch-r">
          <input v-model="kw" class="inp" placeholder="搜题号或题干" @keydown.enter="search" />
          <button class="btn sm" @click="search">搜索</button>
        </div>
      </div>
      <el-table :data="questionList" v-loading="loading" size="small" style="width:100%" max-height="460">
        <el-table-column prop="id" label="题号" width="82" />
        <el-table-column prop="papers" label="卷" width="90" />
        <el-table-column prop="stem" label="题干" min-width="300" show-overflow-tooltip />
        <el-table-column prop="lo" label="LO" width="70" />
        <el-table-column prop="k_level" label="K" width="50" />
        <el-table-column label="" width="70" align="right">
          <template #default="{ row }">
            <RouterLink class="op" :to="'/admin/question/' + row.id">编辑</RouterLink>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.hd{margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pad{padding:16px 18px}
.mt{margin-top:14px}
.ch{display:flex;align-items:center;gap:10px;margin-bottom:11px}
.ch h2{margin:0;font-size:14px;font-weight:600}
.ch-r{margin-left:auto;display:flex;gap:7px}
.inp{height:30px;width:200px;padding:0 10px;border-radius:8px;background:var(--surface2);
  border:1px solid var(--border);color:var(--text);font-size:12.5px;outline:none}
.plist{display:flex;flex-direction:column;gap:6px}
.prow{display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:8px;background:var(--surface2);
  border:1px solid var(--border);font-size:12.5px}
.pid{font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--primary);font-size:11.5px;width:70px;flex:none}
.pname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
.op{color:var(--primary);font-size:12px}
@media (max-width:1120px){.two{grid-template-columns:1fr}}
</style>
