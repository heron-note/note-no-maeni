import { useState, useRef } from 'react'
import type { Bookmark } from '../types'

function stripNote(name: string) {
  return name.endsWith('｜note') ? name.slice(0, -5) : name
}

function parseSpreadsheet(text: string, existing: Bookmark[]): { valid: { name: string; url: string }[]; skipped: number } {
  const existingUrls = new Set(existing.map(b => b.url))
  const valid: { name: string; url: string }[] = []
  let skipped = 0
  const addedUrls = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t')
    if (cols.length < 2) continue
    const name = stripNote(cols[0].trim())
    const url = cols[1].trim()
    if (!name || !/^https?:\/\//.test(url)) continue
    if (existingUrls.has(url) || addedUrls.has(url)) { skipped++; continue }
    valid.push({ name, url })
    addedUrls.add(url)
  }
  return { valid, skipped }
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
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const bulkRef = useRef<HTMLTextAreaElement>(null)

  const filtered = search.trim()
    ? bookmarks.filter(b => b.name.includes(search.trim()))
    : bookmarks

  const handleAdd = () => {
    const trimName = name.trim()
    const trimUrl = url.trim()
    if (!trimName || !trimUrl) { setError('名前とURLを入力してください'); return }
    if (!/^https?:\/\//.test(trimUrl)) { setError('URLはhttp(s)://から始めてください'); return }
    if (bookmarks.some(b => b.url === trimUrl)) { setError('このURLはすでに登録されています'); return }
    onChange([...bookmarks, { id: newId(), name: trimName, url: trimUrl, priority: 0, recommendCount: 0, lastRecommendedDate: null }])
    setName('')
    setUrl('')
    setError(null)
  }

  const handleDelete = (id: string) => {
    onChange(bookmarks.filter(b => b.id !== id))
  }

  const cyclePriority = (id: string) => {
    onChange(bookmarks.map(b => b.id === id ? { ...b, priority: ((b.priority ?? 0) + 1) % 4 } : b))
  }

  const handleBulkImport = () => {
    const { valid, skipped } = parseSpreadsheet(bulkText, bookmarks)
    if (valid.length === 0) return
    const newItems: Bookmark[] = valid.map(({ name, url }) => ({
      id: newId(), name, url, priority: 0, recommendCount: 0, lastRecommendedDate: null,
    }))
    onChange([...bookmarks, ...newItems])
    setBulkText('')
    setBulkOpen(false)
    setError(skipped > 0 ? `${valid.length}件追加（${skipped}件はすでに登録済みのためスキップ）` : null)
  }

  const DOTS = ['○○○', '●○○', '●●○', '●●●']

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
              <button className="bookmark-priority-btn" onClick={() => cyclePriority(b.id)}>
                {DOTS[b.priority ?? 0]}
              </button>
              <span className="bookmark-item-name">{b.name}</span>
              <button className="bookmark-delete-btn" onClick={() => handleDelete(b.id)}>削除</button>
            </div>
          ))}
        </div>

        <div className={`bookmark-bulk-wrap${bulkOpen ? ' bookmark-form-open' : ''}`}>
          <button
            className="bookmark-form-toggle"
            onClick={() => { setBulkOpen(v => !v); if (!bulkOpen) setTimeout(() => bulkRef.current?.focus(), 50) }}
          >
            {bulkOpen ? '▼ 閉じる' : '▲ スプレッドシートから一括登録'}
          </button>
          <div className="bookmark-form">
            <p className="bookmark-bulk-hint">スプレッドシート（Excel / Google Sheets）の名前・URL列を選択してコピーし、貼り付けてください。</p>
            <textarea
              ref={bulkRef}
              className="bookmark-bulk-textarea"
              rows={5}
              placeholder={'名前\thttps://note.com/...\n名前\thttps://note.com/...'}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            {bulkText.trim() && (() => {
              const { valid } = parseSpreadsheet(bulkText, bookmarks)
              return valid.length > 0
                ? <p className="bookmark-bulk-preview">{valid.length}件を追加できます</p>
                : <p className="bookmark-error">追加できる行が見つかりません</p>
            })()}
            <button
              className="btn-primary wide"
              onClick={handleBulkImport}
              disabled={parseSpreadsheet(bulkText, bookmarks).valid.length === 0}
            >
              一括追加する
            </button>
          </div>
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
