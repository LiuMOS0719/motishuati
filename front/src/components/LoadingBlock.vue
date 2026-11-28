<script setup>
defineProps({ text: { type: String, default: '加载中…' } })
</script>

<template>
  <div class="lb"><span class="spin"></span>{{ text }}</div>
</template>

<style scoped>
.lb{display:flex;align-items:center;justify-content:center;gap:10px;padding:36px 0;color:var(--muted2);font-size:13px}
.spin{width:15px;height:15px;border-radius:50%;border:2px solid var(--border2);border-top-color:var(--primary);animation:s .7s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
</style>
