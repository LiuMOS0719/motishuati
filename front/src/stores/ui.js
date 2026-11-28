import { defineStore } from 'pinia'
import { ref } from 'vue'

// 全站弹窗 / toast 队列（替代 alert/confirm/prompt）
export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])
  const dialog = ref(null)   // { title, message, type, resolve, confirmText, cancelText, showCancel }
  const noticeClosed = ref(false)

  let seq = 0
  function toast(message, type = 'info', ms = 2600) {
    const id = ++seq
    toasts.value.push({ id, message, type })
    setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, ms)
  }

  function ask({ title = '确认', message = '', confirmText = '确定', cancelText = '取消', showCancel = true, type = 'info' }) {
    return new Promise((resolve) => {
      dialog.value = { title, message, confirmText, cancelText, showCancel, type, resolve }
    })
  }

  function closeDialog(result) {
    if (dialog.value) dialog.value.resolve(result)
    dialog.value = null
  }

  return { toasts, dialog, noticeClosed, toast, ask, closeDialog }
})
