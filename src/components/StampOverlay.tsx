import { useEffect, useRef, useState } from 'react'
import { pickStampColor } from '../data/declarations'
import { playStampSound } from '../utils/audio'
import { speakVoicevox } from '../utils/voicevox'
import { storage } from '../utils/storage'
import { buildPlainText, buildHtmlText, copyToClipboard } from '../utils/template'
import { Toast } from './Toast'
import type { Declaration, RestTemplate } from '../types'
import { useBottomSheet } from '../hooks/useBottomSheet'

export function StampOverlay({ declaration, onClose }: {
  declaration: Declaration
  onClose: () => void
}) {
  const stampRef = useRef<HTMLDivElement>(null)
  const [showButtons, setShowButtons] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)

  const [restTemplates] = useState<RestTemplate[]>(() => storage.loadRestTemplates())
  const [selectedTplId, setSelectedTplId] = useState<string>(() => {
    const last = storage.loadLastRestTplId()
    const all = storage.loadRestTemplates()
    return (last && all.find(t => t.id === last)) ? last : (all[0]?.id ?? '')
  })

  useEffect(() => {
    const el = stampRef.current
    if (!el) return
    el.style.backgroundColor = pickStampColor()
    const t1 = setTimeout(() => {
      el.classList.add('stamp-animate')
      playStampSound()
      speakVoicevox('vv_yasumokka')
    }, 80)
    const t2 = setTimeout(() => setShowButtons(true), 800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleCopy = async () => {
    window.open('https://note.com/notes/new', '_blank', 'noopener,noreferrer')
    const tpl = restTemplates.find(t => t.id === selectedTplId)
    const template = tpl ? { lines: tpl.lines, insertAfterIndex: tpl.insertAfterIndex } : { lines: [], insertAfterIndex: -1 }
    const text = buildPlainText(template, declaration)
    const html = buildHtmlText(template, declaration)
    await copyToClipboard(text, html).catch(() => {})
    setToast('コピーしました！貼り付け後は保存を忘れずに')
  }

  return (
    <div className={`stamp-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div ref={sheetRef} className={`stamp-overlay-inner${closing ? ' sheet-leaving' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="sheet-drag-handle-area" {...dragHandleProps}><div className="sheet-drag-handle" /></div>
        <div className="stamp-block">
          <div ref={stampRef} className="stamp-colored" />
        </div>
        <div className="bubble">
          <p className="declaration-text">{declaration.text}</p>
        </div>
        <div className={`rest-btns overlay-btns${showButtons ? ' overlay-btns-visible' : ''}`}>
          {restTemplates.length > 0 && (
            <select
              className="tpl-select"
              value={selectedTplId}
              onChange={e => { setSelectedTplId(e.target.value); storage.saveLastRestTplId(e.target.value) }}
            >
              {restTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          )}
          <button className="btn-primary wide" onClick={handleCopy}>
            コピーしてnoteへ ↗
          </button>
          <button className="btn-secondary wide" onClick={handleClose}>
            閉じる
          </button>
        </div>
      </div>
      <Toast message={toast} onDone={() => { setToast(null); handleClose() }} />
    </div>
  )
}
