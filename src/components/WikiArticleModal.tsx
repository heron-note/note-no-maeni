import { useEffect, useState } from 'react'
import type { WikiHint } from '../utils/wikipedia'
import { fetchFullArticle } from '../utils/wikipedia'

interface Props {
  hint: WikiHint
  onClose: () => void
}

export function WikiArticleModal({ hint, onClose }: Props) {
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFullArticle(hint.title)
      .then(text => setBody(text))
      .catch(() => setBody(hint.extract))
      .finally(() => setLoading(false))
  }, [hint.title])

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div className="wiki-modal" onClick={e => e.stopPropagation()}>
        <div className="wiki-modal-header">
          <h2 className="wiki-modal-title">{hint.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        {loading ? (
          <p className="wiki-hint-loading">取得中…</p>
        ) : (
          <p className="wiki-modal-body">{body}</p>
        )}
        <div className="wiki-modal-footer">
          {hint.pageUrl ? (
            <a className="wiki-modal-source" href={hint.pageUrl} target="_blank" rel="noopener noreferrer">
              出典：Wikipedia
            </a>
          ) : (
            <span className="wiki-modal-source">出典：Wikipedia</span>
          )}
        </div>
      </div>
    </div>
  )
}
