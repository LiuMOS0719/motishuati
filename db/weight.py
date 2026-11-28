#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨题 · 单题权重计算（阶段三）
与前端 home.js 的 qWeights() 完全同口径，供 import 与未来 Node 后端共用。

规则（任务单 4.6）：
    streak_correct >= 3      → 100
    否则 streak_wrong >= 2   → 0
    否则 ROUND_HALF_UP( (last5中1的个数 + 1) / (len(last5) + 2) * 100 )

**必须用 Decimal + ROUND_HALF_UP**：Python 的 round() 是银行家舍入（round(62.5)==62），
而 Node 的 Math.round(62.5)==63，两边不一致会让抽题概率整体漂移且极难发现。
"""
from decimal import Decimal, ROUND_HALF_UP


def calc_weight(last5, streak_correct=0, streak_wrong=0):
    """last5: '1'/'0' 组成的字符串（左起最早）；返回 0-100 的整数"""
    s = str(last5 or '')
    if streak_correct >= 3:
        return 100
    if streak_wrong >= 2:
        return 0
    v = Decimal(s.count('1') + 1) / Decimal(len(s) + 2) * Decimal(100)
    return int(v.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def streaks(seq):
    """从最近一次往回数连续同值的个数 → (streak_correct, streak_wrong)"""
    if not seq:
        return 0, 0
    last = seq[-1]
    n = 0
    for x in reversed(seq):
        if x != last:
            break
        n += 1
    return (n, 0) if last == 1 else (0, n)


def weight_from_seq(seq, window=5):
    """从完整作答序列（1/0 列表，时间升序）算出 (last5, streak_c, streak_w, weight)"""
    last5 = ''.join(str(x) for x in seq[-window:])
    sc, sw = streaks(seq)
    return last5, sc, sw, calc_weight(last5, sc, sw)


# ---------------- 任务单 4.6 的 6 个断言用例 ----------------
# 前 4 条只验证 Laplace 公式本身，人为把 streak 置 0（否则「3 次全对」会命中连对 3 次例外）
CASES = [
    ('111',   0, 0, 80, '3 次全对（Laplace）'),
    ('11',    0, 0, 75, '2 次全对（Laplace）'),
    ('11011', 0, 0, 71, '5 次里 4 对 1 错'),
    ('1',     0, 0, 67, '1 次全对'),
    ('00111', 3, 0, 100, '连对 3 次（前面有错）'),
    ('11000', 0, 2, 0,  '连错 2 次（前面有对）'),
]


def self_test():
    ok = True
    for last5, sc, sw, expect, desc in CASES:
        got = calc_weight(last5, sc, sw)
        flag = '✅' if got == expect else '❌'
        if got != expect:
            ok = False
        print('  %s %-24s last5=%-6s streak=(%d,%d) → %3d（期望 %3d）' % (
            flag, desc, last5, sc, sw, got, expect))
    return ok


if __name__ == '__main__':
    import sys
    print('权重公式自测：')
    if not self_test():
        print('\n❌ 有断言失败，禁止继续迁移')
        sys.exit(1)
    print('\n✅ 6 个用例全部通过')
