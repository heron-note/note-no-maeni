import { useState } from 'react'
import type { Bookmark } from '../types'

function parseClipboard(text: string): { name: string; url: string } | null {
  const match = text.match(/^(.+?)：(https?:\/\/.+)$/)
  if (match) return { name: match[1].trim(), url: match[2].trim() }
  return null
}

function newId() {
  return `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function BookmarkEditor({ bookmarks, onChange, onClose }: {
  bookmarks: Bookmark[]
  onChange: (next: Bookmark[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = () => {
    const trimName = name.trim()
    const trimUrl = url.trim()
    if (!trimName || !trimUrl) { setError('名前とURLを入力してください'); return }
    if (!/^https?:\/\//.test(trimUrl)) { setError('URLはhttp(s)://から始めてください'); return }
    const next = [...bookmarks, { id: newId(), name: trimName, url: trimUrl, recommendCount: 0, lastRecommendedDate: null }]
    onChange(next)
    setName('')
    setUrl('')
    setError(null)
  }

  const handleDelete = (id: string) => {
    onChange(bookmarks.filter(b => b.id !== id))
  }

  const handleClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseClipboard(text)
      if (parsed) {
        setName(parsed.name)
        setUrl(parsed.url)
        setError(null)
      } else {
        setError('「タイトル：URL」の形式で読み込めませんでした')
      }
    } catch {
      setError('クリップボードへのアクセスが許可されていません')
    }
  }

  return (
    <div className="stamp-overlay" onClick={onClose}>
      <div className="bookmark-editor" onClick={e => e.stopPropagation()}>
        <div className="bookmark-editor-header">
          <span className="subscreen-title">おすすめ編集</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bookmark-list">
          {bookmarks.length === 0 && (
            <p className="bookmark-empty">まだ登録されていません</p>
          )}
          {bookmarks.map(b => (
            <div key={b.id} className="bookmark-item">
              <span className="bookmark-item-name">{b.name}</span>
              <button className="bookmark-delete-btn" onClick={() => handleDelete(b.id)}>削除</button>
            </div>
          ))}
        </div>

        <div className="bookmark-form">
          <input
            className="bookmark-input"
            placeholder="名前"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="bookmark-input"
            placeholder="URL（https://...）"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          {error && <p className="bookmark-error">{error}</p>}
          <button className="btn-secondary wide" onClick={handleClipboard}>
            クリップボードから読み込む
          </button>
          <button className="btn-primary wide" onClick={handleAdd}>追加する</button>
        </div>
      </div>
    </div>
  )
}
