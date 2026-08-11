import { useState, useRef } from 'react'
import type { Bookmark } from '../types'
import { useBottomSheet } from '../hooks/useBottomSheet'
import { recordRecommend } from '../utils/recommend'

function stripNote(name: string) {
  return name.endsWith('｜note') ? name.slice(0, -5) : name
}

// テキスト内から最初の http(s):// URL を抽出する
function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s\]）)]+/)
  return m ? m[0] : text.trim()
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
    const url = extractUrl(cols[1])
    if (!name || !/^https?:\/\//.test(url)) continue
    if (existingUrls.has(url) || addedUrls.has(url)) { skipped++; continue }
    valid.push({ name, url })
    addedUrls.add(url)
  }
  return { valid, skipped }
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
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)

  const filtered = search.trim()
    ? bookmarks.filter(b => b.name.includes(search.trim()))
    : bookmarks

  const handleAdd = () => {
    const trimName = name.trim()
    const extractedUrl = extractUrl(url)
    if (!trimName || !extractedUrl) { setError('名前とURLを入力してください'); return }
    if (!/^https?:\/\//.test(extractedUrl)) { setError('URLはhttp(s)://から始めてください'); return }
    if (bookmarks.some(b => b.url === extractedUrl)) { setError('このURLはすでに登録されています'); return }
    onChange([...bookmarks, { id: newId(), name: trimName, url: extractedUrl, priority: 0, recommendCount: 0, lastRecommendedDate: null }])
    setName('')
    setUrl('')
    setError(null)
  }

  const handleVisit = (b: Bookmark) => {
    onChange(recordRecommend(bookmarks, b.id))
    window.open(b.url, '_blank', 'noopener,noreferrer')
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

  return (
    <div className={`stamp-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div ref={sheetRef} className={`bookmark-editor${closing ? ' sheet-leaving' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="sheet-drag-handle-area" {...dragHandleProps}><div className="sheet-drag-handle" /></div>
        <div className="bookmark-editor-header">
          <span className="subscreen-title">おすすめ編集</span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
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
              <button className="bookmark-item-name bookmark-item-link" onClick={() => handleVisit(b)}>{b.name}</button>
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
            <button className="btn-primary wide" onClick={handleAdd}>追加する</button>
          </div>
        </div>

      </div>
    </div>
  )
}
