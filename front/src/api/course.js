import { get } from './client.js'

export const health = () => get('/health')
export const domains = () => get('/domains')
export const courses = () => get('/courses')
export const notice = () => get('/notice')
export const index = (course) => get('/index' + (course ? '?course=' + encodeURIComponent(course) : ''))
