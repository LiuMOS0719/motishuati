import { get, post, del } from './client.js'

export const state = (course) => get('/state' + (course ? '?course=' + course : ''))
export const saveState = (payload) => post('/state', payload)
export const list = (course, limit = 50) =>
  get(`/sessions?course=${course || 'ctfl'}&limit=${limit}`)
export const detail = (sid) => get('/sessions/' + sid)
export const create = (payload) => post('/sessions', payload)
export const answer = (sid, qid, chosen) => post(`/sessions/${sid}/items`, { qid, chosen })
export const finish = (sid, course) => post(`/sessions/${sid}/finish`, { course })
export const remove = (sid) => del('/sessions/' + sid)
export const weights = (course) => get('/weights?course=' + (course || 'ctfl'))
export const stats = (course) => get('/stats?course=' + (course || 'ctfl'))
export const leaderboard = (sort = 'rate') => get('/leaderboard?sort=' + sort)
