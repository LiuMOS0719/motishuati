<script setup>
import { ref } from 'vue'
import { useUiStore } from '../stores/ui.js'
import * as fbApi from '../api/feedback.js'

const ui = useUiStore()
const open = ref(false)
const TYPES = ['功能建议', '界面问题', 'AI 回答', 'AI 额度', '其他']
const type = ref(TYPES[0])
const text = ref('')
const busy = ref(false)
const done = ref(false)

function show() {
  open.value = true
  done.value = false
  type.value = TYPES[0]
  text.value = ''
}

async function submit() {
  if (!text.value.trim()) return ui.toast('写点什么再提交', 'warn')
  busy.value = true
  try {
    await fbApi.addNote({ page: '网站反馈', kind: type.value, note: `[${type.value}] ${text.value.trim()}` })
    done.value = true
  } catch (e) {
    ui.toast(e.message || '提交失败', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card sfb" @click="show">
    <div class="sfb-ic">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
        <path d="M4 5h16v11H10l-6 4V5z" />
      </svg>
    </div>
    <div class="sfb-t"><b>网站反馈</b><span>报问题 · 提建议</span></div>
    <div class="sfb-go">写一条 ›</div>
  </div>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click.self="open = false">
        <div class="dlg">
          <div class="dlg-h">
            <span class="ic"></span><b>网站反馈</b>
            <span class="dlg-x" @click="open = false">✕</span>
          </div>

          <div v-if="!done" class="dlg-b">
            <p class="tip">说说这个网站哪里不好用。题目本身的问题请到答题页点「题目反馈」。</p>
            <div class="fb-chips">
              <button v-for="t in TYPES" :key="t" class="fb-tg" :class="{ on: type === t }" @click="type = t">{{ t }}</button>
            </div>
            <textarea v-model="text" placeholder="越具体越好，比如「手机上看不到题号盘，只能靠底部按钮翻页」"></textarea>
          </div>

          <div v-else class="fb-ok">
            <div class="ic2">✓</div>
            <b>已收到，谢谢</b>
            <span>管理员会在后台看到这条反馈，处理结果不单独通知</span>
          </div>

          <div class="dlg-f">
            <template v-if="!done">
              <button class="btn" @click="open = false">取消</button>
              <button class="sendbtn" :disabled="!text.trim() || busy" @click="submit">
                {{ busy ? '提交中…' : '提交' }}
              </button>
            </template>
            <button v-else class="okbtn" @click="open = false">我知道了</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:16px 18px}
.sfb{display:flex;align-items:center;gap:12px;cursor:pointer;border-style:dashed}
.sfb:hover{border-color:var(--border2);background:var(--surface2)}
.sfb-ic{width:32px;height:32px;border-radius:9px;background:var(--surface3);display:grid;place-items:center;color:#8fb8ff;flex:none}
.sfb-ic svg{width:15px;height:15px}
.sfb-t{flex:1;line-height:1.4;min-width:0}
.sfb-t b{display:block;font-size:12.5px;font-weight:500;color:#c8cfdb}
.sfb-t span{font-size:11px;color:var(--muted2)}
.sfb-go{flex:none;font-size:11.5px;color:var(--muted2)}
.mask{position:fixed;inset:0;background:rgba(6,8,12,.7);z-index:3900;display:grid;place-items:center;padding:20px}
.dlg{width:min(440px,94vw);background:var(--surface);border:1px solid var(--border2);border-radius:14px;overflow:hidden}
.dlg-h{display:flex;align-items:center;gap:9px;padding:15px 18px;border-bottom:1px solid var(--border)}
.dlg-h b{font-size:14px;flex:1}
.dlg-x{cursor:pointer;color:var(--muted2);font-size:14px}
.dlg-b{padding:16px 18px}
.tip{color:var(--muted2);font-size:11.5px;margin:0 0 12px;line-height:1.6}
.fb-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:11px}
.fb-tg{border:1px solid var(--border);background:var(--surface2);color:var(--muted);font-size:12px;
  padding:5px 11px;border-radius:999px;cursor:pointer;font-family:inherit}
.fb-tg.on{background:var(--primary-soft);border-color:rgba(76,141,255,.5);color:#c7dbff}
textarea{width:100%;min-height:88px;resize:vertical;background:var(--surface2);border:1px solid var(--border2);
  border-radius:10px;color:var(--text);padding:10px 12px;font-size:13px;line-height:1.7;outline:none;font-family:inherit}
textarea:focus{border-color:var(--primary)}
.fb-ok{padding:30px 18px;text-align:center}
.ic2{width:40px;height:40px;border-radius:50%;background:var(--green-soft);color:var(--green);
  display:grid;place-items:center;font-size:20px;margin:0 auto 12px}
.fb-ok b{display:block;font-size:14px;margin-bottom:6px}
.fb-ok span{font-size:11.5px;color:var(--muted2)}
.dlg-f{display:flex;justify-content:flex-end;gap:9px;padding:0 18px 16px}
.sendbtn{border:none;border-radius:9px;padding:8px 20px;font-size:13px;font-family:inherit;cursor:pointer;
  color:#fff;background:linear-gradient(135deg,#3f7cf5,#5b96ff)}
.sendbtn:disabled{opacity:.4;cursor:not-allowed}
.okbtn{border:none;border-radius:9px;padding:8px 20px;font-size:13px;font-family:inherit;cursor:pointer;
  color:#fff;background:linear-gradient(135deg,#3f7cf5,#5b96ff)}
.fade-enter-active,.fade-leave-active{transition:.16s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
