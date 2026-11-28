import { get, post } from './client.js'

export const models = () => get('/ai/models')
export const history = (qid, sidExt, limit = 50) => {
  const q = []
  if (qid) q.push('qid=' + encodeURIComponent(qid))
  if (sidExt) q.push('session_id=' + encodeURIComponent(sidExt))
  q.push('limit=' + limit)
  return get('/ai/history?' + q.join('&'))
}
export const ask = (payload) => post('/ask', payload, { timeout: 180000 })
export const review = (payload) => post('/review', payload, { timeout: 180000 })
