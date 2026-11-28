<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useUiStore } from '../stores/ui.js'
import * as aiApi from '../api/ai.js'
import { renderMarkdown } from '../composables/useMarkdown.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  qid: { type: String, default: '' },
  sidExt: { type: String, default: '' },
  answered: { type: Boolean, default: false },
  perm: { type: Array, default: null },
})
const emit = defineEmits(['update:open', 'spent'])

const auth = useAuthStore()
const ui = useUiStore()

const msgs = ref([])
const input = ref('')
const busy = ref(false)
const model = ref('deepseek')
const box = ref(null)
const loadingHistory = ref(false)

const canSend = computed(() => input.value.trim() && !busy.value)

async function scrollBottom() {
  await nextTick()
  if (box.value) box.value.scrollTop = box.value.scrollHeight
}

// 打开时拉历史（同一个 qid + 场次算一个对话）
watch(() => [props.open, props.qid, props.sidExt], async () => {
  if (!props.open || !props.qid) return
  loadingHistory.value = true
  try {
    const r = await aiApi.history(props.qid, props.sidExt, 40)
    msgs.value = (r.rows || []).map((m) => ({ role: m.role, content: m.content }))
  } catch {
    msgs.value = []
  } finally {
    loadingHistory.value = false
    scrollBottom()
  }
})

async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  input.value = ''
  msgs.value.push({ role: 'me', content: text })
  busy.value = true
  scrollBottom()
  try {
    const r = await aiApi.ask({
      qid: props.qid,
      session_id: props.sidExt || '',
      question: text,
      answered: props.answered,
      history: msgs.value.slice(-9, -1).map((m) => ({ role: m.role, content: m.content })),
      model: model.value,
      perm: props.perm,
    })
    if (r.blocked) {
      msgs.value.push({ role: 'ai', content: r.message || '这个问题与本题无关，我不回答。', blocked: true })
    } else {
      msgs.value.push({ role: 'ai', content: r.answer, meta: r })
      if (typeof r.tokens === 'number') {
        auth.me = { ...(auth.me || {}), tokens: r.tokens }
        emit('spent', r)
      }
    }
  } catch (e) {
    if (e.code === 'NO_TOKENS') {
      ui.toast('AI 余额不足，可以切到 GLM（免费）或让管理员充值', 'warn', 4000)
      model.value = 'glm'
    } else {
      ui.toast(e.message || 'AI 调用失败', 'error')
    }
    msgs.value.push({ role: 'ai', content: '（这次没答上来：' + (e.message || '未知错误') + '）', blocked: true })
  } finally {
    busy.value = false
    scrollBottom()
  }
}

const close = () => emit('update:open', false)
</script>

<template>
  <Teleport to="body">
    <Transition name="slide">
      <div v-if="open" class="mask" @click.self="close">
        <aside class="drawer">
          <header class="hd">
            <div class="t">
              <b>AI 追问</b>
              <span class="hint">{{ qid }}</span>
            </div>
            <div class="hd-r">
              <select v-model="model" class="sel">
                <option value="deepseek">DeepSeek</option>
                <option value="glm">GLM（免费）</option>
              </select>
              <button class="x" @click="close">×</button>
            </div>
          </header>

          <div ref="box" class="msgs">
            <div v-if="loadingHistory" class="hint center">正在载入历史…</div>
            <div v-else-if="!msgs.length" class="hint center">
              可以问：为什么选这个？错项错在哪？这道题考的是哪个知识点？
            </div>
            <div v-for="(m, i) in msgs" :key="i" class="msg" :class="[m.role, { blocked: m.blocked }]">
              <div class="bubble md" v-html="renderMarkdown(m.content)"></div>
              <div v-if="m.meta" class="meta num">
                {{ m.meta.model === 'glm' ? 'GLM' : 'DeepSeek' }}
                · 入 {{ m.meta.prompt_tokens }} 出 {{ m.meta.completion_tokens }}
                · 扣 {{ m.meta.tokens_cost }} token
              </div>
            </div>
            <div v-if="busy" class="msg ai"><div class="bubble thinking">思考中…</div></div>
          </div>

          <footer class="ft">
            <textarea
              v-model="input" class="inp" rows="2" placeholder="问点什么…（Enter 发送）"
              @keydown.enter.exact.prevent="send"
            ></textarea>
            <button class="btn primary send" :disabled="!canSend" @click="send">发送</button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask{position:fixed;inset:0;background:rgba(4,6,10,.6);z-index:3000;display:flex;justify-content:flex-end}
.drawer{width:min(460px,100vw);height:100%;background:var(--surface);border-left:1px solid var(--border2);
  display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.5)}
.hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);flex:none}
.t{display:flex;align-items:baseline;gap:9px}
.t b{font-size:14px}
.hd-r{display:flex;align-items:center;gap:8px}
.sel{background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:12px;
  border-radius:7px;padding:3px 6px;outline:none;font-family:inherit}
.x{border:none;background:transparent;color:var(--muted2);font-size:20px;line-height:1;cursor:pointer}
.msgs{flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.center{text-align:center;padding:26px 10px;line-height:1.8}
.msg{display:flex;flex-direction:column;gap:4px;max-width:92%}
.msg.me{align-self:flex-end;align-items:flex-end}
.bubble{padding:9px 13px;border-radius:12px;font-size:13.5px;line-height:1.8;word-break:break-word}
.msg.me .bubble{background:var(--primary);color:#fff;border-bottom-right-radius:4px}
.msg.ai .bubble{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-bottom-left-radius:4px}
.msg.blocked .bubble{background:var(--amber-soft);border-color:rgba(229,163,60,.3);color:#f3cd8a}
.thinking{color:var(--muted2)}
.md :deep(.md-h){font-weight:600;color:var(--text);margin:8px 0 4px}
.md :deep(.md-h1),.md :deep(.md-h2){font-size:14px}
.md :deep(.md-h3),.md :deep(.md-h4){font-size:13.5px}
.md :deep(.md-ul){margin:5px 0;padding-left:18px}
.md :deep(.md-ul li){margin:3px 0}
.md :deep(.md-p){margin:3px 0}
.md :deep(.md-gap){height:6px}
.md :deep(.md-hr){border:none;border-top:1px solid var(--border);margin:9px 0}
.md :deep(.md-quote){margin:6px 0;padding:4px 10px;border-left:2px solid var(--primary);color:var(--muted2)}
.md :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px;font-size:12.5px}
.meta{font-size:10.5px;color:var(--muted2);padding:0 4px}
.ft{flex:none;display:flex;gap:8px;padding:12px;border-top:1px solid var(--border)}
.inp{flex:1;resize:none;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;
  color:var(--text);padding:9px 11px;font-size:13.5px;line-height:1.6;outline:none;font-family:inherit}
.inp:focus{border-color:var(--primary)}
.send{align-self:flex-end;height:36px}
.slide-enter-active,.slide-leave-active{transition:.22s}
.slide-enter-from .drawer,.slide-leave-to .drawer{transform:translateX(100%)}
.slide-enter-from,.slide-leave-to{opacity:.4}
</style>
