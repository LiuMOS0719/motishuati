<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import * as sessionApi from '../api/session.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const sort = ref('rate')
const rows = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await sessionApi.leaderboard(sort.value)
    rows.value = (r.rows || []).slice(0, 5)
  } catch { rows.value = [] }
  finally { loading.value = false }
}

const shown = computed(() => rows.value)

watch(sort, load)
onMounted(load)
</script>

<template>
  <div class="card">
    <div class="sec-h">
      <b>排行榜</b>
      <div class="tabs">
        <button :class="{ on: sort === 'rate' }" @click="sort = 'rate'">正确率</button>
        <button :class="{ on: sort === 'count' }" @click="sort = 'count'">题量</button>
      </div>
    </div>
    <div v-if="!shown.length" class="hint">暂无榜单数据（答满 20 题才入榜）</div>
    <div v-for="r in shown" :key="r.rank" class="rank">
      <div class="rk" :class="r.rank <= 3 ? 'top' + r.rank : ''">{{ r.rank }}</div>
      <div class="rname" :class="{ me: r.mine }">{{ r.name }}</div>
      <div class="rval">{{ r.value }}{{ sort === 'rate' ? '%' : '' }}</div>
    </div>
  </div>
</template>

<style scoped>
.card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:16px 18px}
.sec-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.sec-h b{font-size:13px}
.tabs{display:flex;gap:2px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:2px}
.tabs button{border:none;background:transparent;color:var(--muted2);font-size:11px;padding:3px 9px;
  border-radius:6px;cursor:pointer;font-family:inherit}
.tabs button.on{background:var(--surface3);color:var(--text)}
.rank{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:12.5px}
.rank+.rank{border-top:1px dashed rgba(255,255,255,.05)}
.rk{flex:none;width:18px;height:18px;border-radius:5px;display:grid;place-items:center;
  font-size:10.5px;background:var(--surface2);color:var(--muted2)}
.rk.top1{background:rgba(229,163,60,.18);color:#f3cd8a}
.rk.top2{background:rgba(180,190,210,.14);color:#c8cfdb}
.rk.top3{background:rgba(190,120,70,.16);color:#d8a684}
.rname{flex:1;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.rname.me{color:var(--primary)}
.rval{flex:none;color:#c2cad8;font-variant-numeric:tabular-nums;font-size:12px}
</style>
