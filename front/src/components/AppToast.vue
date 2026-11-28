<script setup>
import { useUiStore } from '../stores/ui.js'
const ui = useUiStore()
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="t">
      <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.type">
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{pointer-events:auto;min-width:160px;max-width:min(520px,90vw);padding:9px 16px;border-radius:10px;
  background:var(--surface3);border:1px solid var(--border2);color:var(--text);font-size:13px;
  box-shadow:0 10px 30px rgba(0,0,0,.5)}
.toast.success{border-color:rgba(51,201,138,.4);color:#9ff0c8}
.toast.error{border-color:rgba(239,95,107,.45);color:#ffb3b9}
.toast.warn{border-color:rgba(229,163,60,.45);color:#f3cd8a}
.t-enter-active,.t-leave-active{transition:.22s}
.t-enter-from{opacity:0;transform:translateY(-8px)}
.t-leave-to{opacity:0;transform:translateY(-8px)}
</style>
