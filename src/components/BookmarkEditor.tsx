import { useState } from 'react'
import type { Bookmark } from '../types'

function stripNote(name: string) {
  return name.endsWith('｜note') ? name.slice(0, -5) : name
}

function parseClipboard(text: string): { name: string; url: string } | null {
  const match = text.match(/^(.+?)：(https?:\/\/.+)$/)
  if (match) return { name: stripNote(match[1].trim()), url: match[2].trim() }
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
  const [formOpen, setFormOpen] = useState(bookmarks.length === 0)
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? bookmarks.filter(b => b.name.includes(search.trim()))
    : bookmarks

  const handleAdd = () => {
    const trimName = name.trim()
    const trimUrl = url.trim()
    if (!trimName || !trimUrl) { setError('名前とURLを入力してください'); return }
    if (!/^https?:\/\//.test(trimUrl)) { setError('URLはhttp(s)://から始めてください'); return }
    if (bookmarks.some(b => b.url === trimUrl)) { setError('このURLはすでに登録されています'); return }
    onChange([...bookmarks, { id: newId(), name: trimName, url: trimUrl, recommendCount: 0, lastRecommendedDate: null }])
    setName('')
    setUrl('')
    setError(null)
  }

  const handleDelete = (id: string) => {
    onChange(bookmarks.filter(b => b.id !== id))
  }

  const handleClipboard = async () => {
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html')
            const html = await blob.text()
            const div = document.createElement('div')
            div.innerHTML = html
            const anchor = div.querySelector('a[href]') as HTMLAnchorElement | null
            if (anchor?.href) {
              setName(stripNote(anchor.textContent?.trim() ?? ''))
              setUrl(anchor.href)
              setError(null)
              return
            }
          }
        }
      }
      const text = await navigator.clipboard.readText()
      const parsed = parseClipboard(text)
      if (parsed) {
        setName(parsed.name)
        setUrl(parsed.url)
        setError(null)
      } else {
        setError('読み込めませんでした。ブックマークレットを実行してから押してください')
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

        <input
          className="bookmark-input"
          placeholder="🔍 名前で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="bookmark-list">
          {bookmarks.length === 0 && (
            <p className="bookmark-empty">まだ登録されていません</p>
          )}
          {bookmarks.length > 0 && filtered.length === 0 && (
            <p className="bookmark-empty">一致する項目がありません</p>
          )}
          {filtered.map(b => (
            <div key={b.id} className="bookmark-item">
              <span className="bookmark-item-name">{b.name}</span>
              <button className="bookmark-delete-btn" onClick={() => handleDelete(b.id)}>削除</button>
            </div>
          ))}
        </div>

        <div className={`bookmark-form-wrap${formOpen ? ' bookmark-form-open' : ''}`}>
          <button
            className="bookmark-form-toggle"
            onClick={() => setFormOpen(v => !v)}
          >
            {formOpen ? '▼ 閉じる' : '▲ 追加する'}
          </button>
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
    </div>
  )
}
