import { useEffect, useState } from 'react'
import { fetchWikiHint } from '../utils/wikipedia'
import type { WikiHint } from '../utils/wikipedia'

export function WikiHintCard() {
  const [hint, setHint] = useState<WikiHint | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWikiHint().then(h => { setHint(h); setLoading(false) })
  }, [])

  const refresh = () => {
    setLoading(true)
    setHint(null)
    fetchWikiHint().then(h => { setHint(h); setLoading(false) })
  }

  return (
    <div className="wiki-hint-card">
      <div className="wiki-hint-header">
        <span className="wiki-hint-label">今日のネタ候補</span>
        <button className="wiki-hint-refresh" onClick={refresh} disabled={loading} aria-label="更新">
          ↻
        </button>
      </div>
      {loading ? (
        <p className="wiki-hint-loading">取得中…</p>
      ) : hint ? (
        <>
          <p className="wiki-hint-title">{hint.title}</p>
          <p className="wiki-hint-extract">{hint.extract}</p>
          <div className="wiki-hint-actions">
            {hint.pageUrl && (
              <a className="wiki-hint-wiki-btn" href={hint.pageUrl} target="_blank" rel="noopener noreferrer">
                詳しく読む
              </a>
            )}
            <a className="wiki-hint-note-btn" href="https://note.com/notes/new" target="_blank" rel="noopener noreferrer">
              このテーマで書く ↗
            </a>
          </div>
        </>
      ) : null}
    </div>
  )
}
