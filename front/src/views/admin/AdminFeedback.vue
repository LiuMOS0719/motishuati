<script setup>
import { ref, onMounted } from 'vue'
import { useUiStore } from '../../stores/ui.js'
import * as fbApi from '../../api/feedback.js'

const emit = defineEmits(['changed'])
const ui = useUiStore()
const loading = ref(true)
const rows = ref([])
const status = ref('open')

async function load() {
  loading.value = true
  try { rows.value = (await fbApi.notes(status.value)).rows || [] }
  catch (e) { ui.toast(e.message || '加载失败', 'error') }
  finally { loading.value = false }
}

async function setDone(r, s) {
  try {
    await fbApi.setNote(r.id, s)
    rows.value = rows.value.filter((x) => x.id !== r.id)
    emit('changed')
  } catch (e) { ui.toast(e.message || '操作失败', 'error') }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="hd">
      <h1>题目反馈</h1>
      <div class="tabs">
        <button class="tab" :class="{ on: status === 'open' }" @click="status = 'open'; load()">待处理</button>
        <button class="tab" :class="{ on: status === 'done' }" @click="status = 'done'; load()">已完成</button>
      </div>
    </div>

    <el-table :data="rows" v-loading="loading" size="small" style="width:100%">
      <el-table-column prop="qid" label="题号" width="80" />
      <el-table-column prop="kind" label="类型" width="110" />
      <el-table-column prop="note" label="反馈内容" min-width="280" show-overflow-tooltip />
      <el-table-column prop="created_at" label="提交时间" width="160" />
      <el-table-column label="操作" width="130" align="right">
        <template #default="{ row }">
          <button class="op" @click="setDone(row, 'done')">标为已完成</button>
        </template>
      </el-table-column>
    </el-table>

    <p v-if="!loading && !rows.length" class="hint none">没有待处理反馈。</p>
  </div>
</template>

<style scoped>
.hd{display:flex;align-items:center;margin-bottom:16px;gap:14px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.tabs{margin-left:auto;display:flex;gap:5px}
.tab{border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;
  padding:5px 12px;border-radius:999px;cursor:pointer;font-family:inherit}
.tab.on{background:var(--primary-soft);border-color:rgba(76,141,255,.45);color:#cfe0ff}
.op{border:none;background:transparent;color:var(--green);font-size:12px;cursor:pointer}
.none{text-align:center;padding:30px 0}
</style>
