import { useRef, useState } from 'react'
import { playPowan } from '../utils/audio'
import { storage } from '../utils/storage'

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [hiding, setHiding] = useState(false)
  const [soundOn, setSoundOn] = useState(() => storage.loadSoundEnabled())
  const doneRef = useRef(false)

  const dismiss = () => {
    if (doneRef.current) return
    doneRef.current = true
    playPowan()
    setHiding(true)
    setTimeout(() => onDone(), 400)
  }

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !soundOn
    storage.saveSoundEnabled(next)
    setSoundOn(next)
  }

  return (
    <div className={`splash${hiding ? ' splash-hide' : ''}`} onClick={dismiss}>
      <button className="icon-btn sound-btn splash-sound-btn" onClick={toggleSound} aria-label={soundOn ? '音声オフ' : '音声オン'}>
        {soundOn ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </button>
      <img src="assets/images/logo.png" alt="noteのまえに" className="splash-logo" />
      <p className="splash-tap">タップしてはじめる</p>
    </div>
  )
}
