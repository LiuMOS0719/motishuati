<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useUiStore } from '../stores/ui.js'
import { renderMarkdown } from '../composables/useMarkdown.js'
import * as aiApi from '../api/ai.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  qid: { type: String, default: '' },
  sidExt: { type: String, default: '' },
  answered: { type: Boolean, default: false },
  perm: { type: Array, default: null },
})
const emit = defineEmits(['update:open'])

const auth = useAuthStore()
const ui = useUiStore()

const msgs = ref([])
const input = ref('')
const busy = ref(false)
const model = ref('deepseek')
const box = ref(null)
const lastCost = ref(null)
const SUGG = ['为什么选这个？', '错项错在哪？', '考的是哪个知识点？', '和类似的题怎么区分？']

const canSend = computed(() => Boolean(input.value.trim()) && !busy.value)

async function scrollBottom() {
  await nextTick()
  if (box.value) box.value.scrollTop = box.value.scrollHeight
}

watch(() => [props.open, props.qid, props.sidExt], async () => {
  if (!props.open || !props.qid) return
  try {
    const r = await aiApi.history(props.qid, props.sidExt, 40)
    msgs.value = (r.rows || []).map((m) => ({ role: m.role, content: m.content }))
  } catch { msgs.value = [] }
  scrollBottom()
})

function useSugg(s) {
  input.value = s
  send()
}

async function send() {
  const text = String(input.value || '').trim()
  if (!text || busy.value) return
  input.value = ''
  msgs.value.push({ role: 'me', content: text })
  busy.value = true
  scrollBottom()
  try {
    const r = await aiApi.ask({
      qid: props.qid, session_id: props.sidExt || '', question: text,
      answered: props.answered,
      history: msgs.value.slice(-9, -1).map((m) => ({ role: m.role, content: m.content })),
      model: model.value, perm: props.perm,
    })
    if (r.blocked) {
      msgs.value.push({ role: 'ai', content: r.message || '这个问题与本题无关。', meta: null })
    } else {
      msgs.value.push({ role: 'ai', content: r.answer, meta: r })
      lastCost.value = r
      if (typeof r.tokens === 'number') auth.me = { ...(auth.me || {}), tokens: r.tokens }
    }
  } catch (e) {
    if (e.code === 'NO_TOKENS') {
      ui.toast('AI 余额不足，可切到 GLM（免费）', 'warn', 4000)
      model.value = 'glm'
    } else {
      ui.toast(e.message || 'AI 调用失败', 'error')
    }
    msgs.value.push({ role: 'ai', content: `（这次没答上来：${e.message || '未知错误'}）`, meta: null })
  } finally {
    busy.value = false
    scrollBottom()
  }
}

const close = () => emit('update:open', false)
</script>

<template>
  <Teleport to="body">
    <section class="panel" :class="{ show: open }">
      <div class="ph">
        <div class="dot-ai">AI</div>
        <div>
          <b>AI 追问</b>
          <small>{{ qid }} · {{ model === 'glm' ? 'GLM（免费）' : 'DeepSeek' }}</small>
        </div>
        <div class="x" @click="close">✕</div>
      </div>

      <div ref="box" class="msgs">
        <div v-if="!msgs.length" class="hello">
          <div class="h-bub">
            就这道题提问。答之前我只给思路，答之后会讲清楚为什么。
          </div>
        </div>
        <div v-for="(m, i) in msgs" :key="i" class="msg" :class="m.role === 'me' ? 'user' : 'ai'">
          <div v-if="m.role !== 'me'" class="av">AI</div>
          <div class="bub md" v-html="renderMarkdown(m.content)"></div>
        </div>
        <div v-if="busy" class="msg ai">
          <div class="av">AI</div>
          <div class="bub thinking">思考中…</div>
        </div>
      </div>

      <div class="pf">
        <div class="sugg">
          <button v-for="s in SUGG" :key="s" class="sg" @click="useSugg(s)">{{ s }}</button>
          <button class="sg" @click="model = model === 'glm' ? 'deepseek' : 'glm'">
            {{ model === 'glm' ? '切 DeepSeek' : '切 GLM' }}
          </button>
        </div>
        <textarea
          v-model="input" class="ta" rows="1" placeholder="就这道题问点什么…（Enter 发送）"
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <div class="foot">
          <span class="cost">
            <template v-if="lastCost">入 {{ lastCost.prompt_tokens }} 出 {{ lastCost.completion_tokens }} · 扣 {{ lastCost.tokens_cost }} token</template>
            <template v-else>余额 {{ (auth.tokens / 10000).toFixed(0) }} 万 token</template>
          </span>
          <button class="send" :disabled="!canSend" @click="send">发送</button>
        </div>
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
.panel{position:fixed;top:0;right:0;bottom:0;width:436px;max-width:94vw;z-index:1300;
  background:var(--surface);border-left:1px solid var(--border2);display:flex;flex-direction:column;
  transform:translateX(101%);transition:transform .24s ease;box-shadow:-24px 0 70px rgba(0,0,0,.5)}
