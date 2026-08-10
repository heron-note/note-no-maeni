import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bookmark } from '../types'
import { startDrumRoll, playDrumHit } from '../utils/drumSounds'
import { speakVoicevox } from '../utils/voicevox'
import { useBottomSheet } from '../hooks/useBottomSheet'

const ITEM_H = 56

export function RecommendOverlay({ bookmark, allNames, onOpen, onClose }: {
  bookmark: Bookmark
  allNames: string[]
  onOpen: () => void
  onClose: () => void
}) {
  const reelRef = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)

  // リール構成: [ランダム×1, ランダム×13, target, ランダム×1] = 16件
  // 3件表示ウィンドウで target(index=14) が中央に来る
  const reelItems = useMemo(() => {
    const pool = allNames.length > 1 ? allNames.filter(n => n !== bookmark.name) : allNames
    const rand = () => pool[Math.floor(Math.random() * pool.length)]
    return [rand(), ...Array.from({ length: 13 }, rand), bookmark.name, rand()]
  }, [])

  useEffect(() => {
    const el = reelRef.current
    if (!el) return
    const travel = 13 * ITEM_H
    el.style.transition = 'none'
    el.style.transform = 'translateY(0)'

    const stopRoll = startDrumRoll(2.4)

    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `transform 2.4s cubic-bezier(0.0, 0.0, 0.2, 1.0)`
      el.style.transform = `translateY(-${travel}px)`
    }))

    const t = setTimeout(() => {
      stopRoll()
      playDrumHit()
      speakVoicevox('vv_asobini')
      setDone(true)
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={`stamp-overlay${closing ? ' closing' : ''}`}>
      <div ref={sheetRef} className={`stamp-overlay-inner recommend-inner${closing ? ' sheet-leaving' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="sheet-drag-handle-area" {...dragHandleProps}><div className="sheet-drag-handle" /></div>

        <div className="slot-machine">
          <div className="slot-window">
            <div className="slot-reel" ref={reelRef}>
              {reelItems.map((name, i) => (
                <div
                  key={i}
                  className={`slot-item${i === 14 && done ? ' slot-item-hit' : ''}`}
                >
                  {name}
                </div>
              ))}
            </div>
            <div className="slot-fade-top" />
            <div className="slot-fade-bottom" />
            <div className="slot-center-line" />
          </div>
        </div>

        <p className={`recommend-message${done ? ' recommend-message-visible' : ''}`}>
          さんのところへ遊びに行こう！
        </p>

        <div className={`overlay-btns${done ? ' overlay-btns-visible' : ''}`}>
          <button className="btn-primary wide" onClick={onOpen}>開く ↗</button>
          <button className="btn-secondary wide" onClick={handleClose}>閉じる</button>
        </div>

      </div>
    </div>
  )
}
