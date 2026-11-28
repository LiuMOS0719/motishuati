<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import * as adminApi from '../../api/admin.js'

const emit = defineEmits(['changed'])
const auth = useAuthStore()
const ui = useUiStore()

const loading = ref(true)
const rows = ref([])
const edit = ref(null)     // { username, tokens, quota }
const creating = ref(null) // { username, password, role }
const resetting = ref(null)

async function load() {
  loading.value = true
  try { rows.value = (await adminApi.users()).rows || [] }
  catch (e) { ui.toast(e.message || '加载失败', 'error') }
  finally { loading.value = false }
}

function openEdit(u) { edit.value = { username: u.username, tokens: u.tokens, quota: u.quota } }

async function saveEdit() {
  try {
    await adminApi.setQuota(edit.value.username, {
      tokens: Number(edit.value.tokens), quota: Number(edit.value.quota),
    })
    ui.toast('已保存', 'success')
    edit.value = null
    await load(); emit('changed')
  } catch (e) { ui.toast(e.message || '保存失败', 'error') }
}

async function toggleStatus(u) {
  const next = u.status === 'active' ? 'disabled' : 'active'
  const ok = await ui.ask({
    title: next === 'disabled' ? '停用这个账号？' : '恢复这个账号？',
    message: u.username, confirmText: '确定',
  })
  if (!ok) return
  try {
    await adminApi.setQuota(u.username, { status: next })
    await load(); emit('changed')
  } catch (e) { ui.toast(e.message || '操作失败', 'error') }
}

async function saveCreate() {
  try {
    await adminApi.createUser({
      username: creating.value.username, password: creating.value.password,
      role: creating.value.role, tokens: Number(creating.value.tokens || 0),
    })
    ui.toast('账号已创建', 'success')
    creating.value = null
    await load(); emit('changed')
  } catch (e) { ui.toast(e.message || '创建失败', 'error') }
}

async function saveReset() {
  try {
    await adminApi.resetPassword(resetting.value.username, resetting.value.password)
    ui.toast('密码已重置，该账号所有设备需重新登录', 'success')
    resetting.value = null
  } catch (e) { ui.toast(e.message || '重置失败', 'error') }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="hd">
      <h1>用户</h1>
      <button class="btn sm primary" @click="creating = { username: '', password: '', role: 'user', tokens: 0 }">
        新建账号
      </button>
    </div>

    <el-table :data="rows" v-loading="loading" size="small" style="width:100%">
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column prop="username" label="用户名" min-width="130" />
      <el-table-column label="身份" width="90">
        <template #default="{ row }">
          <em class="role" :class="row.role">{{ row.role === 'owner' ? '站长' : row.role === 'admin' ? '管理员' : '用户' }}</em>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :class="row.status === 'active' ? 'on' : 'off'">{{ row.status === 'active' ? '正常' : '停用' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="tokens" label="AI 余额" width="110" align="right" />
      <el-table-column prop="sessions" label="场次" width="70" align="right" />
      <el-table-column prop="last_login" label="最近登录" width="160" />
      <el-table-column label="操作" width="220" align="right">
        <template #default="{ row }">
          <button class="op" @click="openEdit(row)">额度</button>
          <button class="op" @click="resetting = { username: row.username, password: '' }">改密</button>
          <button class="op" :class="{ danger: row.status === 'active' }" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '停用' : '恢复' }}
          </button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 额度弹窗 -->
    <el-dialog v-model="edit" title="调整额度" width="380px" v-if="edit">
      <div class="frm">
        <label>用户名</label><div>{{ edit.username }}</div>
        <label>AI 余额（token，1 = 0.000001 元）</label>
        <el-input-number v-model="edit.tokens" :min="0" :step="10000" controls-position="right" style="width:100%" />
        <label>旧次数额度（兼容字段）</label>
        <el-input-number v-model="edit.quota" :min="0" controls-position="right" style="width:100%" />
      </div>
      <template #footer>
        <button class="btn" @click="edit = null">取消</button>
        <button class="btn primary" @click="saveEdit">保存</button>
      </template>
    </el-dialog>

    <!-- 新建 -->
    <el-dialog v-model="creating" title="新建账号" width="380px" v-if="creating">
      <div class="frm">
        <label>用户名</label>
        <el-input v-model="creating.username" placeholder="3-20 位" />
        <label>初始密码</label>
        <el-input v-model="creating.password" type="password" placeholder="至少 6 位" />
        <label>身份</label>
        <el-select v-model="creating.role" style="width:100%">
          <el-option label="普通用户" value="user" />
          <el-option v-if="auth.isOwner" label="管理员" value="admin" />
        </el-select>
        <label>初始 AI 余额</label>
        <el-input-number v-model="creating.tokens" :min="0" :step="10000" controls-position="right" style="width:100%" />
      </div>
      <template #footer>
        <button class="btn" @click="creating = null">取消</button>
        <button class="btn primary" @click="saveCreate">创建</button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetting" title="重置密码" width="360px" v-if="resetting">
      <div class="frm">
        <label>{{ resetting.username }} 的新密码</label>
        <el-input v-model="resetting.password" type="password" placeholder="至少 6 位" />
      </div>
      <template #footer>
        <button class="btn" @click="resetting = null">取消</button>
        <button class="btn primary" @click="saveReset">重置</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.hd{display:flex;align-items:center;margin-bottom:16px}
.hd h1{margin:0;font-size:17px;font-weight:600}
.hd .btn{margin-left:auto}
.role{font-style:normal;font-size:11px;padding:2px 8px;border-radius:6px;background:var(--surface3);color:var(--muted)}
.role.owner{background:var(--amber-soft);color:#f3cd8a}
.role.admin{background:var(--primary-soft);color:#cfe0ff}
.on{color:var(--green);font-size:12px}
.off{color:var(--red);font-size:12px}
.op{border:none;background:transparent;color:var(--primary);font-size:12px;cursor:pointer;padding:3px 6px;border-radius:5px}
.op:hover{background:var(--primary-soft)}
.op.danger{color:var(--red)}
.op.danger:hover{background:var(--red-soft)}
.frm{display:grid;grid-template-columns:1fr;gap:7px;font-size:13px}
.frm label{font-size:12px;color:var(--muted2);margin-top:6px}
</style>
