import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../api/auth.js'
import { setToken, getToken, setUnauthorizedHandler } from '../api/client.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getToken())
  const me = ref(null)
  const loading = ref(false)
  const error = ref('')

  const isLogin = computed(() => Boolean(token.value && me.value))
  const isAdmin = computed(() => ['admin', 'owner'].includes(me.value?.role || ''))
  const isOwner = computed(() => me.value?.role === 'owner')
  const tokens = computed(() => Number(me.value?.tokens || 0))
  const username = computed(() => me.value?.username || '')

  function applyLogin(res) {
    token.value = res.token
    setToken(res.token)
    me.value = { username: res.username, role: res.role, tokens: res.tokens, quota: res.quota }
  }

  async function doLogin(u, p) {
    loading.value = true
    error.value = ''
    try {
      applyLogin(await api.login(u, p))
      await fetchMe()
      return true
    } catch (e) {
      error.value = e.message || '登录失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function doRegister(u, p) {
    loading.value = true
    error.value = ''
    try {
      applyLogin(await api.register(u, p))
      await fetchMe()
      return true
    } catch (e) {
      error.value = e.message || '注册失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) return null
    try {
      const r = await api.me()
      me.value = { ...(me.value || {}), ...r }
      return me.value
    } catch (e) {
      if (e.status === 401) clear()
      throw e
    }
  }

  function clear() {
    token.value = ''
    me.value = null
    setToken('')
  }

  async function doLogout() {
    try { await api.logout() } catch {}
    clear()
  }

  // 任何接口返回 401 → 清登录态（路由守卫会把人送去登录页）
  setUnauthorizedHandler(() => clear())

  return { token, me, loading, error, isLogin, isAdmin, isOwner, tokens, username,
    doLogin, doRegister, fetchMe, doLogout, clear }
})
