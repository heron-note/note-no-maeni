import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML } from '../utils/template'
import { REST_DECLARATIONS } from '../data/declarations'
import { Toast } from '../components/Toast'

// contenteditable の行コンポーネント（カーソル位置保持のため uncontrolled）
function LineEditable({
  html,
  lineIndex,
  placeholder,
  onUpdate,
  onEnterKey,
  focusRef,
}: {
  html: string
  lineIndex: number
  placeholder: string
  onUpdate: (i: number, html: string) => void
  onEnterKey: (i: number) => void
  focusRef: (el: HTMLDivElement | null, i: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // マウント時のみ innerHTML をセット（React の再レンダで上書きしない）
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={el => { ref.current = el; focusRef(el, lineIndex) }}
      className="line-editable"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={() => ref.current && onUpdate(lineIndex, ref.current.innerHTML)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onEnterKey(lineIndex) }
      }}
    />
  )
}

export function TemplateEditor() {
  const goTo = useAppStore(s => s.goTo)
  const [lines, setLines] = useState<string[]>(() => {
    const t = storage.loadTemplate()
    return t?.lines.length ? t.lines : ['']
  })
  const [insertIdx, setInsertIdx] = useState<number>(() => {
    const t = storage.loadTemplate()
    return t?.insertAfterIndex ?? 0
  })
  const [toast, setToast] = useState<string | null>(null)

  // 行ごとの DOM 参照（フォーカス制御用）
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const focusLine = useCallback((i: number) => {
    setTimeout(() => lineRefs.current.get(i)?.focus(), 30)
  }, [])

  const updateLine = useCallback((i: number, html: string) => {
    setLines(prev => { const next = [...prev]; next[i] = html; return next })
  }, [])

  const addLineAfter = useCallback((i: number) => {
    setLines(prev => { const next = [...prev]; next.splice(i + 1, 0, ''); return next })
    setInsertIdx(prev => prev > i ? prev + 1 : prev)
    focusLine(i + 1)
  }, [focusLine])

  const deleteLine = useCallback((i: number) => {
    setLines(prev => {
      if (prev.length <= 1) return ['']
      const next = [...prev]; next.splice(i, 1); return next
    })
    setInsertIdx(prev =>
      prev === i ? Math.max(-1, i - 1) : prev > i ? prev - 1 : prev
    )
  }, [])

  const applyFormat = (cmd: 'bold' | 'italic') => {
    document.execCommand(cmd)
  }

  const handleSave = () => {
    storage.saveTemplate({ lines, insertAfterIndex: insertIdx })
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
        <p className="hint">行を編集し、宣言文の挿入位置を選んでください。</p>
      </div>

      <div className="editor-toolbar">
        <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); applyFormat('bold') }}><b>B</b></button>
        <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); applyFormat('italic') }}><i>I</i></button>
        <span className="toolbar-hint">選択してから適用</span>
      </div>

      <div className="template-line-editor">
        {/* 先頭への挿入マーカー */}
        <InsertMarker
          position={-1}
          active={insertIdx === -1}
          onClick={() => setInsertIdx(-1)}
        />
        {lines.map((html, i) => (
          <div key={i}>
            <div className="line-row">
              <LineEditable
                html={html}
                lineIndex={i}
                placeholder={`行 ${i + 1}`}
                onUpdate={updateLine}
                onEnterKey={addLineAfter}
                focusRef={(el, idx) => {
                  if (el) lineRefs.current.set(idx, el)
                  else lineRefs.current.delete(idx)
                }}
              />
              <button
                className="line-delete-btn"
                onClick={() => deleteLine(i)}
                title="この行を削除"
              >×</button>
            </div>
            <InsertMarker
              position={i}
              active={insertIdx === i}
              onClick={() => setInsertIdx(i)}
            />
          </div>
        ))}
      </div>

      <button
        className="btn-secondary"
        onClick={() => {
          setLines(prev => [...prev, ''])
          focusLine(lines.length)
        }}
      >
        ＋ 行を追加
      </button>

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

function InsertMarker({ active, onClick }: {
  position: number
  active: boolean
  onClick: () => void
}) {
  return (
    <div className={`insert-marker${active ? ' active' : ''}`}>
      <button className="insert-marker-btn" onClick={onClick}>
        {active ? '📍 休もっ化宣言をここに挿入' : '▼ ここに挿入'}
      </button>
    </div>
  )
}
