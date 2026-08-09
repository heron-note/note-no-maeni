import { useEffect, useState } from 'react'
import { fetchWikiHint, refreshWikiHint } from '../utils/wikipedia'
import type { WikiHint } from '../utils/wikipedia'
import { WikiArticleModal } from './WikiArticleModal'

interface Props {
  onWrite: () => void
  onRest: () => void
  onEditTemplate: () => void
}

export function WikiHintCard({ onWrite, onRest, onEditTemplate }: Props) {
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
      <div className="wiki-hint-card">
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
        <div className="choice-block wiki-choice-block">
          <button className="choice-btn write" onClick={onWrite}>
            <span className="choice-icon">🟨</span>
            <span className="choice-main">書く</span>
            <span className="choice-sub">1行でも書く</span>
          </button>
          <button className="choice-btn rest" onClick={onRest}>
            <span className="choice-icon">🟦</span>
            <span className="choice-main">休む</span>
            <span className="choice-sub">書くプレッシャーをリセット</span>
          </button>
        </div>
        <button className="template-shortcut-btn" onClick={onEditTemplate}>
          ✏️ 休もっ化計画テンプレートを編集
        </button>
      </div>
      {showModal && hint && (
        <WikiArticleModal hint={hint} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
