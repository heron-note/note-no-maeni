import type { Template, Declaration } from '../types'

function stripHtml(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  d.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent ?? ''
    a.replaceWith(text && text !== href ? `${text}（${href}）` : href)
  })
  return d.textContent ?? ''
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const DECL_TITLE = '『note休もっ化計画』を発動します。'

/** テンプレート+宣言文 → 表示用HTML */
export function buildTemplateHTML(template: Template, declaration: Declaration): string {
  const { lines, insertAfterIndex } = template
  const decl =
    `<span class="tl-declaration">${escHtml(DECL_TITLE)}</span>` +
    `<span class="tl-line">&nbsp;</span><span class="tl-line">&nbsp;</span>` +
    `<span class="tl-declaration-body">${escHtml(declaration.text)}</span>`
  let html = ''

  if (insertAfterIndex === -1) html += decl

  lines.forEach((lineHtml, i) => {
    html += `<span class="tl-line">${lineHtml || '&nbsp;'}</span>`
    if (i === insertAfterIndex) html += decl
  })

  if (insertAfterIndex >= lines.length) html += decl

  return html
}

function declBlock(declaration: Declaration): string {
  return `\n## ${DECL_TITLE}\n\n${declaration.text}\n\n`
}

/** テンプレート+宣言文 → クリップボード用プレーンテキスト */
export function buildPlainText(template: Template, declaration: Declaration): string {
  const { lines, insertAfterIndex } = template
  const parts: string[] = []

  if (insertAfterIndex === -1) parts.push(declBlock(declaration))
  lines.forEach((lineHtml, i) => {
    parts.push(stripHtml(lineHtml))
    if (i === insertAfterIndex) parts.push(declBlock(declaration))
  })
  if (insertAfterIndex >= lines.length) parts.push(declBlock(declaration))

  return parts.join('\n')
}

/** テンプレート+宣言文 → HTML clipboard 用（リンク保持） */
export function buildHtmlText(template: Template, declaration: Declaration): string {
  const { lines, insertAfterIndex } = template
  const decl =
    `<h2>${escHtml(DECL_TITLE)}</h2>` +
    `<p>${escHtml(declaration.text)}</p>` +
    `<p>&nbsp;</p>`
  const parts: string[] = []

  const lineToTag = (lineHtml: string) => {
    const hm = lineHtml.match(/^(#{1,6}) (.*)/)
    if (hm) return `<h${hm[1].length}>${hm[2] || '&nbsp;'}</h${hm[1].length}>`
    if (lineHtml.startsWith('> ')) return `<blockquote><p>${lineHtml.slice(2)}</p></blockquote>`
    return `<p>${lineHtml || '&nbsp;'}</p>`
  }

  if (insertAfterIndex === -1) parts.push(decl)
  let i = 0
  while (i < lines.length) {
    const lineHtml = lines[i]
    if (lineHtml === '```') {
      const openIdx = i
      const codeLines: string[] = []
      i++
      while (i < lines.length && lines[i] !== '```') { codeLines.push(lines[i]); i++ }
      parts.push(`<pre><code>${codeLines.join('\n')}</code></pre>`)
      if (openIdx === insertAfterIndex) parts.push(decl)
      i++
    } else if (lineHtml === '---') {
      parts.push('<hr>')
      if (i === insertAfterIndex) parts.push(decl)
      i++
    } else if (lineHtml.startsWith('- ')) {
      const startIdx = i
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(`<li>${lines[i].slice(2)}</li>`); i++ }
      parts.push(`<ul>${items.join('')}</ul>`)
      if (insertAfterIndex >= startIdx && insertAfterIndex < i) parts.push(decl)
    } else if (/^\d+\. /.test(lineHtml)) {
      const startIdx = i
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(`<li>${lines[i].replace(/^\d+\. /, '')}</li>`); i++ }
      parts.push(`<ol>${items.join('')}</ol>`)
      if (insertAfterIndex >= startIdx && insertAfterIndex < i) parts.push(decl)
    } else {
      parts.push(lineToTag(lineHtml))
      if (i === insertAfterIndex) parts.push(decl)
      i++
    }
  }
  if (insertAfterIndex >= lines.length) parts.push(decl)

  return parts.join('')
}

export async function copyToClipboard(text: string, html?: string): Promise<void> {
  if (html && (navigator.clipboard as any)?.write) {
    try {
      await (navigator.clipboard as any).write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })
      ])
      return
    } catch {}
  }
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  const ta = document.createElement('textarea')
  ta.value = text
  Object.assign(ta.style, { position: 'fixed', opacity: '0' })
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}
