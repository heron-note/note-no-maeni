import { useEffect, useState } from 'react'
import { fetchWikiHint, refreshWikiHint } from '../utils/wikipedia'
import type { WikiHint } from '../utils/wikipedia'
import { WikiArticleModal } from './WikiArticleModal'

interface Props {
  onWrite: () => void
  onRest: () => void
  onEditTemplate: () => void
  onChat: () => void
}

export function WikiHintCard({ onWrite, onRest, onEditTemplate, onChat }: Props) {
  const [hint, setHint] = useState<WikiHint | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchWikiHint().then(h => { setHint(h); setLoading(false) })
  }, [])

  const refresh = () => {
    setLoading(true)
    setHint(null)
    refreshWikiHint().then(h => { setHint(h); setLoading(false) })
  }

  return (
    <>
      <div data-help="wiki-hint" className="wiki-hint-card">
        <div className="wiki-hint-header">
          <span className="wiki-hint-label">今日の豆知識</span>
          <button className="wiki-hint-refresh" onClick={refresh} disabled={loading} aria-label="更新">
            ↻
          </button>
        </div>
        <p className={`wiki-hint-title${loading ? ' wiki-hint-title-loading' : ''}`}>
          {loading ? '取得中です...' : (hint?.title ?? '　')}
        </p>
        <button
          className="wiki-hint-wiki-btn"
          onClick={() => setShowModal(true)}
          disabled={loading || !hint}
          style={loading ? { visibility: 'hidden' } : undefined}
        >
          全文を読む →
        </button>
        <div data-help="wiki-choice" className="choice-block wiki-choice-block">
          <button className="choice-btn write" onClick={onWrite}>
            <span className="choice-icon">🟨</span>
            <span className="choice-main">書く</span>
            <span className="choice-sub">1行でも書く</span>
          </button>
          <button className="choice-btn rest" onClick={onRest}>
            <span className="choice-icon">🟦</span>
            <span className="choice-main">休む</span>
            <span className="choice-sub">今日はのんびり</span>
          </button>
          <button data-help="chat-btn" className="choice-btn choice-btn-ai" onClick={onChat} aria-label="AIに相談">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="choice-main">AI</span>
          </button>
        </div>
        <button data-help="template-btn" className="template-shortcut-btn" onClick={onEditTemplate}>
          ✏️ 休もっ化計画テンプレートを編集
        </button>
      </div>
      {showModal && hint && (
        <WikiArticleModal hint={hint} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
