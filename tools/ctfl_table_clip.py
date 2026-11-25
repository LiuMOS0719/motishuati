#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为判定表/矩阵类题目裁出表格区域（跨页的纵向拼接成一张）"""
import pymupdf, glob, json, os
from PIL import Image

PDFDIR = '/vol1/@appdata/trim.hermes/hermes/cache/documents'
DATA = '/vol2/1000/Hermes/ctfl-quiz/data'
MAP = {t: sorted(glob.glob(f'{PDFDIR}/*模拟卷{t}问题*.pdf'))[0] for t in 'ABCD'}
DPI = 200

# qid -> [(卷, 0-based页, (x0,y0,x1,y1)), ...]
CLIPS = {
    'A-22': [('A', 13, (52, 378, 388, 484))],
    'B-22': [('B', 12, (52, 286, 472, 488))],
    'C-22': [('C', 12, (88, 674, 382, 730)), ('C', 13, (88, 86, 382, 248))],
    'D-22': [('D', 13, (118, 316, 478, 470))],
    'D-23': [('D', 14, (52, 136, 488, 320))],
    'D-32': [('D', 17, (90, 86, 488, 242))],
}


def main():
    qs = json.load(open(f'{DATA}/questions.json'))
    idx = {q['id']: q for q in qs}
    docs = {}
    for qid, parts in CLIPS.items():
        q = idx.get(qid)
        if not q:
            print('题库无此题', qid)
            continue
        imgs = []
        for tag, pno, box in parts:
            if tag not in docs:
                docs[tag] = pymupdf.open(MAP[tag])
            page = docs[tag][pno]
            pix = page.get_pixmap(clip=pymupdf.Rect(*box), dpi=DPI)
            tmp = f'/tmp/_clip_{qid}_{pno}.png'
            pix.save(tmp)
            imgs.append(Image.open(tmp))
        if len(imgs) == 1:
            out = imgs[0]
        else:
            w = max(i.width for i in imgs)
            h = sum(i.height for i in imgs) + 8 * (len(imgs) - 1)
            out = Image.new('RGB', (w, h), 'white')
            y = 0
            for im in imgs:
                out.paste(im, (0, y))
                y += im.height + 8
        fn = f'{qid}.png'
        out.save(f'{DATA}/img/{fn}')
        q['image'] = fn
        print(f'{qid}: {len(parts)} 段 -> img/{fn} {out.width}x{out.height}')
    json.dump(qs, open(f'{DATA}/questions.json', 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
