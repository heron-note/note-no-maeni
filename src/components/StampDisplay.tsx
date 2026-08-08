import { useEffect, useRef } from 'react'
import { pickStampColor } from '../data/declarations'
import { playStampSound } from '../utils/audio'

export function StampDisplay() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.backgroundColor = pickStampColor()
    el.classList.remove('stamp-animate')
    // 次フレームでアニメーション開始→同フレーム削除→追加で再トリガー
    const id = setTimeout(() => {
      el.classList.add('stamp-animate')
      playStampSound()
    }, 80)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="stamp-block">
      <div ref={ref} id="stamp-colored" className="stamp-colored" />
    </div>
  )
}
