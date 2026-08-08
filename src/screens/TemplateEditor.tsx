import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML } from '../utils/template'
import { REST_DECLARATIONS } from '../data/declarations'
import { Toast } from '../components/Toast'

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
    // リンクはURLをテキストとして展開する
    const href = el.getAttribute('href') ?? ''
    const url = href.startsWith('http') ? href : ''
    if (url && url !== inner.trim()) {
      return inner ? `${inner} ( ${url} )` : url
    }
    return url || inner
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
        if (tag === 'br') { out.push(''); return }
        if (BLOCK_TAGS.has(tag)) {
          const sub: string[] = []
          walkInner(ce, sub)
          if (sub.length > 0) out.push(...sub)
          else out.push('')
          return
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
        if (BLOCK_TAGS.has(tag)) {
          const sub: string[] = []
          walkInner(ce, sub)
          if (sub.length > 0) result.push(...sub)
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

  // 連続空行を1つに圧縮、末尾の空行を除去
  const cleaned = result.reduce<string[]>((acc, l) => {
    if (l === '' && acc[acc.length - 1] === '') return acc
    return [...acc, l]
  }, [])
  while (cleaned[cleaned.length - 1] === '') cleaned.pop()
  return cleaned.length > 0 ? cleaned : ['']
}

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

  useEffect(() => {
    if (editorRef.current && lines.join('')) {
      editorRef.current.innerHTML = lines
        .map(l => `<div>${l || '<br>'}</div>`)
        .join('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshLines = useCallback(() => {
    if (editorRef.current) {
      setLines(htmlToLines(editorRef.current.innerHTML))
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const parsed = html ? htmlToLines(html) : plain.split(/\r?\n/)
    const safeHtml = parsed.map(l => `<div>${l || '<br>'}</div>`).join('')
    insertHtmlAtCursor(safeHtml)
    refreshLines()
  }, [refreshLines])

  const handleSave = () => {
    const current = editorRef.current ? htmlToLines(editorRef.current.innerHTML) : lines
    const clampedIdx = Math.min(Math.max(insertIdx, -1), current.length - 1)
    storage.saveTemplate({ lines: current, insertAfterIndex: clampedIdx })
    setToast('保存しました')
    setTimeout(() => goTo('settings'), 900)
  }

  const previewHTML = showPreview
    ? buildTemplateHTML({ lines, insertAfterIndex: insertIdx }, REST_DECLARATIONS[0])
    : null

  const hasContent = lines.length > 0 && lines[0] !== ''

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <button className="back-btn" onClick={() => goTo('settings')}>← 戻る</button>
        <h2 className="subscreen-title">テンプレート編集</h2>
        <p className="hint">貼り付け後「挿入位置を確定」を押してください。リンクはURLテキストに変換されます。</p>
      </div>

      <div
        ref={editorRef}
        className="template-richtext"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="ここにnoteのテンプレートをペーストしてください"
        onPaste={handlePaste}
      />

      <button className="btn-secondary wide" onClick={refreshLines}>
        挿入位置を確定（貼り付け後に押してください）
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
