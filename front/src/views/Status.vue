<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { health, notice } from '../api/course.js'

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const info = ref(null)
const noticeText = ref('')
const failed = ref(false)

// 支持 /status?code=403 这类直接指定状态
const code = computed(() => String(route.query.code || ''))
const kind = computed(() => {
  if (code.value === '403') return 'forbidden'
  if (code.value === '500') return 'error'
  if (code.value === 'maint') return 'maint'
  if (failed.value) return 'error'
  return 'ok'
})

const VIEW = {
  forbidden: { big: '403', cls: 'code4', title: '你没有权限看这个页面', desc: '这个页面只对管理员开放。<br>如果你觉得是误判，联系站长。' },
  error: { big: '500', cls: 'code5', title: '服务暂时不可用', desc: '后端出了点问题，稍等一下再试。<br>练习记录不会丢。' },
  maint: { big: '维护', cls: 'codem', title: '正在维护', desc: '题库或服务在更新，几分钟后回来。<br>已经答过的题都还在。' },
}

async function check() {
  loading.value = true
  failed.value = false
  try {
    const [h, n] = await Promise.all([health(), notice()])
    info.value = h
    noticeText.value = n.text || ''
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(check)
</script>

<template>
  <div class="wrap">
    <div class="inner">
      <div v-if="loading" class="loading">正在检查服务状态…</div>

      <template v-else-if="kind === 'ok'">
        <div class="big codeOk">正常</div>
        <h3>服务运行中</h3>
        <p class="desc">
          题库 {{ info?.questions }} 题 · AI {{ info?.ai ? '已启用' : '未启用' }}<br>
          版本 {{ info?.version }}
        </p>
        <div class="acts">
          <button class="btn ghost" @click="router.push('/')">回主页</button>
          <button class="btn" @click="check">重新检查</button>
        </div>
        <div v-if="noticeText" class="note-box">
          <b>公告</b>
          <p>{{ noticeText }}</p>
        </div>
      </template>

      <template v-else>
        <div class="big" :class="VIEW[kind].cls">{{ VIEW[kind].big }}</div>
        <h3>{{ VIEW[kind].title }}</h3>
        <p class="desc" v-html="VIEW[kind].desc"></p>
        <div class="acts">
          <button class="btn ghost" @click="router.push('/')">回主页</button>
          <button class="btn" @click="check">重新检查</button>
        </div>
      </template>

      <div class="foot-note">墨题 · shuati.liumos.top</div>
    </div>
  </div>
</template>

<style scoped>
.wrap{min-height:100vh;display:grid;place-items:center;padding:40px 24px;text-align:center}
.inner{max-width:420px}
.loading{font-size:13px;color:var(--muted2)}
.big{font-size:56px;font-weight:700;letter-spacing:2px;line-height:1;color:#202634;margin-bottom:18px}
.big.code4{color:#2a3140}
.big.code5{color:rgba(239,95,107,.28)}
.big.codem{font-size:40px;color:rgba(229,163,60,.3);letter-spacing:6px}
.big.codeOk{font-size:44px;color:rgba(51,201,138,.32);letter-spacing:6px}
h3{margin:0 0 10px;font-size:17px;font-weight:600;color:var(--text)}
.desc{margin:0 0 24px;font-size:13px;line-height:1.9;color:var(--muted2)}
.acts{display:flex;gap:10px;justify-content:center}
.btn{border:1px solid var(--border2);background:var(--surface2);color:var(--text);border-radius:9px;
  padding:9px 18px;font-size:13px;cursor:pointer;font-family:inherit}
.btn:hover{background:var(--surface3)}
.btn.ghost{background:transparent}
.note-box{margin-top:26px;text-align:left;background:var(--surface);border:1px solid var(--border);
  border-radius:11px;padding:13px 15px}
.note-box b{font-size:11.5px;color:var(--amber)}
.note-box p{margin:6px 0 0;font-size:12.5px;color:var(--muted);line-height:1.75;white-space:pre-wrap}
.foot-note{margin-top:34px;font-size:11px;color:#3f4756;letter-spacing:.2px}
</style>
