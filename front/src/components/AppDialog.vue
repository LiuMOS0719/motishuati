<script setup>
import { useUiStore } from '../stores/ui.js'
const ui = useUiStore()
</script>

<template>
  <Transition name="fade">
    <div v-if="ui.dialog" class="mask" @click.self="ui.closeDialog(false)">
      <div class="dlg">
        <div class="hd">{{ ui.dialog.title }}</div>
        <div class="bd" v-html="ui.dialog.message"></div>
        <div class="ft">
          <button v-if="ui.dialog.showCancel" class="btn" @click="ui.closeDialog(false)">
            {{ ui.dialog.cancelText }}
          </button>
          <button class="btn primary" @click="ui.closeDialog(true)">{{ ui.dialog.confirmText }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mask{position:fixed;inset:0;background:rgba(6,8,12,.66);z-index:3900;display:grid;place-items:center;padding:20px}
.dlg{width:min(430px,92vw);background:var(--surface);border:1px solid var(--border2);border-radius:14px;
  box-shadow:0 24px 64px rgba(0,0,0,.6);overflow:hidden}
.hd{padding:16px 20px 0;font-size:15px;font-weight:600}
.bd{padding:10px 20px 20px;font-size:13.5px;color:var(--muted);line-height:1.7}
.ft{display:flex;justify-content:flex-end;gap:10px;padding:0 20px 18px}
.fade-enter-active,.fade-leave-active{transition:.18s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
