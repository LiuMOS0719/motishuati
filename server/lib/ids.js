// token 与场次 id
import crypto from 'node:crypto';

export const token = () => crypto.randomBytes(24).toString('hex');   // 48 字符
export const sessionId = () => 's' + Date.now();                      // 与旧格式一致
