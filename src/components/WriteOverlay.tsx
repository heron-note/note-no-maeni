import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { pickStampColor } from '../data/declarations'
import { playStampSound } from '../utils/audio'
import { speakVoicevox } from '../utils/voicevox'
import { useBottomSheet } from '../hooks/useBottomSheet'
import { storage } from '../utils/storage'
import { buildUserTemplatePlain, buildUserTemplateHtml, copyToClipboard } from '../utils/template'
import { Toast } from './Toast'
import type { UserTemplate } from '../types'

type StarBurst = { id: number; x: number; y: number; particles: { dx: number; dy: number }[] }

export function WriteOverlay({ reactionText, onClose }: {
  reactionText: string
  onClose: () => void
}) {
  const logToday = useAppStore(s => s.logToday)
  const stampRef = useRef<HTMLDivElement>(null)
  const [showButtons, setShowButtons] = useState(false)
  const [userTemplates] = useState<UserTemplate[]>(() => storage.loadUserTemplates())
  const [selectedTplId, setSelectedTplId] = useState<string>(() => {
    const last = storage.loadLastUserTplId()
    const all = storage.loadUserTemplates()
    return (last && all.find(t => t.id === last)) ? last : (all[0]?.id ?? '')
  })
  const [starBursts, setStarBursts] = useState<StarBurst[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)

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
    handleClose()
  }

  const triggerStarBurst = (x: number, y: number) => {
    const particles = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2
      const dist = 44 + Math.random() * 36
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist }
    })
    const id = Date.now()
    setStarBursts([{ id, x, y, particles }])
    setTimeout(() => setStarBursts([]), 800)
  }

  const handlePickTemplate = async (e: React.MouseEvent) => {
    const t = userTemplates.find(t => t.id === selectedTplId)
    if (!t) return
    window.open('https://note.com/notes/new', '_blank', 'noopener,noreferrer')
    const text = buildUserTemplatePlain(t.lines)
    const html = buildUserTemplateHtml(t.lines)
    await copyToClipboard(text, html).catch(() => {})
    triggerStarBurst(e.clientX, e.clientY)
    setTimeout(() => handleDone(), 600)
  }

  return (
    <div className={`stamp-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      {/* ⭐ 飛び散りエフェクト */}
      <div className="star-burst-wrap">
        {starBursts.flatMap(({ id, x, y, particles }) =>
          particles.map(({ dx, dy }, i) => (
            <span
              key={`${id}-${i}`}
              className="star-particle"
              style={{ left: x, top: y, '--dx': `${dx}px`, '--dy': `${dy}px` } as React.CSSProperties}
            >⭐</span>
          ))
        )}
      </div>

      <div ref={sheetRef} className={`stamp-overlay-inner${closing ? ' sheet-leaving' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="sheet-drag-handle-area" {...dragHandleProps}><div className="sheet-drag-handle" /></div>
        <div className="stamp-block">
          <div ref={stampRef} className="stamp-colored write-stamp-colored" />
        </div>
        <div className="bubble">
          <p className="reaction-text">{reactionText}</p>
        </div>

        <div className={`rest-btns overlay-btns${showButtons ? ' overlay-btns-visible' : ''}`}>
          {/* テンプレートコピー */}
          {userTemplates.length > 0 && (
            <>
              <select
                className="tpl-select"
                value={selectedTplId}
                onChange={e => { setSelectedTplId(e.target.value); storage.saveLastUserTplId(e.target.value) }}
              >
                {userTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <button className="btn-tpl wide" onClick={handlePickTemplate}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                テンプレートで書く
              </button>
              <p className="save-hint">貼り付け後は保存を忘れずに</p>
            </>
          )}

          <a
            href="https://note.com/notes/new"
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

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
