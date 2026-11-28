<script setup>
import { computed } from 'vue'
import { useCourseStore } from '../stores/course.js'
import { useRouter } from 'vue-router'

const course = useCourseStore()
const router = useRouter()

// 按 domain 分组：软件测试 / 数学 ……
const groups = computed(() => {
  const map = new Map()
  for (const c of course.courseList) {
    const key = c.domain_id || 'other'
    if (!map.has(key)) {
      const d = course.domainList.find((x) => x.id === key)
      map.set(key, { id: key, name: d ? d.name : key, items: [] })
    }
    map.get(key).items.push(c)
  }
  return [...map.values()]
})
</script>

<template>
  <div class="subjectbar">
    <div class="wrap subjectbar-in">
      <div class="sub-label">科目</div>
      <div v-for="g in groups" :key="g.id" class="dgroup">
        <div class="dname">{{ g.name }}</div>
        <button
          v-for="c in g.items" :key="c.id"
          class="chip" :class="{ on: course.currentId === c.id }"
          @click="course.currentId = c.id"
        >{{ c.short || c.name }}</button>
      </div>
      <div class="more" @click="router.push('/admin/papers')" v-if="false">＋ 管理科目</div>
    </div>
  </div>
</template>

<style scoped>
.subjectbar{border-bottom:1px solid var(--border);background:var(--surface)}
.subjectbar-in{display:flex;align-items:center;gap:18px;height:52px;overflow-x:auto}
.sub-label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted2);
  letter-spacing:.1em;flex:none}
.sub-label:before{content:"";width:3px;height:14px;border-radius:2px;background:var(--primary);opacity:.85}
.dgroup{display:flex;align-items:center;gap:8px;flex:none}
.dgroup+.dgroup{padding-left:18px;border-left:1px solid var(--border)}
.dname{font-size:12px;color:var(--muted2);margin-right:2px}
.chip{flex:none;cursor:pointer;border:1px solid transparent;background:transparent;color:var(--muted);
  padding:5px 12px;border-radius:999px;font-size:13px;transition:.16s;white-space:nowrap;font-family:inherit}
.chip:hover{color:var(--text);background:var(--surface2)}
.chip.on{background:var(--primary-soft);border-color:rgba(76,141,255,.4);color:#c7dbff}
.more{flex:none;font-size:12px;color:var(--muted2);cursor:pointer;padding-left:18px;border-left:1px solid var(--border)}
</style>
