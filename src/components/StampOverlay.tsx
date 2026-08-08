import { useEffect, useRef, useState } from 'react'
import { pickStampColor } from '../data/declarations'
import { playStampSound } from '../utils/audio'
import { storage } from '../utils/storage'
import { buildPlainText, copyToClipboard } from '../utils/template'
import { Toast } from './Toast'
import type { Declaration } from '../types'

export function StampOverlay({ declaration, onClose }: {
  declaration: Declaration
  onClose: () => void
}) {
  const stampRef = useRef<HTMLDivElement>(null)
  const [showButtons, setShowButtons] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const el = stampRef.current
    if (!el) return
    el.style.backgroundColor = pickStampColor()
    const t1 = setTimeout(() => {
      el.classList.add('stamp-animate')
      playStampSound()
    }, 80)
    // アニメーション完了後にボタンを表示
    const t2 = setTimeout(() => setShowButtons(true), 800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleCopy = async () => {
    const template = storage.loadTemplate()
    const text = (template && template.lines.length > 0)
      ? buildPlainText(template, declaration)
      : declaration.text
    await copyToClipboard(text).catch(() => {})
    setToast('コピーしました！')
    window.open('https://note.com', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="stamp-overlay" onClick={onClose}>
      <div className="stamp-overlay-inner" onClick={e => e.stopPropagation()}>
        <div className="stamp-block">
          <div ref={stampRef} className="stamp-colored" />
        </div>
        <p className="declaration-text">{declaration.text}</p>
        {showButtons && (
          <div className="rest-btns">
            <button className="btn-primary wide" onClick={handleCopy}>
              コピーしてnoteへ ↗
            </button>
            <button className="btn-secondary wide" onClick={onClose}>
              閉じる
            </button>
          </div>
        )}
      </div>
      <Toast message={toast} onDone={() => { setToast(null); onClose() }} />
    </div>
  )
}
