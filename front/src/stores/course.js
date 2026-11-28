import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../api/course.js'

export const useCourseStore = defineStore('course', () => {
  const domainList = ref([])
  const courseList = ref([])
  const nodes = ref([])
  const papers = ref([])
  const noticeText = ref('')
  const noticeActive = ref(false)
  const loaded = ref(false)
  const currentId = ref('ctfl')

  const course = computed(() => courseList.value.find((c) => c.id === currentId.value) || courseList.value[0] || {})
  // 章：顶层节点（parent_id 为空），按 sort 排
  const chapters = computed(() => nodes.value
    .filter((n) => !n.parent_id)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)))

  async function load(force = false) {
    if (loaded.value && !force) return
    const [d, c, n] = await Promise.all([api.domains(), api.courses(), api.notice()])
    domainList.value = d.rows || []
    courseList.value = c.rows || []
    nodes.value = c.nodes || []
    papers.value = c.papers || []
    noticeText.value = n.text || ''
    noticeActive.value = Boolean(n.active)
    loaded.value = true
  }

  const paperName = (id) => {
    const p = papers.value.find((x) => x.id === id)
    return p ? p.name : id
  }

  return { domainList, courseList, nodes, papers, noticeText, noticeActive, loaded,
    currentId, course, chapters, load, paperName }
})
