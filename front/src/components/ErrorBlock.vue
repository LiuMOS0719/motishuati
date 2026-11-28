<script setup>
defineProps({ message: { type: String, default: '出错了' } })
defineEmits(['retry'])
</script>

<template>
  <div class="eb">
    <div class="msg">{{ message }}</div>
    <button class="btn sm" @click="$emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.eb{display:flex;flex-direction:column;align-items:center;gap:12px;padding:34px 0;color:var(--red);font-size:13px}
</style>
