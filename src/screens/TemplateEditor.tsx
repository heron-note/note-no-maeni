import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML } from '../utils/template'
import { REST_DECLARATIONS } from '../data/declarations'
import { Toast } from '../components/Toast'

// ===== HTML サニタイズ (インラインタグ + a[href] を保持) =====
const INLINE_TAGS = new Set(['strong','em','b','i','u','s','strike','code'])
const BLOCK_TAGS  = new Set(['p','div','h1','h2','h3','h4','h5','h6','li','blockquote','pre'])

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
          const content = Array.from(ce.childNodes).map(sanitizeInline).join('').trim()
          if (content) result.push(content)
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

  walk(root)
  return result.length > 0 ? result : ['']
}

// ===== エディタ初期 HTML 生成（lines → contenteditable 用） =====
function linesToEditorHtml(lines: string[]): string {
  return lines.map(l => `<div>${l || '<br>'}</div>`).join('')
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
    return t?.insertAfterIndex ?? 0
  })
  const [toast, setToast] = useState<string | null>(null)

  // マウント時のみ初期 HTML をセット
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = linesToEditorHtml(lines)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      setLines(parseHtmlToLines(editorRef.current.innerHTML))
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    if (html) {
      // HTML ペースト：サニタイズしてインライン書式＋リンクを保持
      const sanitized = parseHtmlToLines(html)
        .map(l => `<div>${l || '<br>'}</div>`)
        .join('')
      document.execCommand('insertHTML', false, sanitized)
    } else {
      // プレーンテキスト：改行を <br> に変換
      const escaped = plain.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      document.execCommand('insertHTML', false,
        escaped.split(/\r?\n/).map(l => `<div>${l || '<br>'}</div>`).join(''))
    }
  }, [])

  const handleSave = () => {
    const parsed = editorRef.current
      ? parseHtmlToLines(editorRef.current.innerHTML)
      : lines
    storage.saveTemplate({ lines: parsed, insertAfterIndex: insertIdx })
    setToast('保存しました')
    setTimeout(() => goTo('settings'), 900)
  }

  const previewHTML = buildTemplateHTML(
    { lines, insertAfterIndex: insertIdx },
    REST_DECLARATIONS[0]
  )

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
        <div className="insert-position-list">
          <InsertPositionItem
            label="テンプレートの先頭"
            active={insertIdx === -1}
            onClick={() => setInsertIdx(-1)}
          />
          {lines.map((line, i) => (
            <InsertPositionItem
              key={i}
              label={`${i + 1}行目の後：${line.replace(/<[^>]+>/g,'').slice(0, 20) || '（空行）'}${line.replace(/<[^>]+>/g,'').length > 20 ? '…' : ''}`}
              active={insertIdx === i}
              onClick={() => setInsertIdx(i)}
            />
          ))}
        </div>
      </div>

      <div className="preview-section">
        <h3 className="preview-title">プレビュー（宣言文サンプル入り）</h3>
        <div
          className="template-preview"
          dangerouslySetInnerHTML={{ __html: previewHTML }}
        />
      </div>

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function InsertPositionItem({ label, active, onClick }: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`insert-pos-item${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="insert-pos-dot" />
      <span className="insert-pos-label">{label}</span>
    </button>
  )
}
