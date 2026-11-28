<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="nf">
    <div class="code">404</div>
    <div class="t">这个页面不存在</div>
    <div class="h">地址可能输错了，或者页面已经被移走。</div>
    <div class="ops">
      <button class="btn" @click="router.back()">返回上一页</button>
      <button class="btn primary" @click="router.push('/')">回主页</button>
    </div>
  </div>
</template>

<style scoped>
.nf{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
.code{font-size:64px;font-weight:700;color:var(--surface3);letter-spacing:4px;font-variant-numeric:tabular-nums}
.t{font-size:16px;color:var(--text)}
.h{font-size:13px;color:var(--muted2)}
.ops{display:flex;gap:10px;margin-top:14px}
</style>
