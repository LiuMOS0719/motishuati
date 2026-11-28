import { createRouter, createWebHistory } from 'vue-router'
import userRoutes from './routes.user.js'
import adminRoutes from './routes.admin.js'
import { installGuards } from './guards.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [...userRoutes, ...adminRoutes],
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    return { top: 0 }
  },
})

installGuards(router)
export default router
