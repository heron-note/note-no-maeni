import type { WikiHint } from '../utils/wikipedia'

interface Props {
  hint: WikiHint
  onClose: () => void
}

export function WikiArticleModal({ hint, onClose }: Props) {
  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div className="wiki-modal" onClick={e => e.stopPropagation()}>
        <div className="wiki-modal-header">
          <h2 className="wiki-modal-title">{hint.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <p className="wiki-modal-body">{hint.extractFull}</p>
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
