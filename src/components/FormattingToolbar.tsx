import { useEffect, useRef, useState } from 'react'

interface Props {
  editorRef: React.RefObject<HTMLDivElement | null>
}

function getBlockInEditor(editor: HTMLDivElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node: Node | null = sel.getRangeAt(0).commonAncestorContainer
  while (node && node !== editor) {
    if (node.parentNode === editor) {
      // テキストノードは HTMLElement ではないので null を返す
      return node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : null
    }
    node = node.parentNode
  }
  return null
}

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L7 4"/>
    <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L9 12"/>
  </svg>
)
const QuoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M2 10.5C2 8 3.5 6.2 6 5.6L6.5 7.2C5.1 7.7 4.2 8.9 4.2 10.5V11H7V14.5H2V10.5zm7 0C9 8 10.5 6.2 13 5.6L13.5 7.2C12.1 7.7 11.2 8.9 11.2 10.5V11H14V14.5H9V10.5z"/>
  </svg>
)
const CodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5.5,3.5 1.5,8 5.5,12.5"/>
    <polyline points="10.5,3.5 14.5,8 10.5,12.5"/>
  </svg>
)

function wrapOrUnwrap(tagName: string, fallbackCmd: string) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  const anc = range.commonAncestorContainer
  const existing = (anc.nodeType === Node.ELEMENT_NODE ? anc as Element : anc.parentElement)
    ?.closest(tagName)
  if (existing) {
    const parent = existing.parentNode!
    while (existing.firstChild) parent.insertBefore(existing.firstChild, existing)
    parent.removeChild(existing)
  } else {
    try {
      const el = document.createElement(tagName)
      range.surroundContents(el)
    } catch {
      document.execCommand(fallbackCmd)
    }
  }
}

