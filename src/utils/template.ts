import type { Template, Declaration } from '../types'

function stripHtml(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent ?? ''
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** テンプレート+宣言文 → 表示用HTML */
export function buildTemplateHTML(template: Template, declaration: Declaration): string {
  const { lines, insertAfterIndex } = template
  const decl = `<span class="tl-declaration">${escHtml(declaration.text)}</span>`
  let html = ''

  if (insertAfterIndex === -1) html += decl

  lines.forEach((lineHtml, i) => {
    html += `<span class="tl-line">${lineHtml || '&nbsp;'}</span>`
    if (i === insertAfterIndex) html += decl
  })

  if (insertAfterIndex >= lines.length) html += decl

  return html
}

/** テンプレート+宣言文 → クリップボード用プレーンテキスト */
export function buildPlainText(template: Template, declaration: Declaration): string {
  const { lines, insertAfterIndex } = template
  const parts: string[] = []

  if (insertAfterIndex === -1) parts.push(declaration.text)
  lines.forEach((lineHtml, i) => {
    parts.push(stripHtml(lineHtml))
    if (i === insertAfterIndex) parts.push(declaration.text)
  })
  if (insertAfterIndex >= lines.length) parts.push(declaration.text)

  return parts.join('\n')
}

export async function copyToClipboard(text: string): Promise<void> {
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
