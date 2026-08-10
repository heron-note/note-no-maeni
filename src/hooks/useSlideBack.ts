import { useEffect, useRef, useState } from 'react'

export function useSlideBack(onBack: () => void) {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const touchStartX = useRef<number | null>(null)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  const handleBack = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    setTimeout(() => onBackRef.current(), 280)
  }

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX < 30 ? e.touches[0].clientX : null
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return
      const dx = e.changedTouches[0].clientX - touchStartX.current
      touchStartX.current = null
      if (dx > 60) handleBack()
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { closing, handleBack }
}
