import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML } from '../utils/template'
import { REST_DECLARATIONS } from '../data/declarations'
import { Toast } from '../components/Toast'

function textToLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  return lines.length > 0 ? lines : ['']
}

function linesToText(lines: string[]): string {
  return lines.join('\n')
}

export function TemplateEditor() {
  const goTo = useAppStore(s => s.goTo)

  const [text, setText] = useState<string>(() => {
    const t = storage.loadTemplate()
    return t?.lines.length ? linesToText(t.lines) : ''
  })
  const [insertIdx, setInsertIdx] = useState<number>(() => {
    const t = storage.loadTemplate()
    return t?.insertAfterIndex ?? 0
  })
  const [toast, setToast] = useState<string | null>(null)

  const lines = textToLines(text)

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
        <p className="hint">テンプレート本文を貼り付けて、宣言文の挿入位置を選んでください。</p>
      </div>

      <textarea
        className="template-textarea"
        placeholder="ここにnoteのテンプレートをペーストしてください"
        value={text}
        onChange={e => setText(e.target.value)}
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
              label={`${i + 1}行目の後：${line.slice(0, 20) || '（空行）'}${line.length > 20 ? '…' : ''}`}
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