.panel.show{transform:none}
.ph{flex:none;padding:14px 18px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.dot-ai{width:26px;height:26px;border-radius:50%;background:linear-gradient(145deg,#3f7cf5,#6ea8ff);
  display:grid;place-items:center;color:#fff;font-size:10px;font-weight:600;flex:none}
.ph b{font-size:13px}
.ph small{display:block;font-size:10.5px;color:var(--muted2);margin-top:1px}
.ph .x{margin-left:auto;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;
  color:var(--muted2);cursor:pointer;font-size:15px}
.ph .x:hover{background:var(--surface3);color:var(--text)}
.msgs{flex:1;overflow:auto;padding:16px 18px 6px;display:flex;flex-direction:column;gap:14px}
.hello{padding:6px 0}
.h-bub{background:var(--surface2);border:1px solid var(--border);border-radius:11px;padding:10px 13px;
  font-size:12.5px;line-height:1.85;color:#9fb0c8}
.msg{display:flex;gap:9px;align-items:flex-start;max-width:100%}
.msg .av{width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;
  font-size:9px;font-weight:600;background:linear-gradient(145deg,#3f7cf5,#6ea8ff);color:#fff}
.bub{background:var(--surface2);border:1px solid var(--border);border-radius:11px;padding:10px 13px;
  font-size:12.5px;line-height:1.9;color:#c9d3e2;min-width:0;word-break:break-word}
.msg.user{justify-content:flex-end}
.msg.user .bub{background:rgba(76,141,255,.14);border-color:rgba(76,141,255,.3);color:#dbe7ff;
  border-bottom-right-radius:4px}
.msg.ai .bub{border-bottom-left-radius:4px;max-width:100%}
.thinking{color:var(--muted2)}
.md :deep(.md-h){font-weight:600;color:#e6ecf6;margin:9px 0 4px}
.md :deep(.md-ul){margin:5px 0;padding-left:18px}
.md :deep(.md-ul li){margin:3px 0}
.md :deep(.md-p){margin:3px 0}
.md :deep(.md-gap){height:5px}
.md :deep(.md-hr){border:none;border-top:1px solid var(--border);margin:9px 0}
.md :deep(.md-quote){border-left:2px solid rgba(76,141,255,.45);padding:6px 10px;margin:7px 0;
  color:#9fb0c8;font-size:11.5px}
.md :deep(b){color:#e6ecf6}
.md :deep(code){background:var(--surface3);padding:1px 5px;border-radius:5px;font-size:12px}
.pf{flex:none;border-top:1px solid var(--border);padding:10px 18px 14px;background:#101419}
.sugg{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px}
.sg{cursor:pointer;font-size:11px;padding:4px 10px;border-radius:999px;background:var(--surface2);
  border:1px solid var(--border);color:var(--muted);font-family:inherit}
.sg:hover{color:var(--text);border-color:var(--border2)}
.ta{width:100%;resize:none;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;
  color:var(--text);padding:9px 11px;font-size:13px;line-height:1.6;outline:none;font-family:inherit}
.ta:focus{border-color:var(--primary)}
.foot{display:flex;align-items:center;gap:10px;margin-top:8px}
.cost{flex:1;font-size:10.5px;color:var(--muted2);font-variant-numeric:tabular-nums}
.send{border:none;border-radius:9px;padding:8px 18px;font-size:12.5px;font-family:inherit;cursor:pointer;
  color:#fff;background:linear-gradient(135deg,#3f7cf5,#5b96ff)}
.send:disabled{opacity:.4;cursor:not-allowed}
</style>
