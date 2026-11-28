import { get, post, patch } from './client.js'

export const submit = (qid, kind, note, course) => post('/feedback', { qid, kind, note, course })
export const status = (qid) => get('/feedback/status?qid=' + encodeURIComponent(qid))
export const notes = (status = 'open') => get('/notes?status=' + status)
export const addNote = (payload) => post('/notes', payload)
export const setNote = (id, status) => patch('/notes/' + id, { status })
