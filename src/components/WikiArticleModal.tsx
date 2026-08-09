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
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    fetchFullArticle(hint.title)
      .then(text => setBody(text))
      .catch(() => setBody(hint.extract))
      .finally(() => setLoading(false))
  }, [hint.title])

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 280)
  }

  return (
    <div className="wiki-modal-overlay" onClick={handleClose}>
      <div className={`wiki-modal${closing ? ' wiki-modal-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="wiki-modal-header">
          <h2 className="wiki-modal-title">{hint.title}</h2>
          <button className="icon-btn" onClick={handleClose} aria-label="閉じる">✕</button>
        </div>
        <div className="wiki-modal-body">
          {loading ? <span className="wiki-hint-loading">取得中…</span> : body}
        </div>
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
