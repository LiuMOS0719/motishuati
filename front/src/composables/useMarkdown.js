// 极简 markdown：粗体、斜体、行内代码、标题、列表、引用、分隔线
// 只渲染 AI 回复用得到的语法，不引第三方解析器
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
}

export function renderMarkdown(src) {
  const text = esc(String(src || ''))
  const lines = text.split('\n')
  const out = []
  let listOpen = false
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false } }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) { closeList(); out.push('<div class="md-gap"></div>'); continue }

    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { closeList(); out.push(`<div class="md-h md-h${h[1].length}">${inline(h[2])}</div>`); continue }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeList(); out.push('<hr class="md-hr">'); continue }

    const li = line.match(/^\s*[-*+]\s+(.*)$/) || line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (li) {
      const content = li[2] !== undefined ? li[2] : li[1]
      if (!listOpen) { out.push('<ul class="md-ul">'); listOpen = true }
      out.push(`<li>${inline(content)}</li>`)
      continue
    }

    const q = line.match(/^>\s?(.*)$/)
    if (q) { closeList(); out.push(`<blockquote class="md-quote">${inline(q[1])}</blockquote>`); continue }

    closeList()
    out.push(`<div class="md-p">${inline(line)}</div>`)
  }
  closeList()
  return out.join('')
}
