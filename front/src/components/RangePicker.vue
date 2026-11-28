<script setup>
import { computed } from 'vue'

const props = defineProps({
  papers: { type: Array, default: () => [] },
  chapters: { type: Array, default: () => [] },
  paperDefs: { type: Array, default: () => [] },
  chapterDefs: { type: Array, default: () => [] },
  counts: { type: Object, default: () => ({ paper: {}, chapter: {} }) },
})
const emit = defineEmits(['update:papers', 'update:chapters'])

const paperIds = computed(() => props.paperDefs.map((p) => p.id))
const chapterIds = computed(() => props.chapterDefs.map((c) => String(c.code || '')))

function togglePaper(id) {
  const s = new Set(props.papers)
  s.has(id) ? s.delete(id) : s.add(id)
  emit('update:papers', [...s])
}
function toggleChapter(id) {
  const s = new Set(props.chapters)
  s.has(id) ? s.delete(id) : s.add(id)
  emit('update:chapters', [...s])
}
function allPapers() { emit('update:papers', props.papers.length === paperIds.value.length ? [] : [...paperIds.value]) }
function allChapters() { emit('update:chapters', props.chapters.length === chapterIds.value.length ? [] : [...chapterIds.value]) }
</script>

<template>
  <div class="rp">
    <div class="grp">
      <div class="grp-h">
        <span class="lbl">试卷</span>
        <span class="cnt">已选 {{ papers.length }} / {{ paperIds.length }}</span>
        <div class="ops">
          <button class="mini" @click="allPapers">{{ papers.length === paperIds.length ? '清空' : '全选' }}</button>
        </div>
      </div>
      <div class="chips">
        <button
          v-for="p in paperDefs" :key="p.id"
          class="chip" :class="{ on: papers.includes(p.id) }"
          @click="togglePaper(p.id)"
        >
          {{ p.name }}
          <em class="num">{{ counts.paper?.[p.id] ?? 0 }}</em>
        </button>
        <span v-if="!paperDefs.length" class="hint">暂无试卷</span>
      </div>
    </div>

    <div class="grp">
      <div class="grp-h">
        <span class="lbl">章节</span>
        <span class="cnt">已选 {{ chapters.length }} / {{ chapterIds.length }}</span>
        <div class="ops">
          <button class="mini" @click="allChapters">{{ chapters.length === chapterIds.length ? '清空' : '全选' }}</button>
        </div>
      </div>
      <div class="chips">
        <button
          v-for="c in chapterDefs" :key="c.id"
          class="chip" :class="{ on: chapters.includes(String(c.code || '')) }"
          @click="toggleChapter(String(c.code || ''))"
        >
          {{ c.name }}
          <em class="num">{{ counts.chapter?.[String(c.code || '')] ?? 0 }}</em>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp{display:flex;flex-direction:column;gap:16px}
.grp-h{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.lbl{font-size:12.5px;color:var(--text);letter-spacing:.04em}
.lbl:before{content:"";display:inline-block;width:3px;height:12px;border-radius:2px;background:var(--primary);
  margin-right:7px;vertical-align:-1px;opacity:.85}
.cnt{font-size:11.5px;color:var(--muted2)}
.ops{margin-left:auto}
.mini{border:none;background:transparent;color:var(--primary);font-size:12px;cursor:pointer;padding:2px 6px;border-radius:6px}
.mini:hover{background:var(--primary-soft)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{border:1px solid var(--border);background:var(--surface2);color:var(--muted);
  padding:6px 12px;border-radius:999px;font-size:12.5px;cursor:pointer;transition:.15s;
  display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.chip:hover{border-color:var(--border2);color:var(--text)}
.chip.on{background:var(--primary-soft);border-color:rgba(76,141,255,.5);color:#cfe0ff}
.chip em{font-style:normal;font-size:11px;color:var(--muted2);font-variant-numeric:tabular-nums}
.chip.on em{color:#9fc2ff}
</style>
