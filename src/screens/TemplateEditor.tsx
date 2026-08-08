import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML } from '../utils/template'
import { REST_DECLARATIONS } from '../data/declarations'
import { Toast } from '../components/Toast'

// ===== HTML サニタイズ =====
const INLINE_TAGS = new Set(['strong','em','b','i','u','s','strike','code'])

// note.com が使うブロック要素を網羅
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
    if (href.startsWith('http') || href.startsWith('/')) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    }
    return inner
  }
  return INLINE_TAGS.has(tag) ? `<${tag}>${inner}</${tag}>` : inner
}

function parseHtmlToLines(html: string): string[] {
  const root = document.createElement('div')
  root.innerHTML = html
  const result: string[] = []

  function walk(el: Element) {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const ce = child as Element
        const tag = ce.tagName.toLowerCase()
        if (tag === 'br') { result.push(''); continue }
        if (BLOCK_TAGS.has(tag)) {
          // ブロック要素：再帰的に内容を取り出して1行として追加
          const innerResult: string[] = []
          function walkInner(e: Element) {
            for (const c of Array.from(e.childNodes)) {
              if (c.nodeType === Node.ELEMENT_NODE) {
                const ce2 = c as Element
                const t = ce2.tagName.toLowerCase()
                if (t === 'br') { innerResult.push(''); return }
                if (BLOCK_TAGS.has(t)) {
                  const txt = Array.from(ce2.childNodes).map(sanitizeInline).join('').trim()
                  if (txt) innerResult.push(txt)
                  else walkInner(ce2)
                  return
                }
              }
              const txt = sanitizeInline(c)
              if (!txt.trim()) continue
              if (innerResult.length === 0) innerResult.push(txt)
              else innerResult[innerResult.length - 1] += txt
            }
          }
          walkInner(ce)
          if (innerResult.length > 0) result.push(...innerResult)
          else {
            const content = Array.from(ce.childNodes).map(sanitizeInline).join('').trim()
            if (content) result.push(content)
          }
          continue
        }
      }
      const content = sanitizeInline(child)
      if (!content.trim()) continue
      if (result.length === 0) result.push(content)
      else result[result.length - 1] += content
    }
  }

  walk(root)
  // 連続する空行を1つにまとめ、前後の空行を除去
  const cleaned = result
    .reduce<string[]>((acc, l) => {
      if (l === '' && acc[acc.length - 1] === '') return acc
      return [...acc, l]
    }, [])
    .filter((l, i, arr) => !(l === '' && (i === 0 || i === arr.length - 1)))
  return cleaned.length > 0 ? cleaned : ['']
}

// Selection API を使って安全にHTMLを挿入
function insertHtmlAtCursor(html: string) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const frag = document.createRange().createContextualFragment(html)
  const last = frag.lastChild
  range.insertNode(frag)
  if (last) {
    range.setStartAfter(last)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

export function TemplateEditor() {
  const goTo = useAppStore(s => s.goTo)
  const editorRef = useRef<HTMLDivElement>(null)

  const savedLines = storage.loadTemplate()?.lines ?? ['']
  const [insertIdx, setInsertIdx] = useState<number>(
    () => storage.loadTemplate()?.insertAfterIndex ?? -1
  )
  const [lineCount, setLineCount] = useState(savedLines.length)
  const [toast, setToast] = useState<string | null>(null)

  // 初期 HTML をセット（再レンダで上書きしない）
  useEffect(() => {
    if (editorRef.current && savedLines.join('')) {
      editorRef.current.innerHTML = savedLines
        .map(l => `<div>${l || '<br>'}</div>`)
        .join('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInput = useCallback(() => {
    if (!editorRef.current) return
    // 行数だけ更新（挿入位置セレクタ用）
    const lines = parseHtmlToLines(editorRef.current.innerHTML)
    setLineCount(lines.length)
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const lines = html ? parseHtmlToLines(html) : plain.split(/\r?\n/)
    const safeHtml = lines.map(l => `<div>${l || '<br>'}</div>`).join('')
    insertHtmlAtCursor(safeHtml)
    // 行数を更新
    if (editorRef.current) {
      setLineCount(parseHtmlToLines(editorRef.current.innerHTML).length)
    }
  }, [])

  const handleSave = () => {
    const lines = editorRef.current
      ? parseHtmlToLines(editorRef.current.innerHTML)
      : ['']
    const clampedIdx = Math.min(insertIdx, lines.length - 1)
    storage.saveTemplate({ lines, insertAfterIndex: clampedIdx })
    setToast('保存しました')
    setTimeout(() => goTo('settings'), 900)
  }

  // プレビューはボタンで表示
  const [showPreview, setShowPreview] = useState(false)
  const previewLines = showPreview && editorRef.current
    ? parseHtmlToLines(editorRef.current.innerHTML)
    : null
  const previewHTML = previewLines
    ? buildTemplateHTML({ lines: previewLines, insertAfterIndex: insertIdx }, REST_DECLARATIONS[0])
    : null

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <button className="back-btn" onClick={() => goTo('settings')}>← 戻る</button>
        <h2 className="subscreen-title">テンプレート編集</h2>
        <p className="hint">noteの記事をそのまま貼り付けできます。リンクも保持されます。</p>
      </div>

      <div
        ref={editorRef}
        className="template-richtext"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="ここにnoteのテンプレートをペーストしてください"
        onInput={handleInput}
        onPaste={handlePaste}
      />

      <div className="insert-position-block">
        <p className="label">宣言文の挿入位置</p>
        <div className="insert-pos-row">
          <button
            className={`insert-pos-chip${insertIdx === -1 ? ' active' : ''}`}
            onClick={() => setInsertIdx(-1)}
          >先頭</button>
          <button
            className={`insert-pos-chip${insertIdx >= lineCount ? ' active' : ''}`}
            onClick={() => setInsertIdx(lineCount)}
          >末尾</button>
        </div>
      </div>

      <button className="btn-secondary wide" onClick={() => setShowPreview(v => !v)}>
        {showPreview ? 'プレビューを閉じる' : 'プレビューを確認'}
      </button>

      {showPreview && previewHTML && (
        <div className="preview-section">
          <div
            className="template-preview"
            dangerouslySetInnerHTML={{ __html: previewHTML }}
          />
        </div>
      )}

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
