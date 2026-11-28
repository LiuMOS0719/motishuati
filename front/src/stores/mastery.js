import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../api/session.js'

// 掌握度：只读服务端 q_weight，不在前端重算（避免两端算法漂移）
export const useMasteryStore = defineStore('mastery', () => {
  const rows = ref([])
  const stats = ref(null)
  const loaded = ref(false)

  const byQid = computed(() => {
    const m = {}
    for (const r of rows.value) m[r.qid] = Number(r.weight)
    return m
  })
  const mastered = computed(() => rows.value.filter((r) => Number(r.weight) >= 70).length)
  const touched = computed(() => rows.value.length)

  async function load(course = 'ctfl', force = false) {
    if (loaded.value && !force) return
    const [w, s] = await Promise.all([api.weights(course), api.stats(course)])
    rows.value = w.rows || []
    stats.value = s
    loaded.value = true
  }

  function reset() { rows.value = []; stats.value = null; loaded.value = false }

  return { rows, stats, loaded, byQid, mastered, touched, load, reset }
})
