import { get, post, del } from './client.js'

export const register = (username, password) => post('/auth/register', { username, password })
export const login = (username, password) => post('/auth/login', { username, password })
export const logout = () => post('/auth/logout', {})
export const me = () => get('/auth/me')
export const changePassword = (oldPassword, newPassword) =>
  post('/auth/password', { old_password: oldPassword, new_password: newPassword })
export const sessions = () => get('/auth/sessions')
export const kickSession = (tail) => del('/auth/sessions/' + tail)
