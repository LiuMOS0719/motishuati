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

async function setStatus(r, s) {
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
      <h1>想法记录</h1>
      <span class="hint">你随手记的改动想法都在这里</span>
      <div class="tabs">
        <button class="tab" :class="{ on: status === 'open' }" @click="status = 'open'; load()">待处理</button>
        <button class="tab" :class="{ on: status === 'done' }" @click="status = 'done'; load()">已完成</button>
      </div>
    </div>

    <div v-if="loading" class="hint none">加载中…</div>
    <div v-else-if="!rows.length" class="hint none">没有记录。</div>
    <div v-else class="list">
      <div v-for="r in rows" :key="r.id" class="row">
        <div class="meta">
          <em class="page">{{ r.page || '未标注页面' }}</em>
          <em v-if="r.qid" class="qid">{{ r.qid }}</em>
          <span class="hint num">{{ r.created_at }}</span>
        </div>
        <div class="note">{{ r.note }}</div>
        <div class="ops">
          <button class="op" @click="setStatus(r, 'done')">已完成</button>
          <button class="op dim" @click="setStatus(r, 'dropped')">不做了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hd{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.tabs{margin-left:auto;display:flex;gap:5px}
.tab{border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;
  padding:5px 12px;border-radius:999px;cursor:pointer;font-family:inherit}
.tab.on{background:var(--primary-soft);border-color:rgba(76,141,255,.45);color:#cfe0ff}
.list{display:flex;flex-direction:column;gap:9px}
.row{padding:12px 15px;border-radius:11px;background:var(--surface);border:1px solid var(--border)}
.meta{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.page{font-style:normal;font-size:10.5px;padding:2px 8px;border-radius:6px;background:var(--surface3);color:var(--muted)}
.qid{font-style:normal;font-size:10.5px;color:var(--primary);font-family:ui-monospace,Menlo,Consolas,monospace}
.note{font-size:13.5px;line-height:1.75;color:var(--text);white-space:pre-wrap}
.ops{display:flex;gap:7px;margin-top:10px}
.op{border:1px solid var(--border);background:transparent;color:var(--green);font-size:11.5px;
  padding:3px 10px;border-radius:7px;cursor:pointer;font-family:inherit}
.op.dim{color:var(--muted2)}
.none{text-align:center;padding:30px 0}
</style>
