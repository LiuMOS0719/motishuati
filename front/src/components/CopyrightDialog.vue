<script setup>
import { useCourseStore } from '../stores/course.js'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['update:open'])
const course = useCourseStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click.self="emit('update:open', false)">
        <div class="dlg">
          <div class="dlg-h">
            <span class="ic">ⓘ</span><b>题目版权说明</b>
            <span class="dlg-x" @click="emit('update:open', false)">✕</span>
          </div>
          <div class="dlg-b">
            <div class="body">{{ course.course.copyright || '暂无版权说明' }}</div>
            <div v-if="course.course.copyright_note" class="note">{{ course.course.copyright_note }}</div>
          </div>
          <div class="dlg-f">
            <button class="okbtn" @click="emit('update:open', false)">我知道了</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask{position:fixed;inset:0;background:rgba(6,8,12,.7);z-index:3900;display:grid;place-items:center;padding:20px}
.dlg{width:min(560px,94vw);background:var(--surface);border:1px solid var(--border2);border-radius:14px;overflow:hidden}
.dlg-h{display:flex;align-items:center;gap:9px;padding:15px 18px;border-bottom:1px solid var(--border)}
.dlg-h b{font-size:14px;flex:1}
.ic{color:var(--primary);font-size:13px}
.dlg-x{cursor:pointer;color:var(--muted2);font-size:14px}
.dlg-b{padding:16px 18px;max-height:60vh;overflow-y:auto}
.body{font-size:12.5px;line-height:1.85;color:var(--muted);white-space:pre-wrap}
.note{margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);font-size:12px;color:var(--muted2);white-space:pre-wrap}
.dlg-f{display:flex;justify-content:flex-end;padding:0 18px 16px}
.okbtn{border:none;border-radius:9px;padding:8px 20px;font-size:13px;font-family:inherit;cursor:pointer;
  color:#fff;background:linear-gradient(135deg,#3f7cf5,#5b96ff)}
.fade-enter-active,.fade-leave-active{transition:.16s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
