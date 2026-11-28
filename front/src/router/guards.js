import { useAuthStore } from '../stores/auth.js'

const TITLE = '墨题 · ISTQB 刷题'

export function installGuards(router) {
  router.beforeEach(async (to) => {
    document.title = to.meta.title ? `${to.meta.title} · ${TITLE}` : TITLE

    if (to.meta.public) return true

    const auth = useAuthStore()
    if (!auth.token) {
      return { name: 'login', query: { next: to.fullPath } }
    }
    if (!auth.me) {
      try {
        await auth.fetchMe()
      } catch {
        return { name: 'login', query: { next: to.fullPath } }
      }
    }
    if (to.meta.role === 'admin' && !auth.isAdmin) {
      return { name: 'home' }
    }
    return true
  })
}
