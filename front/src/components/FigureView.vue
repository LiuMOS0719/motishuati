<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ figure: { type: Object, default: null } })
const zoom = ref(false)

// 库里 4 种 kind：table / svg / image / log，html 都是现成的片段
const kind = computed(() => props.figure?.kind || '')
const html = computed(() => props.figure?.html || '')
</script>

<template>
  <div v-if="figure" class="fig" :class="kind">
    <div class="body" :class="{ zoomable: kind === 'image' }" v-html="html" @click="kind === 'image' && (zoom = true)"></div>

    <div v-if="zoom" class="lightbox" @click="zoom = false">
      <div class="lb-in" v-html="html"></div>
    </div>
  </div>
</template>

<style scoped>
.fig{margin:14px 0}
.body{overflow-x:auto}
.body.zoomable{cursor:zoom-in}
/* 表格类 */
.body :deep(table){border-collapse:collapse;width:100%;font-size:12.5px;background:var(--surface2)}
.body :deep(th),.body :deep(td){border:1px solid var(--border2);padding:6px 10px;text-align:left;vertical-align:top}
.body :deep(th){background:var(--surface3);color:var(--muted);font-weight:500}
/* 图片 */
.body :deep(img.figimg){max-width:100%;border-radius:10px;border:1px solid var(--border);display:block;margin:0 auto}
/* SVG */
.body :deep(svg.figsvg){max-width:100%;height:auto;display:block}
/* 日志块 */
.body :deep(.logbox){font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;
  line-height:1.65;background:#0d1017;border:1px solid var(--border2);border-radius:10px;padding:12px 14px;
  white-space:pre-wrap;color:#b9c4d6;overflow-x:auto}
.lightbox{position:fixed;inset:0;background:rgba(4,6,10,.92);z-index:3800;display:grid;place-items:center;padding:24px;cursor:zoom-out}
.lb-in{max-width:96vw;max-height:92vh;overflow:auto}
.lb-in :deep(img.figimg){max-width:96vw;max-height:90vh;border-radius:8px}
</style>
