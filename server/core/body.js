// JSON body 解析（只处理 application/json，限 1MB）
const LIMIT = 1024 * 1024;

export function readJson(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('application/json')) {
      req.resume();
      return resolve({});
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMIT) {
        reject(Object.assign(new Error('body too large'), { status: 413, code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const v = JSON.parse(raw);
        resolve(v && typeof v === 'object' ? v : {});
      } catch {
        reject(Object.assign(new Error('invalid json'), { status: 400, code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}
