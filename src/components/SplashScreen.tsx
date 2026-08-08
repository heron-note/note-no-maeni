import { useEffect, useState } from 'react'

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [hiding, setHiding] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 1200)
    const t2 = setTimeout(() => onDone(), 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div className={`splash${hiding ? ' splash-hide' : ''}`}>
      <img src="assets/images/logo.png" alt="noteのまえに" className="splash-logo" />
    </div>
  )
}
