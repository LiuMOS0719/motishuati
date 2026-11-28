import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../api/session.js'

// 当前练习场次：题号、已答、选项乱序都在这里，刷新可恢复
export const useSessionStore = defineStore('session', () => {
  const sid = ref('')
  const qids = ref([])
  const answers = ref({})        // qid → { chosen:[], correct, answer:[], explain, weight }
  const order = ref({})          // qid → [3,0,2,1] 选项展示顺序
  const index = ref(0)
  const startedAt = ref(0)
  const sources = ref([])
  const mode = ref('random')
  const saving = ref(false)
  const finished = ref(false)

  const total = computed(() => qids.value.length)
  const answeredCount = computed(() => Object.keys(answers.value).length)
  const rightCount = computed(() => Object.values(answers.value).filter((a) => a.correct).length)
  const currentQid = computed(() => qids.value[index.value] || '')
  const progress = computed(() => (total.value ? Math.round((answeredCount.value / total.value) * 100) : 0))

  function start(payload) {
    sid.value = payload.sid
    qids.value = payload.qids || []
    answers.value = {}
    order.value = {}
    index.value = 0
    startedAt.value = Date.now()
    sources.value = payload.sources || []
    mode.value = payload.mode || 'random'
    finished.value = false
  }

  function restore(cur) {
    if (!cur) return
    sid.value = cur.id
    qids.value = cur.qids || []
    answers.value = {}
    for (const it of cur.items || []) {
      if (it.chosen === null || it.chosen === undefined) continue   // 未作答的不算已答
      answers.value[it.qid] = { chosen: it.chosen, correct: it.correct }
    }
    order.value = cur.perms || {}
    index.value = 0
    startedAt.value = Number(cur.ts) || Date.now()
    sources.value = cur.sources || []
    mode.value = cur.mode || 'random'
    finished.value = Boolean(cur.finished)
  }

  // 顺带把选项乱序写进 order（同一题多次进入保持稳定）
  function ensureOrder(qid, optionCount) {
    if (order.value[qid] && order.value[qid].length === optionCount) return order.value[qid]
    const idx = Array.from({ length: optionCount }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    order.value[qid] = idx
    return idx
  }

  async function submit(qid, chosen) {
    const r = await api.answer(sid.value, qid, chosen)
    answers.value[qid] = {
      chosen, correct: r.correct, answer: r.answer, explain: r.explain, weight: r.weight,
    }
    return r
  }

  async function close() {
    const r = await api.finish(sid.value, 'ctfl')
    finished.value = true
    return r
  }

  return { sid, qids, answers, order, index, startedAt, sources, mode, saving, finished,
    total, answeredCount, rightCount, currentQid, progress, start, restore, ensureOrder, submit, close }
})
