import { useRef, useState } from 'react'

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [hiding, setHiding] = useState(false)
  const doneRef = useRef(false)

  const dismiss = () => {
    if (doneRef.current) return
    doneRef.current = true
    setHiding(true)
    setTimeout(() => onDone(), 400)
  }

  return (
    <div className={`splash${hiding ? ' splash-hide' : ''}`} onClick={dismiss}>
      <img src="assets/images/logo.png" alt="noteのまえに" className="splash-logo" />
      <p className="splash-tap">タップしてはじめる</p>
    </div>
  )
}
