<script setup>
defineProps({
  title: { type: String, default: '还没有内容' },
  hint: { type: String, default: '' },
})
</script>

<template>
  <div class="es">
    <div class="t">{{ title }}</div>
    <div v-if="hint" class="h">{{ hint }}</div>
    <slot />
  </div>
</template>

<style scoped>
.es{padding:44px 20px;text-align:center}
.t{font-size:13.5px;color:var(--muted)}
.h{margin-top:6px;font-size:12.5px;color:var(--muted2)}
</style>
