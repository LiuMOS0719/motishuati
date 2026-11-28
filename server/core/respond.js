// 统一输出
export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export const ok = (res, data = {}) => sendJson(res, 200, { ok: true, ...data });
export const fail = (res, status, code, message) =>
  sendJson(res, status, { ok: false, error: { code, message } });

export const codes = {
  BAD_PARAM: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD: 405,
  CONFLICT: 409,
  TOO_MANY: 429,
  NO_TOKENS: 402,
  UPSTREAM: 502,
};
