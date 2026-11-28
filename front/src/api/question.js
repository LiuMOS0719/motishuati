import { get } from './client.js'

export const questions = (ids) =>
  get('/questions' + (ids && ids.length ? '?ids=' + ids.join(',') : ''))
export const figures = (ids) => get('/figures?ids=' + ids.join(','))
