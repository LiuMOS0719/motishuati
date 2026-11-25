import sqlite3, json
c = sqlite3.connect('/data/quiz.db'); c.row_factory = sqlite3.Row
for qid in ['A-33', 'B-31', 'D-23', 'D-22']:
    q = c.execute('SELECT stem, options_json, answer_json FROM questions WHERE id=?', (qid,)).fetchone()
    f = c.execute('SELECT kind, html FROM figures WHERE qid=?', (qid,)).fetchone()
    print('=' * 70)
    print(qid, '| 答案', q['answer_json'])
    print('--- 题干 ---')
    print(q['stem'])
    print('--- 选项 ---')
    for o in json.loads(q['options_json']):
        print('  ', o['k'], o['t'])
    print('--- figure ---')
    print(f['html'] if f else '（无）')
