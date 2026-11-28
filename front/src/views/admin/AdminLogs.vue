<script setup>
import { ref, onMounted } from 'vue'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const ui = useUiStore()
const loading = ref(true)
const rows = ref([])

async function load() {
  loading.value = true
  try { rows.value = (await adminApi.logs(200)).rows || [] }
  catch (e) { ui.toast(e.message || '加载失败', 'error') }
  finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="hd">
      <h1>操作日志</h1>
      <button class="btn sm" @click="load">刷新</button>
    </div>

    <el-table :data="rows" v-loading="loading" size="small" style="width:100%">
      <el-table-column prop="created_at" label="时间" width="160" />
      <el-table-column prop="username" label="操作人" width="120" />
      <el-table-column prop="action" label="动作" width="160" />
      <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
    </el-table>
    <p v-if="!loading && !rows.length" class="hint none">还没有日志。</p>
  </div>
</template>

<style scoped>
.hd{display:flex;align-items:center;margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.hd .btn{margin-left:auto}
.none{text-align:center;padding:30px 0}
</style>
