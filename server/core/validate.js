// 轻量参数校验：{ field: 'str' | 'int:1..100' | 'enum:a,b' | 'bool' }
export function validate(body, spec) {
  const out = {};
  for (const [key, rule] of Object.entries(spec)) {
    const raw = body[key];
    const [type, arg] = String(rule).split(':');
    if (raw === undefined || raw === null || raw === '') {
      if (key.startsWith('?')) continue;
      return { ok: false, message: `缺少参数 ${key}` };
    }
    if (type === 'str') {
      out[key] = String(raw);
    } else if (type === 'int') {
      const n = Number(raw);
      if (!Number.isInteger(n)) return { ok: false, message: `${key} 必须是整数` };
      if (arg) {
        const [lo, hi] = arg.split('..').map(Number);
        if (lo !== undefined && n < lo) return { ok: false, message: `${key} 不能小于 ${lo}` };
        if (hi !== undefined && !Number.isNaN(hi) && n > hi) return { ok: false, message: `${key} 不能大于 ${hi}` };
      }
      out[key] = n;
    } else if (type === 'bool') {
      out[key] = raw === true || raw === 'true' || raw === 1 || raw === '1';
    } else if (type === 'enum') {
      const list = String(arg).split(',');
      if (!list.includes(String(raw))) return { ok: false, message: `${key} 只能是 ${list.join(' / ')}` };
      out[key] = String(raw);
    } else {
      out[key] = raw;
    }
  }
  return { ok: true, value: out };
}
