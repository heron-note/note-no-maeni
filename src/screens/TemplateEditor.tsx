import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML } from '../utils/template'
import { Toast } from '../components/Toast'
import { useSlideBack } from '../hooks/useSlideBack'

// ===== HTML サニタイズ =====
const INLINE_TAGS = new Set(['strong','em','b','i','u','s','strike','code'])
const BLOCK_TAGS = new Set([
  'p','div','h1','h2','h3','h4','h5','h6',
  'li','blockquote','pre','section','article',
  'header','footer','figure','figcaption',
  'ul','ol','main','aside','address','dt','dd',
])

function sanitizeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const inner = Array.from(el.childNodes).map(sanitizeInline).join('')
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    if (href && !href.startsWith('javascript:')) {
      const fullHref = href.startsWith('//') ? `https:${href}` : href
      return `<a href="${fullHref.replace(/"/g, '&quot;')}">${inner}</a>`
    }
    return inner
  }
  return INLINE_TAGS.has(tag) ? `<${tag}>${inner}</${tag}>` : inner
}

function htmlToLines(html: string): string[] {
  const root = document.createElement('div')
  root.innerHTML = html
  const result: string[] = []

  function walkInner(el: Element, out: string[]) {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const ce = child as Element
        const tag = ce.tagName.toLowerCase()
        if (tag === 'br') { if (out.length === 0) out.push(''); else out[out.length - 1] += '<br>'; continue }
        if (tag === 'blockquote') {
          const text = (ce.textContent ?? '').trim()
          if (text) {
            text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => out.push(`> ${l}`))
          }
          continue
        }
        if (BLOCK_TAGS.has(tag)) {
          const sub: string[] = []
          walkInner(ce, sub)
          if (sub.length > 0) out.push(...sub)
          else out.push('')
          continue
        }
      }
      const content = sanitizeInline(child)
      if (!content.trim()) continue
      if (out.length === 0) out.push(content)
      else out[out.length - 1] += content
    }
  }

  function walkBlock(el: Element) {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const ce = child as Element
        const tag = ce.tagName.toLowerCase()
        if (tag === 'br') { result.push(''); continue }
        if (tag === 'hr') { result.push('---'); continue }
        if (tag === 'ul' || tag === 'ol') {
          let idx = 1
          for (const child2 of Array.from(ce.childNodes)) {
            if (child2.nodeType !== Node.ELEMENT_NODE) continue
            const li = child2 as Element
            if (li.tagName.toLowerCase() !== 'li') continue
            const sub: string[] = []
            walkInner(li, sub)
            const text = sub.join('')
            if (text.trim()) result.push(tag === 'ul' ? `- ${text}` : `${idx}. ${text}`)
            idx++
          }
          continue
        }
        if (tag === 'blockquote') {
          const text = (ce.textContent ?? '').trim()
          if (text) {
            text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => result.push(`> ${l}`))
          }
          continue
        }
        if (/^h[1-6]$/.test(tag)) {
          const inline = Array.from(ce.childNodes).map(c => sanitizeInline(c)).join('')
          if (inline.trim()) result.push(`${'#'.repeat(Number(tag[1]))} ${inline}`)
          continue
        }
        if (tag === 'pre') {
          const code = (ce.textContent ?? '').replace(/\n$/, '')
          result.push('```')
          code.split('\n').forEach(line => result.push(line))
          result.push('```')
          continue
        }
        if (BLOCK_TAGS.has(tag)) {
          const sub: string[] = []
          walkInner(ce, sub)
          if (sub.length > 0) result.push(...sub)
          else result.push('')
          continue
        }
      }
      const content = sanitizeInline(child)
      if (!content.trim()) continue
      if (result.length === 0) result.push(content)
      else result[result.length - 1] += content
    }
  }

  walkBlock(root)

  return result.length > 0 ? result : ['']
}

// 保存済み lines → contenteditable 用 HTML（blockquote・pre を復元）
function linesToHtml(lines: string[]): string {
  const parts: string[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l === '```') {
      const codeLines: string[] = []
      i++
      while (i < lines.length && lines[i] !== '```') { codeLines.push(lines[i]); i++ }
      parts.push(`<pre>${codeLines.join('\n')}</pre>`)
      i++ // closing ```
    } else if (l === '---') {
      parts.push('<hr>')
      i++
    } else if (l.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(`<li>${lines[i].slice(2)}</li>`); i++ }
      parts.push(`<ul>${items.join('')}</ul>`)
    } else if (/^\d+\. /.test(l)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(`<li>${lines[i].replace(/^\d+\. /, '')}</li>`); i++ }
      parts.push(`<ol>${items.join('')}</ol>`)
    } else if (/^#{1,6} /.test(l)) {
      const m = l.match(/^(#{1,6}) (.*)/)!
      parts.push(`<h${m[1].length}>${m[2] || '<br>'}</h${m[1].length}>`)
      i++
    } else if (l.startsWith('> ')) {
      parts.push(`<blockquote><p>${l.slice(2)}</p></blockquote>`)
      i++
    } else {
      parts.push(`<div>${l || '<br>'}</div>`)
      i++
    }
  }
  return parts.join('')
}

