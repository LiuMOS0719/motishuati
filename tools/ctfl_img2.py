#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新生成题目配图：只裁剪真正有图的部分（按文档流把位图绑定到所属题目）"""
import pymupdf, glob, re, json, os

PDFDIR = '/vol1/@appdata/trim.hermes/hermes/cache/documents'
DATA = '/vol2/1000/Hermes/ctfl-quiz/data'
PAD = 8

MAP = {t: sorted(glob.glob(f'{PDFDIR}/*模拟卷{t}问题*.pdf'))[0] for t in 'ABCD'}


def find_images(doc):
    """返回 [(题号, 页号, bbox)]，按文档流绑定：图归属它前面最近的题号"""
    out = []
    cur = None
    for pno in range(len(doc)):
        page = doc[pno]
        blocks = sorted(page.get_text('dict')['blocks'], key=lambda b: (b['bbox'][1], b['bbox'][0]))
        for b in blocks:
            if b['type'] == 0:
                for line in b['lines']:
                    txt = ''.join(s['text'] for s in line['spans']).strip()
                    m = re.match(r'^(\d{1,2})\.\s', txt)
                    if m:
                        cur = m.group(1)
            else:
                x0, y0, x1, y1 = b['bbox']
                if y0 > 80 and (x1 - x0) > 150 and (y1 - y0) > 40:
                    out.append((cur, pno, (x0, y0, x1, y1)))
    return out


def main():
    os.makedirs(f'{DATA}/img', exist_ok=True)
    # 清掉旧图
    for f in glob.glob(f'{DATA}/img/*.png'):
        os.remove(f)
    qs = json.load(open(f'{DATA}/questions.json'))
    for q in qs:
        q['image'] = ''
    idx = {q['id']: q for q in qs}

    made = []
    for tag in 'ABCD':
        doc = pymupdf.open(MAP[tag])
        for no, pno, bbox in find_images(doc):
            if no is None:
                continue
            qid = f'{tag}-{no}'
            q = idx.get(qid)
            if not q:
                print('题库里没有', qid)
                continue
            page = doc[pno]
            r = pymupdf.Rect(*bbox)
            r = pymupdf.Rect(r.x0 - PAD, r.y0 - PAD, r.x1 + PAD, r.y1 + PAD)
            r = r & page.rect
            pix = page.get_pixmap(clip=r, dpi=200)
            fn = f'{qid}.png'
            pix.save(f'{DATA}/img/{fn}')
            q['image'] = fn
            made.append((qid, pno + 1, round(r.width), round(r.height), pix.width, pix.height))

    json.dump(qs, open(f'{DATA}/questions.json', 'w'), ensure_ascii=False, indent=1)
    for m in made:
        print(f'{m[0]}: 第{m[1]}页 裁剪 {m[2]}x{m[3]}pt → {m[4]}x{m[5]}px')
    print('共生成', len(made), '张')
    empty = [q['id'] for q in qs if q['image'] == '']
    print('无图题数:', len(empty))


if __name__ == '__main__':
    main()
