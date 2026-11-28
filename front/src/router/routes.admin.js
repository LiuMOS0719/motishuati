// 管理端全部懒加载：普通用户永远不下载这些 chunk
export default [
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { role: 'admin', title: '后台管理' },
    children: [
      { path: '', redirect: '/admin/overview' },
      {
        path: 'overview',
        name: 'admin-overview',
        component: () => import('../views/admin/AdminOverview.vue'),
        meta: { role: 'admin', title: '概览' },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('../views/admin/AdminUsers.vue'),
        meta: { role: 'admin', title: '用户' },
      },
      {
        path: 'feedback',
        name: 'admin-feedback',
        component: () => import('../views/admin/AdminFeedback.vue'),
        meta: { role: 'admin', title: '题目反馈' },
      },
      {
        path: 'site-feedback',
        name: 'admin-site-feedback',
        component: () => import('../views/admin/AdminSiteFeedback.vue'),
        meta: { role: 'admin', title: '想法记录' },
      },
      {
        path: 'logs',
        name: 'admin-logs',
        component: () => import('../views/admin/AdminLogs.vue'),
        meta: { role: 'admin', title: '操作日志' },
      },
      {
        path: 'notice',
        name: 'admin-notice',
        component: () => import('../views/admin/AdminNotice.vue'),
        meta: { role: 'admin', title: '公告与备份' },
      },
    ],
  },
  {
    path: '/admin/papers',
    name: 'admin-papers',
    component: () => import('../views/admin/AdminPapers.vue'),
    meta: { role: 'admin', title: '试卷与大纲' },
  },
  {
    path: '/admin/question/:qid',
    name: 'admin-question',
    component: () => import('../views/admin/AdminQuestion.vue'),
    meta: { role: 'admin', title: '编辑题目' },
  },
]
