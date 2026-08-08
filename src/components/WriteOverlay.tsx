import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { pickStampColor } from '../data/declarations'
import { playStampSound } from '../utils/audio'
import { speakVoicevox } from '../utils/voicevox'

export function WriteOverlay({ reactionText, onClose }: {
  reactionText: string
  onClose: () => void
}) {
  const logToday = useAppStore(s => s.logToday)
  const stampRef = useRef<HTMLDivElement>(null)
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    const el = stampRef.current
    if (!el) return
    el.style.backgroundColor = pickStampColor()
    const t1 = setTimeout(() => {
      el.classList.add('stamp-animate')
      playStampSound()
      speakVoicevox('vv_tanoshiku')
    }, 80)
    const t2 = setTimeout(() => setShowButtons(true), 800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleDone = () => {
    logToday('write')
    onClose()
  }

  return (
    <div className="stamp-overlay" onClick={onClose}>
      <div className="stamp-overlay-inner" onClick={e => e.stopPropagation()}>
        <div className="stamp-block">
          <div ref={stampRef} className="stamp-colored write-stamp-colored" />
        </div>
        <div className="bubble">
          <p className="reaction-text">{reactionText}</p>
        </div>
        <div className={`rest-btns overlay-btns${showButtons ? ' overlay-btns-visible' : ''}`}>
          <a
            href="https://note.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary wide btn-note"
            onClick={handleDone}
          >
            noteを開く ↗
          </a>
          <button className="btn-secondary wide" onClick={handleDone}>
            今日もひとつ、選べたね
          </button>
        </div>
      </div>
    </div>
  )
}
