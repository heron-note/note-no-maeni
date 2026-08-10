import { useRef, useState } from 'react'

export function useBottomSheet(onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)

  const handleClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    setTimeout(onClose, 260)
  }

  const onDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    if (sheetRef.current) {
      sheetRef.current.style.animation = 'none'  // fill-mode による transform 上書きを解除
      sheetRef.current.style.transition = 'none'
    }
  }

  const onDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`
  }

  const onDragEnd = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.changedTouches[0].clientY - dragStartY.current)
    dragStartY.current = null
    if (delta > 80) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.22s ease'
        sheetRef.current.style.transform = 'translateY(100vh)'
      }
      setTimeout(onClose, 220)
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)'
        sheetRef.current.style.transform = 'translateY(0)'
        setTimeout(() => {
          if (sheetRef.current) {
            sheetRef.current.style.transition = ''
            sheetRef.current.style.transform = ''
          }
        }, 300)
      }
    }
  }

  return {
    closing,
    handleClose,
    sheetRef,
    dragHandleProps: {
      onTouchStart: onDragStart,
      onTouchMove: onDragMove,
      onTouchEnd: onDragEnd,
    } as React.HTMLAttributes<HTMLDivElement>,
  }
}
