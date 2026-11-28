// 请求封装：token、超时、错误归一。所有接口都经过这里
const TOKEN_KEY = 'moti_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || '请求失败')
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// 401 统一处理：交给 store 注册回调，避免这里直接依赖路由
let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function request(path, { method = 'GET', body, timeout = 30000, retry = 0 } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const tk = getToken()
  if (tk) headers['X-Auth-Token'] = tk

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch('/api' + path, {
      method, headers, signal: ctl.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const txt = await r.text()
    let payload = {}
    try { payload = txt ? JSON.parse(txt) : {} } catch { payload = {} }
    if (!r.ok || payload.ok === false) {
      const e = payload.error || {}
      const err = new ApiError(r.status, e.code || 'HTTP_' + r.status, e.message || `请求失败（${r.status}）`)
      if (r.status === 401 && onUnauthorized) onUnauthorized(err)
      if (retry > 0 && r.status >= 500) {
        await new Promise((res) => setTimeout(res, 400))
        return request(path, { method, body, timeout, retry: retry - 1 })
      }
      throw err
    }
    return payload
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', '请求超时，请检查网络')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const get = (p, opt) => request(p, { ...opt, method: 'GET' })
export const post = (p, body, opt) => request(p, { ...opt, method: 'POST', body })
export const patch = (p, body, opt) => request(p, { ...opt, method: 'PATCH', body })
export const del = (p, opt) => request(p, { ...opt, method: 'DELETE' })
