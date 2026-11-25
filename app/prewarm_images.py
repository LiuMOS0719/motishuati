#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""预生成所有配图题的 AI 读图描述（只跑一次，之后走缓存）"""
import sys, os
sys.path.insert(0, '/app')
import server

con = server.db()
rows = con.execute("SELECT id, image FROM questions WHERE image IS NOT NULL AND image != '' ORDER BY id").fetchall()
con.close()
print(f'配图题共 {len(rows)} 道', flush=True)
done = skip = fail = 0
for r in rows:
    qid, img = r['id'], r['image']
    if server.get_image_desc(qid):
        skip += 1
        print(f'  {qid} 已有缓存，跳过', flush=True)
        continue
    desc = server.describe_image(img)
    if desc:
        server.save_image_desc(qid, desc)
        done += 1
        print(f'  {qid} ✓ {len(desc)} 字：{desc[:60]}...', flush=True)
    else:
        fail += 1
        print(f'  {qid} ✗ 读图失败', flush=True)
print(f'\n完成：新生成 {done}，跳过 {skip}，失败 {fail}', flush=True)
