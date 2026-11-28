export default [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue'),
    meta: { title: '主页' },
  },
  {
    path: '/home',
    redirect: '/',
  },
  {
    path: '/papers',
    name: 'papers',
    component: () => import('../views/PaperSelect.vue'),
    meta: { title: '试卷选择' },
  },
  {
    path: '/quiz/:sid',
    name: 'quiz',
    component: () => import('../views/Quiz.vue'),
    meta: { title: '答题' },
  },
  {
    path: '/result/:sid',
    name: 'result',
    component: () => import('../views/Result.vue'),
    meta: { title: '结果' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('../views/History.vue'),
    meta: { title: '做题记录' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/Settings.vue'),
    meta: { title: '个人设置' },
  },
  {
    path: '/status',
    name: 'status',
    component: () => import('../views/Status.vue'),
    meta: { public: true, title: '服务状态' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notfound',
    component: () => import('../views/NotFound.vue'),
    meta: { public: true, title: '页面不存在' },
  },
]
