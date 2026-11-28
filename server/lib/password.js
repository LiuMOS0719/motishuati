// PBKDF2-HMAC-SHA256，必须异步；KEYLEN=32（64 hex），与存量账号一致
import crypto from 'node:crypto';

const ITER = 200000;
const DIGEST = 'sha256';
const KEYLEN = 32;   // 32 字节 → 64 hex。改成 64 会让现有 6 个账号全部无法登录

export function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function hash(pw, saltHex) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(String(pw), Buffer.from(saltHex, 'hex'), ITER, KEYLEN, DIGEST, (err, dk) => {
      if (err) return reject(err);
      resolve(dk.toString('hex'));
    });
  });
}

export async function verify(pw, saltHex, passHash) {
  if (!passHash || passHash.length !== 64 || !saltHex || saltHex.length !== 32) return false;
  const got = await hash(pw, saltHex);
  const a = Buffer.from(got, 'hex');
  const b = Buffer.from(passHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
