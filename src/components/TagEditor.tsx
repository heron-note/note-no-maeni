import { useState } from 'react'
import type { NoteTag } from '../types'

function newId() { return `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

export function TagEditor({ tags, onChange, onClose }: {
  tags: NoteTag[]
  onChange: (next: NoteTag[]) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = () => {
    const raw = input.trim().replace(/^#+/, '') // 先頭の # を除去
    if (!raw) { setError('タグを入力してください'); return }
    if (tags.some(t => t.text === raw)) { setError('すでに登録されています'); return }
    onChange([...tags, { id: newId(), text: raw }])
    setInput('')
    setError(null)
  }

  return (
    <div className="stamp-overlay" onClick={onClose}>
      <div className="bookmark-editor" onClick={e => e.stopPropagation()}>
        <div className="bookmark-editor-header">
          <span className="subscreen-title">タグ編集</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bookmark-list">
          {tags.length === 0 && <p className="bookmark-empty">まだ登録されていません</p>}
          {tags.map(t => (
            <div key={t.id} className="bookmark-item">
              <a
                className="bookmark-item-name tag-editor-link"
                href={`https://note.com/hashtag/${encodeURIComponent(t.text)}`}
                target="_blank"
                rel="noopener noreferrer"
              >#{t.text}</a>
              <button className="bookmark-delete-btn" onClick={() => onChange(tags.filter(x => x.id !== t.id))}>削除</button>
            </div>
          ))}
        </div>

        <div className="bookmark-form-wrap bookmark-form-open">
          <div className="bookmark-form">
            <input
              className="bookmark-input"
              placeholder="#タグ名（#は自動で除去されます）"
              value={input}
              onChange={e => { setInput(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            {error && <p className="bookmark-error">{error}</p>}
            <button className="btn-primary wide" onClick={handleAdd}>追加する</button>
          </div>
        </div>
      </div>
    </div>
  )
}
