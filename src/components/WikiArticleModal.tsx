import { useEffect, useRef, useState } from 'react'
import type { WikiHint } from '../utils/wikipedia'
import { fetchFullArticle } from '../utils/wikipedia'

interface Props {
  hint: WikiHint
  onClose: () => void
}

export function WikiArticleModal({ hint, onClose }: Props) {
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)

  useEffect(() => {
    fetchFullArticle(hint.title)
      .then(text => setBody(text))
      .catch(() => setBody(hint.extract))
      .finally(() => setLoading(false))
  }, [hint.title])

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 280)
  }

  const handleDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    if (modalRef.current) modalRef.current.style.transition = 'none'
  }

  const handleDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current)
    if (modalRef.current) modalRef.current.style.transform = `translateY(${delta}px)`
  }

  const handleDragEnd = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.changedTouches[0].clientY - dragStartY.current)
    dragStartY.current = null
    if (delta > 80) {
      if (modalRef.current) { modalRef.current.style.transition = 'transform 0.22s ease'; modalRef.current.style.transform = 'translateY(100%)' }
      if (overlayRef.current) { overlayRef.current.style.transition = 'opacity 0.22s ease'; overlayRef.current.style.opacity = '0' }
      setTimeout(onClose, 220)
    } else {
      if (modalRef.current) {
        modalRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)'
        modalRef.current.style.transform = 'translateY(0)'
        setTimeout(() => { if (modalRef.current) { modalRef.current.style.transition = ''; modalRef.current.style.transform = '' } }, 300)
      }
    }
  }

  return (
    <div ref={overlayRef} className="wiki-modal-overlay" onClick={handleClose}>
      <div ref={modalRef} className={`wiki-modal${closing ? ' wiki-modal-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div
          className="wiki-modal-header"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div className="wiki-drag-handle" />
          <div className="wiki-modal-header-row">
            <h2 className="wiki-modal-title">{hint.title}</h2>
            <button className="icon-btn" onClick={handleClose} aria-label="閉じる">✕</button>
          </div>
        </div>
        <div className="wiki-modal-body">
          {loading ? <span className="wiki-hint-loading">取得中…</span> : body}
        </div>
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
