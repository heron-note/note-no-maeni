import { useEffect, useState } from 'react'
import type { Bookmark } from '../types'

export function RecommendOverlay({ bookmark, onOpen, onClose }: {
  bookmark: Bookmark
  onOpen: () => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'throwing' | 'landed' | 'done'>('throwing')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('landed'), 650)
    const t2 = setTimeout(() => setPhase('done'), 1300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div className="stamp-overlay">
      <div className="stamp-overlay-inner recommend-inner" onClick={e => e.stopPropagation()}>

        <div className="dartboard-wrap">
          {/* ボード */}
          <svg className="dartboard-svg" viewBox="0 0 200 200" width="200" height="200">
            <circle cx="100" cy="100" r="96" fill="#1a1a2e" />
            <circle cx="100" cy="100" r="78" fill="#e8d5b7" />
            <circle cx="100" cy="100" r="60" fill="#1a1a2e" />
            <circle cx="100" cy="100" r="42" fill="#e8d5b7" />
            <circle cx="100" cy="100" r="24" fill="#c0392b" />
            <circle cx="100" cy="100" r="10" fill="#e74c3c" />
          </svg>

          {/* ダーツ */}
          <div className={`dart-wrap${phase !== 'throwing' ? ' dart-landed' : ''}`}>
            <svg viewBox="0 0 64 20" width="64" height="20">
              {/* tip */}
              <polygon points="0,10 10,6 10,14" fill="#ccc" />
              {/* shaft */}
              <rect x="10" y="8.5" width="30" height="3" fill="#aaa" rx="1" />
              {/* barrel */}
              <rect x="16" y="7" width="14" height="6" fill="#888" rx="1.5" />
              {/* flights */}
              <polygon points="40,9.5 56,2 58,9.5" fill="#c0392b" />
              <polygon points="40,10.5 56,18 58,10.5" fill="#c0392b" />
            </svg>
          </div>
        </div>

        <div className={`recommend-name${phase !== 'throwing' ? ' recommend-name-visible' : ''}`}>
          {bookmark.name}
        </div>

        <div className={`overlay-btns${phase === 'done' ? ' overlay-btns-visible' : ''}`}>
          <button className="btn-primary wide" onClick={onOpen}>開く ↗</button>
          <button className="btn-secondary wide" onClick={onClose}>閉じる</button>
        </div>

      </div>
    </div>
  )
}
