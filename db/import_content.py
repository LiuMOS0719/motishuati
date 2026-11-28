#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨题 · 内容层导入（阶段一）
从 data/{banks,figures,questions}.json 导入 MariaDB moti 库，幂等可重跑。

用法：
    PYTHONPATH=/tmp/pym python3 db/import_content.py [--dry-run]

约定（见任务单第 3、4 节）：
- 题干/解析里的 {{FIG}} 统一替换成 {{FIG:ctfl.<题号>}}（该题在 figures.json 里有图时）
- stem_plain 去标记纯文本，供搜索与 AI 相关性预检
- 关系表表达 chapter / papers / no / is_extra，questions 表不再保留这些列
- 多卷题的卷内题号优先取 refs（如 B-10 的 refs 写 C-9 → C 卷题号 9）
"""
import json, os, re, sys, datetime

DATA = '/vol2/1000/Hermes/moti/data'
DB = dict(host='127.0.0.1', port=3306, user='moti_app',
          password='MotiApp#2026-x7Kq9', database='moti', charset='utf8mb4')
COURSE = 'ctfl'
DRY = '--dry-run' in sys.argv
NOW = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

FIG_RE = re.compile(r'\{\{FIG(?::([\w.\-]+))?\}\}')


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def chapter_of(q):
    if q.get('chapter'):
        return str(q['chapter'])
    digits = ''.join(c for c in (q.get('lo') or '') if c.isdigit())
    return digits[0] if digits else '?'


def make_plain(s):
    """把 Markdown/LaTeX 源码压成可搜索纯文本"""
    if not s:
        return ''
    t = FIG_RE.sub(' ', s)                    # 图表占位整体去掉
    t = re.sub(r'\$\$(.+?)\$\$', r'\1', t, flags=re.S)
    t = re.sub(r'\$(.+?)\$', r'\1', t, flags=re.S)
    t = re.sub(r'!\[[^\]]*\]\([^)]*\)', ' ', t)
    t = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', t)
    t = re.sub(r'[`*_>#]+', '', t)
    t = re.sub(r'^\s*[-+]\s+', '', t, flags=re.M)
    t = re.sub(r'^\s*\d+\.\s+', '', t, flags=re.M)
    t = re.sub(r'\\(frac|text|times|div|cdot|sqrt|approx|leq|geq|neq)\b', ' ', t)
    t = re.sub(r'[{}\\]+', ' ', t)
    t = re.sub(r'[ \t\u3000]+', ' ', t)
    return t.strip()


def ref_nos(q):
    """refs=['B-10','C-9'] → {'B':'10','C':'9'}"""
    out = {}
    for r in (q.get('refs') or []):
        if '-' in r:
            p, n = r.split('-', 1)
            out[p.strip().upper()] = n.strip()
    return out


def main():
    banks = load('banks.json')
    bank = banks[0]
    qs = load('questions.json')
    figs = load('figures.json')

    problems = {'no_chapter': [], 'fig_missing': [], 'no_paper': [], 'multi_paper': [], 'dup_no': []}
    fig_ids = set(figs)

    rows = {'domains': [('istqb', '软件测试', 0)],
            'courses': [(COURSE, 'istqb', bank['name'], bank.get('short'), bank.get('subtitle'),
                         None, bank.get('ai_context'), bank.get('review_context'),
                         bank.get('copyright'), bank.get('copyright_note'), bank.get('sort') or 0)],
            'nodes': [(f"{COURSE}.ch{c['key']}", COURSE, None, str(c['key']), c['full'], 1, i)
                      for i, c in enumerate(bank.get('chapters') or [])],
            'papers': [(p['key'], COURSE, p['label'],
                        'extra' if p['key'] == 'EXTRA' else 'mock', None,
                        ' '.join(x for x in [p.get('doc'), p.get('ver')] if x) or None, 0, i)
                       for i, p in enumerate(bank.get('papers') or [])],
            'figs': [(COURSE, f"{COURSE}.{k}", v.get('kind'), v.get('html'), None, None, '', NOW, NOW)
                     for k, v in figs.items()],
            'qs': [], 'qsyl': [], 'qpaper': []}

    for idx, q in enumerate(qs):
        qid = q['id']
        has_fig = qid in fig_ids
        stem = q.get('stem') or ''
        expl = q.get('explain') or ''
        if has_fig:
            stem = FIG_RE.sub('{{FIG:%s.%s}}' % (COURSE, qid), stem)
            expl = FIG_RE.sub('{{FIG:%s.%s}}' % (COURSE, qid), expl)
        elif FIG_RE.search(stem) or FIG_RE.search(expl):
            problems['fig_missing'].append(qid)

        chap = chapter_of(q)
        if chap == '?':
            problems['no_chapter'].append(qid)
        rows['qsyl'].append((COURSE, qid, f'{COURSE}.ch{chap}'))

        papers = [p.strip().upper() for p in (q.get('papers') or '').split(',') if p.strip()]
        if not papers:
            problems['no_paper'].append(qid)
        nos = ref_nos(q)
        if len(papers) > 1:
            problems['multi_paper'].append((qid, papers, q.get('no'), nos))
        is_extra = int(q.get('is_extra') or 0)
        for p in papers:
            # 附加题在源数据里挂在 A 卷下（is_extra=1），关系表里要挂到独立的 EXTRA 卷，
            # 否则 A 卷会混入 26 道附加题、EXTRA 卷空着
            paper_id = 'EXTRA' if (is_extra == 1 and p == 'A') else p
            no = nos.get(p) or str(q.get('no') or '')
            rows['qpaper'].append((COURSE, qid, paper_id, no, is_extra))

        rows['qs'].append((COURSE, qid, stem, make_plain(stem),
                           json.dumps(q.get('options') or [], ensure_ascii=False),
                           json.dumps(q.get('answer') or [], ensure_ascii=False),
                           expl, q.get('lo'), q.get('k_level'), q.get('pts'),
                           q.get('stem_hash'), idx))

    # 卷内题号重复检查（同一 paper+no 出现两次）
    seen = {}
    for _, qid, p, no, _x in rows['qpaper']:
        k = (p, no)
        if k in seen:
            problems['dup_no'].append((p, no, seen[k], qid))
        seen[k] = qid

    print('=== 待导入 ===')
    print('  domains %d / courses %d / nodes %d / papers %d' % (
        len(rows['domains']), len(rows['courses']), len(rows['nodes']), len(rows['papers'])))
    print('  figures %d / questions %d / q_syllabus %d / q_papers %d' % (
        len(rows['figs']), len(rows['qs']), len(rows['qsyl']), len(rows['qpaper'])))

    if problems['fig_missing']:
        print('  ⚠ 占位符找不到图:', problems['fig_missing'])
    if problems['no_chapter']:
        print('  ⚠ 无法判断章节:', problems['no_chapter'])
    if problems['multi_paper']:
        print('  多卷题（题号取自 refs）:')
        for x in problems['multi_paper']:
            print('   ', x)

    if DRY:
        print('\n(dry-run，未写库)')
        return

    import pymysql
    con = pymysql.connect(**DB, autocommit=False)
    try:
        with con.cursor() as cur:
            # 幂等策略：
            #   定义层（domains/courses/nodes/papers）用 UPSERT —— 它们被 quiz_sessions 等下游表引用，
            #   DELETE 会触发外键错误，也不该在重导题库时清掉
            #   题目层（questions/figures/两张关系表）全量替换
            for t in ['question_syllabus', 'question_papers', 'image_desc', 'questions', 'figures']:
                cur.execute('DELETE FROM %s' % t)
            cur.executemany('''INSERT INTO domains(id,name,sort) VALUES(%s,%s,%s)
                ON DUPLICATE KEY UPDATE name=VALUES(name), sort=VALUES(sort)''', rows['domains'])
            cur.executemany('''INSERT INTO courses(id,domain_id,name,short,subtitle,syllabus_doc,
                               ai_context,review_context,copyright,copyright_note,sort)
                               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                               ON DUPLICATE KEY UPDATE domain_id=VALUES(domain_id), name=VALUES(name),
                               short=VALUES(short), subtitle=VALUES(subtitle), ai_context=VALUES(ai_context),
                               review_context=VALUES(review_context), copyright=VALUES(copyright),
                               copyright_note=VALUES(copyright_note), sort=VALUES(sort)''', rows['courses'])
            cur.executemany('''INSERT INTO syllabus_nodes(id,course_id,parent_id,code,name,level,sort)
                               VALUES(%s,%s,%s,%s,%s,%s,%s)
                               ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), code=VALUES(code),
                               name=VALUES(name), level=VALUES(level), sort=VALUES(sort)''', rows['nodes'])
            cur.executemany('''INSERT INTO papers(id,course_id,name,kind,year,source,qcount,sort)
                               VALUES(%s,%s,%s,%s,%s,%s,%s,%s)
                               ON DUPLICATE KEY UPDATE name=VALUES(name), kind=VALUES(kind),
                               year=VALUES(year), source=VALUES(source), sort=VALUES(sort)''', rows['papers'])
            cur.executemany('''INSERT INTO figures(course_id,id,kind,html,src,src_kind,title,created_at,updated_at)
                               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''', rows['figs'])
            cur.executemany('''INSERT INTO questions(course_id,id,stem,stem_plain,options_json,answer_json,
                               `explain`,lo,k_level,pts,stem_hash,sort)
                               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', rows['qs'])
            cur.executemany('''INSERT INTO question_syllabus(course_id,qid,node_id) VALUES(%s,%s,%s)''',
                            rows['qsyl'])
            cur.executemany('''INSERT INTO question_papers(course_id,qid,paper_id,no,is_extra)
                               VALUES(%s,%s,%s,%s,%s)''', rows['qpaper'])
            # 回填每卷题数
            cur.execute('''UPDATE papers p SET qcount=(
                             SELECT COUNT(*) FROM question_papers qp WHERE qp.paper_id=p.id)''')
        con.commit()
        print('\n✅ 导入完成')
    except Exception as e:
        con.rollback()
        print('\n❌ 失败，已回滚:', e)
        raise
    finally:
        con.close()


if __name__ == '__main__':
    main()
