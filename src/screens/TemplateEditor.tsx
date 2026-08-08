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
    // href の URL だけを出力（リンクテキストは使わない）
    const href = el.getAttribute('href') ?? ''
    return href.startsWith('http') ? href : inner
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
        if (tag === 'blockquote') {
          const text = (ce.textContent ?? '').trim()
          if (text) {
            text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => result.push(`> ${l}`))
          }
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

  const cleaned = result.reduce<string[]>((acc, l) => {
    if (l === '' && acc[acc.length - 1] === '') return acc
    return [...acc, l]
  }, [])
  while (cleaned[cleaned.length - 1] === '') cleaned.pop()
  return cleaned.length > 0 ? cleaned : ['']
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

  // 保存済みテンプレートを初期表示（再レンダで上書きしない）
  useEffect(() => {
    if (editorRef.current && lines.join('').trim()) {
      editorRef.current.innerHTML = lines
        .map(l => `<div>${l || '<br>'}</div>`)
        .join('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    ? buildTemplateHTML({ lines, insertAfterIndex: insertIdx }, REST_DECLARATIONS[0])
    : null

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <button className="back-btn" onClick={() => goTo('home')}>← 戻る</button>
        <h2 className="subscreen-title">テンプレート編集</h2>
        <p className="hint">noteの記事をそのまま貼り付け → 「行を解析」を押してください。リンクはURLに変換されます。</p>
      </div>

      {/* ブラウザ標準のペーストに任せる（preventDefault なし） */}
      <div
        ref={editorRef}
        className="template-richtext"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="ここにnoteのテンプレートをペーストしてください"
      />

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
