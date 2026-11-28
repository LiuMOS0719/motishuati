// 单题权重：与阶段三 db/weight.py 同一份公式
// streak_correct>=3 → 100；streak_wrong>=2 → 0；否则 half-up((对+1)/(n+2)*100)
// JS 的 Math.round 对正数就是 half-up，与 Python Decimal ROUND_HALF_UP 一致
export function calcWeight(last5, streakCorrect = 0, streakWrong = 0) {
  const s = String(last5 || '');
  if (streakCorrect >= 3) return 100;
  if (streakWrong >= 2) return 0;
  const ones = (s.match(/1/g) || []).length;
  return Math.round(((ones + 1) / (s.length + 2)) * 100);
}

export function streaks(seq) {
  if (!seq.length) return [0, 0];
  const last = seq[seq.length - 1];
  let n = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i] !== last) break;
    n++;
  }
  return last === 1 ? [n, 0] : [0, n];
}

export function weightFromSeq(seq, window = 5) {
  const last5 = seq.slice(-window).join('');
  const [sc, sw] = streaks(seq);
  return { last5, streakCorrect: sc, streakWrong: sw, weight: calcWeight(last5, sc, sw) };
}

// 自测（进程启动时跑一次，与阶段三 6 个用例一致）
export function selfTest() {
  const cases = [
    ['111', 0, 0, 80], ['11', 0, 0, 75], ['11011', 0, 0, 71],
    ['1', 0, 0, 67], ['00111', 3, 0, 100], ['11000', 0, 2, 0],
  ];
  const bad = cases.filter(([l, sc, sw, exp]) => calcWeight(l, sc, sw) !== exp);
  if (bad.length) throw new Error('权重公式自测失败: ' + JSON.stringify(bad));
  return true;
}
