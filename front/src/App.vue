<script setup>
import { onMounted } from 'vue'
import AppToast from './components/AppToast.vue'
import AppDialog from './components/AppDialog.vue'

onMounted(() => {
  // Element Plus 组件需要 dark class 才用深色变量
  document.documentElement.classList.add('dark')
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
  <AppToast />
  <AppDialog />
</template>
