// 题目格式：库里 options_json 是 [{k:'A',t:'...'}]，answer_json 是 ['C']
// 对外（旧前端）必须是 options:[字符串数组] + answer:[索引]，这里集中转换
export function decodeOptions(json) {
  let arr = [];
  try { arr = JSON.parse(json || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) return [];
  return arr.map((o, i) => (typeof o === 'string'
    ? { k: String.fromCharCode(65 + i), t: o }
    : { k: String(o.k || String.fromCharCode(65 + i)), t: String(o.t !== undefined ? o.t : '') }));
}

export function decodeAnswer(json) {
  let arr = [];
  try { arr = JSON.parse(json || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) return [];
  return arr.map((a) => (typeof a === 'number' ? String.fromCharCode(65 + a) : String(a).toUpperCase()));
}

export const toClientOptions = (objs) => objs.map(o => o.t);

export function toClientAnswer(ansLetters, objs) {
  const keys = objs.map(o => o.k);
  return ansLetters.map(l => keys.indexOf(l)).filter(i => i >= 0);
}

// 前端提交的位置索引（可能经过选项乱序）→ 真实选项字母
export function idxToKeys(chosen, optionOrder, objs) {
  const keys = objs.map(o => o.k);
  return (Array.isArray(chosen) ? chosen : []).map((i) => {
    const n = Number(i);
    const real = optionOrder ? optionOrder[n] : n;
    return keys[real] !== undefined ? keys[real] : null;
  }).filter(Boolean);
}

export function judge(chosen, optionOrder, optionsJson, answerJson) {
  const objs = decodeOptions(optionsJson);
  const got = idxToKeys(chosen, optionOrder, objs);
  const want = decodeAnswer(answerJson);
  const correct = got.length === want.length && got.length > 0 && got.every(k => want.includes(k));
  return { correct, answer: want, options: objs };
}
