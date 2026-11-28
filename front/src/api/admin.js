import { get, post } from './client.js'

export const overview = () => get('/admin/overview')
export const users = () => get('/admin/users')
export const setQuota = (username, patchObj) => post('/admin/quota', { username, ...patchObj })
export const createUser = (payload) => post('/admin/user', payload)
export const resetPassword = (username, newPassword) => post('/admin/reset-password', { username, new_password: newPassword })
export const getNotice = () => get('/admin/notice')
export const setNotice = (text, active) => post('/admin/notice', { text, active })
export const listQuestions = (kw) => get('/admin/questions' + (kw ? '?q=' + encodeURIComponent(kw) : ''))
export const getQuestion = (id) => get('/admin/question?id=' + encodeURIComponent(id))
export const saveQuestion = (payload) => post('/admin/question', payload)
export const bankImport = (payload) => post('/admin/bank-import', payload)
export const backupUrl = () => '/api/admin/backup'
export const logs = (limit = 100) => get('/admin/logs?limit=' + limit)
export const deepseekBalance = () => get('/admin/deepseek-balance')