export function FormattingToolbar({ editorRef }: Props) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [showHeadingMenu, setShowHeadingMenu] = useState(false)
  const [showLinkPopup, setShowLinkPopup] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [blockTag, setBlockTag] = useState('')

  const savedRangeRef = useRef<Range | null>(null)
  const savedBlockRef = useRef<HTMLElement | null>(null)
  const keepVisibleRef = useRef(false)

  useEffect(() => { keepVisibleRef.current = showLinkPopup }, [showLinkPopup])

  useEffect(() => {
    const onSelChange = () => {
      if (keepVisibleRef.current) return
      const sel = window.getSelection()
      const editor = editorRef.current
      if (!sel || sel.isCollapsed || !editor) { setVisible(false); return }
      if (sel.rangeCount === 0) { setVisible(false); return }
      const range = sel.getRangeAt(0)
      if (!editor.contains(range.commonAncestorContainer)) { setVisible(false); return }

      savedRangeRef.current = range.cloneRange()
      const block = getBlockInEditor(editor)
      savedBlockRef.current = block
      setBlockTag(block ? block.tagName.toLowerCase() : 'div')

      const wrapper = editor.parentElement
      if (!wrapper) { setVisible(false); return }
      const wrapperRect = wrapper.getBoundingClientRect()
      const rect = range.getBoundingClientRect()
      const TOOLBAR_H = 44
      const topInWrapper = rect.top - wrapperRect.top
      const isAbove = topInWrapper > TOOLBAR_H + 16
      setPos({
        top: isAbove ? topInWrapper - TOOLBAR_H - 4 : topInWrapper + rect.height + 4,
        left: Math.max(8, Math.min(
          rect.left - wrapperRect.left + rect.width / 2 - 112,
          wrapperRect.width - 232,
        )),
      })
      setShowHeadingMenu(false)
      setVisible(true)
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [editorRef])

  function restoreSelection() {
    const sel = window.getSelection()
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current.cloneRange())
    }
  }

  function getOrWrapBlock(): HTMLElement | null {
    const block = savedBlockRef.current
    if (block && block.parentNode) return block
    const editor = editorRef.current
    const range = savedRangeRef.current
    if (!editor || !range) return null
    let node: Node | null = range.commonAncestorContainer
    while (node && node !== editor) {
      if (node.parentNode === editor) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          savedBlockRef.current = node as HTMLElement
          return node as HTMLElement
        }
        if (node.nodeType === Node.TEXT_NODE) {
          const div = document.createElement('div')
          editor.insertBefore(div, node)
          div.appendChild(node)
          savedBlockRef.current = div
          setBlockTag('div')
          return div
        }
        return null
      }
      node = node.parentNode
    }
    return null
  }

  function handleHeading(level: string) {
    const block = getOrWrapBlock()
    if (!block || !block.parentNode) return
    const tag = block.tagName.toLowerCase()
    let innerHTML = tag === 'blockquote'
      ? (block.querySelector('p') || block).innerHTML
      : block.innerHTML
    const newTag = level || 'div'
    const newEl = document.createElement(newTag)
    if (newTag === 'blockquote') {
      const p = document.createElement('p')
      p.innerHTML = innerHTML
      newEl.appendChild(p)
    } else {
      newEl.innerHTML = innerHTML || '<br>'
    }
    block.parentNode.replaceChild(newEl, block)
    savedBlockRef.current = newEl
    setBlockTag(newTag)
    setShowHeadingMenu(false)
    setVisible(false)
  }

  function handleBold(e: React.PointerEvent) {
    e.preventDefault()
    restoreSelection()
    wrapOrUnwrap('strong', 'bold')
  }

  function handleStrike(e: React.PointerEvent) {
    e.preventDefault()
    restoreSelection()
    wrapOrUnwrap('s', 'strikeThrough')
  }

  function handleLinkOpen(e: React.PointerEvent) {
    e.preventDefault()
    restoreSelection()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const anc = sel.getRangeAt(0).commonAncestorContainer
      const aEl = (anc.nodeType === Node.ELEMENT_NODE ? anc as Element : anc.parentElement)?.closest('a')
      setLinkUrl(aEl?.getAttribute('href') || '')
    }
    setShowLinkPopup(true)
  }

  function applyLink() {
    const sel = window.getSelection()
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current.cloneRange())
    }
    const url = linkUrl.trim()
    if (url) {
      document.execCommand('createLink', false, url)
      editorRef.current?.querySelectorAll('a:not([target])').forEach(a => {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noopener noreferrer')
      })
    }
    setShowLinkPopup(false)
    setLinkUrl('')
    setVisible(false)
  }

  function handleBlockquote(e: React.PointerEvent) {
    e.preventDefault()
    const block = getOrWrapBlock()
    if (!block || !block.parentNode) return
    const tag = block.tagName.toLowerCase()
    if (tag === 'blockquote') {
      const div = document.createElement('div')
      div.innerHTML = (block.querySelector('p') || block).innerHTML
      block.parentNode.replaceChild(div, block)
      savedBlockRef.current = div
      setBlockTag('div')
    } else {
      const bq = document.createElement('blockquote')
      const p = document.createElement('p')
      if (tag === 'pre') p.textContent = block.textContent || ''
      else p.innerHTML = block.innerHTML
      bq.appendChild(p)
      block.parentNode.replaceChild(bq, block)
      savedBlockRef.current = bq
      setBlockTag('blockquote')
    }
    setVisible(false)
  }

  function handleCode(e: React.PointerEvent) {
    e.preventDefault()
    const block = getOrWrapBlock()
    if (!block || !block.parentNode) return
    const tag = block.tagName.toLowerCase()
    if (tag === 'pre') {
      const div = document.createElement('div')
      div.textContent = block.textContent || ''
      block.parentNode.replaceChild(div, block)
      savedBlockRef.current = div
      setBlockTag('div')
    } else {
      const pre = document.createElement('pre')
      pre.textContent = block.textContent || ''
      block.parentNode.replaceChild(pre, block)
      savedBlockRef.current = pre
      setBlockTag('pre')
    }
    setVisible(false)
  }

  const headingLabel = blockTag === 'h2' ? '大見出し' : blockTag === 'h3' ? '小見出し' : '標準'
  const headingOptions: Array<[string, string]> = [['', '標準'], ['h2', '大見出し'], ['h3', '小見出し']]

  return (
    <>
      {visible && (
        <div className="fmt-toolbar" style={{ top: pos.top, left: pos.left }}>
          <button
            className={`fmt-btn fmt-heading-btn${showHeadingMenu ? ' fmt-btn-active' : ''}`}
            onPointerDown={e => { e.preventDefault(); setShowHeadingMenu(v => !v) }}
          >
            {headingLabel}<span className="fmt-chevron">▾</span>
          </button>

          <div className="fmt-divider" />

          <button
            className="fmt-btn fmt-bold-btn"
            onPointerDown={handleBold}
            title="太字"
          >B</button>
          <button
            className="fmt-btn fmt-strike-btn"
            onPointerDown={handleStrike}
            title="取り消し線"
          >S</button>

          <div className="fmt-divider" />

          <button className="fmt-btn" onPointerDown={handleLinkOpen} title="リンク">
            <LinkIcon />
          </button>
          <button
            className={`fmt-btn${blockTag === 'blockquote' ? ' fmt-btn-active' : ''}`}
            onPointerDown={handleBlockquote}
            title="引用"
          ><QuoteIcon /></button>
          <button
            className={`fmt-btn${blockTag === 'pre' ? ' fmt-btn-active' : ''}`}
            onPointerDown={handleCode}
            title="コード"
          ><CodeIcon /></button>
        </div>
      )}

      {visible && showHeadingMenu && (
        <div className="fmt-heading-menu" style={{ top: pos.top + 44, left: pos.left }}>
          {headingOptions.map(([level, label]) => {
            const isActive = level === '' ? !['h2', 'h3'].includes(blockTag) : blockTag === level
            return (
              <button
                key={level || 'normal'}
                className={`fmt-heading-item${isActive ? ' active' : ''}`}
                onPointerDown={e => { e.preventDefault(); handleHeading(level) }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {showLinkPopup && (
        <>
          <div
            className="fmt-link-backdrop"
            onPointerDown={() => { setShowLinkPopup(false); setLinkUrl('') }}
          />
          <div className="fmt-link-popup">
            <p className="fmt-link-popup-title">リンクを挿入</p>
            <input
              className="fmt-link-input"
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } }}
              autoFocus
            />
            <div className="fmt-link-popup-btns">
              <button
                className="btn-secondary"
                onPointerDown={e => { e.preventDefault(); setShowLinkPopup(false); setLinkUrl('') }}
              >キャンセル</button>
              <button
                className="btn-primary"
                onPointerDown={e => { e.preventDefault(); applyLink() }}
              >適用</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
