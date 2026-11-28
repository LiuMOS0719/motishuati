import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/question.js'
import { index as indexApi } from '../api/course.js'

// 题库：轻量索引（184 条）+ 正文按需缓存（不整库塞进内存）
export const useBankStore = defineStore('bank', () => {
  const rows = ref([])          // 索引
  const loaded = ref(false)
  const loading = ref(false)
  const cache = ref({})         // qid → 题目正文（含 figure）
  const inflight = new Map()

  async function load(force = false) {
    if (loaded.value && !force) return rows.value
    if (loading.value) return rows.value
    loading.value = true
    try {
      const r = await indexApi('ctfl')
      rows.value = r.rows || []
      loaded.value = true
      return rows.value
    } finally {
      loading.value = false
    }
  }

  // 批量取正文：已缓存的不再请求
  async function ensure(ids) {
    const need = ids.filter((id) => !cache.value[id] && !inflight.has(id))
    if (need.length) {
      // 一次最多 200 个（后端限制）
      for (let i = 0; i < need.length; i += 200) {
        const chunk = need.slice(i, i + 200)
        const p = api.questions(chunk).then((r) => {
          for (const q of r.rows || []) cache.value[q.id] = q
          chunk.forEach((id) => inflight.delete(id))
        }).catch((e) => {
          chunk.forEach((id) => inflight.delete(id))
          throw e
        })
        chunk.forEach((id) => inflight.set(id, p))
        await p
      }
    } else {
      await Promise.all(ids.filter((id) => inflight.has(id)).map((id) => inflight.get(id)))
    }
    return ids.map((id) => cache.value[id]).filter(Boolean)
  }

  const get = (id) => cache.value[id] || null

  // 范围筛选：卷与章同时选时取交集（与旧站一致）
  function filter({ papers = [], chapters = [] } = {}) {
    const ps = new Set(papers)
    const cs = new Set(chapters.map(String))   // 库里 node.code 就是 '1'..'6'
    return rows.value.filter((r) => {
      const rp = String(r.papers || '').split(',').filter(Boolean)
      const rc = String(r.chapters || '').split(',').filter(Boolean)
      const okP = ps.size === 0 || rp.some((p) => ps.has(p))
      const okC = cs.size === 0 || rc.some((c) => cs.has(c))
      return okP && okC
    })
  }

  function reset() { rows.value = []; cache.value = {}; loaded.value = false }

  return { rows, loaded, loading, cache, load, ensure, get, filter, reset }
})

// 随机抽 n 题，再按原索引顺序排（顺序练习也不会永远只抽到前面）
export function sampleOrdered(pool, n) {
  const arr = pool.slice()
  if (n >= arr.length) return arr
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  const picked = arr.slice(0, n)
  const pos = new Map(pool.map((q, i) => [q.id, i]))
  picked.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
  return picked
}
