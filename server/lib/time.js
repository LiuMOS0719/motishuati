// 时间格式化 + DeepSeek 高峰判断
const pad = (n) => String(n).padStart(2, '0');

export function fmt(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const now = () => fmt(Date.now());

// 高峰（全价）：UTC 01:00-04:00 与 06:00-10:00，周一到周五，中国法定节假日除外
// 北京时间 = UTC+8 → 09:00-12:00、14:00-18:00
export function isPeak(d = new Date()) {
  const day = d.getUTCDay();             // 0=周日 6=周六
  if (day === 0 || day === 6) return false;   // 周末全天低谷
  const h = d.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}