export function TemplateEditor() {
  const goTo = useAppStore(s => s.goTo)
  const editorRef = useRef<HTMLDivElement>(null)
  const { closing, handleBack } = useSlideBack(() => goTo('home'))

  const [lines, setLines] = useState<string[]>(() => {
    const t = storage.loadTemplate()
    return t?.lines.length ? t.lines : ['']
  })
  const [insertIdx, setInsertIdx] = useState<number>(() => {
    const t = storage.loadTemplate()
    return t?.insertAfterIndex ?? -1
  })
  const [toast, setToast] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [pasteMode, setPasteMode] = useState<'html' | 'text' | null>(null)

  // 保存済みテンプレートを初期表示（再レンダで上書きしない）
  useEffect(() => {
    if (editorRef.current && lines.join('').trim()) {
      editorRef.current.innerHTML = linesToHtml(lines)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ペースト時にクリップボードの HTML を直接解析（ブラウザのDOM変換を経由しない）
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    setPasteMode(html ? 'html' : 'text')
    const src = html || `<div>${text.split(/\r?\n/).map(l => `<div>${l || '<br>'}</div>`).join('')}</div>`
    const parsed = htmlToLines(src)
    setLines(parsed)
    if (editorRef.current) editorRef.current.innerHTML = linesToHtml(parsed)
  }, [])

  // contenteditable の現在の内容を解析して lines を更新
  const refreshLines = useCallback(() => {
    if (!editorRef.current) return
    const parsed = htmlToLines(editorRef.current.innerHTML)
    setLines(parsed)
    return parsed
  }, [])

  const handleSave = () => {
    const current = refreshLines() ?? lines
    const clampedIdx = Math.min(Math.max(insertIdx, -1), current.length - 1)
    storage.saveTemplate({ lines: current, insertAfterIndex: clampedIdx })
    setToast('保存しました')
    setTimeout(() => goTo('home'), 900)
  }

  const hasContent = lines.length > 0 && lines[0] !== ''

  const previewHTML = showPreview
    ? buildTemplateHTML({ lines, insertAfterIndex: insertIdx }, { id: 'preview', text: '今日は休む。それもひとつの、正しい選択。' })
    : null

  return (
    <div className={`screen-scroll${closing ? ' screen-slide-out' : ''}`}>
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
          <h2 className="subscreen-title">テンプレート編集</h2>
        </div>
        <p className="hint">noteの記事をそのまま貼り付け → 「行を解析」を押してください。リンクはURLに変換されます。</p>
      </div>

      <div
        ref={editorRef}
        className="template-richtext"
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        data-placeholder="ここにnoteのテンプレートをペーストしてください"
      />

      {pasteMode && (
        <p className={`hint paste-mode-hint${pasteMode === 'text' ? ' paste-mode-warn' : ''}`}>
          {pasteMode === 'html'
            ? '✓ HTML形式で取得（リンク保持）'
            : '⚠ テキスト形式のみ（リンク情報なし）— ブラウザ版noteからコピーするとリンクが保持されます'}
        </p>
      )}

      <button className="btn-secondary wide" onClick={refreshLines}>
        行を解析（貼り付け後に押してください）
      </button>

      {hasContent && (
        <div className="insert-position-block">
          <p className="label">宣言文の挿入位置</p>
          <div className="insert-position-list">
            <button
              className={`insert-pos-item${insertIdx === -1 ? ' active' : ''}`}
              onClick={() => setInsertIdx(-1)}
            >
              <span className="insert-pos-dot" />
              <span className="insert-pos-label">テンプレートの先頭</span>
            </button>
            {lines.map((line, i) => (
              <button
                key={i}
                className={`insert-pos-item${insertIdx === i ? ' active' : ''}`}
                onClick={() => setInsertIdx(i)}
              >
                <span className="insert-pos-dot" />
                <span className="insert-pos-label">
                  {i + 1}行目の後：{line.replace(/<[^>]+>/g, '').slice(0, 24) || '（空行）'}
                  {line.replace(/<[^>]+>/g, '').length > 24 ? '…' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="btn-secondary wide" onClick={() => { refreshLines(); setShowPreview(v => !v) }}>
        {showPreview ? 'プレビューを閉じる' : 'プレビューを確認'}
      </button>

      {showPreview && previewHTML && (
        <div className="preview-section">
          <div className="template-preview" dangerouslySetInnerHTML={{ __html: previewHTML }} />
        </div>
      )}

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
