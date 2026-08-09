import React, { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'
import { Toast } from '../components/Toast'
import { exportData, importData } from '../utils/transfer'

type HeartBurst = { id: number; x: number; y: number; particles: { dx: number; dy: number }[] }

export function Settings() {
  const user = useAppStore(s => s.user)
  const saveUser = useAppStore(s => s.saveUser)
  const goHome = useAppStore(s => s.goHome)
  const goTo = useAppStore(s => s.goTo)

  const init = useAppStore(s => s.init)
  const [name, setName] = useState(user?.name ?? '')
  const [char, setChar] = useState(user?.character ?? 'kuma')
  const [toast, setToast] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([])

  const triggerBurst = (pos: { x: number; y: number }) => {
    setHeartBursts(prev => {
      if (prev.length > 0) return prev
      const particles = Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2
        const dist = 48 + Math.random() * 32
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist }
      })
      const id = Date.now()
      setTimeout(() => setHeartBursts([]), 750)
      return [{ id, ...pos, particles }]
    })
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importData(file)
      init()
      setToast('インポートしました')
    } catch {
      setToast('ファイルが正しくありません')
    }
    e.target.value = ''
  }

  const handleSave = () => {
    if (!name.trim()) return
    saveUser({ name: name.trim(), character: char, onboarded: true })
    setToast('保存しました')
  }

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={goHome}>‹</button>
          <h2 className="subscreen-title">設定</h2>
        </div>
      </div>

      <div className="settings-row">
        <p className="label">お名前</p>
        <input
          type="text"
          className="text-input"
          maxLength={20}
          autoComplete="off"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="settings-row">
        <p className="label">相棒</p>
        <CharGrid selected={char} onSelect={setChar} onSelectWithPos={(_, pos) => triggerBurst(pos)} />
        <button className="btn-secondary wide" onClick={() => goTo('character-creator')}>
          相棒クリエイト
        </button>
      </div>

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <div className="transfer-row">
        <button className="btn-secondary wide" onClick={exportData}>
          データをエクスポート
        </button>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        <button className="btn-secondary wide" onClick={() => importRef.current?.click()}>
          データをインポート
        </button>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
      <div className="heart-burst-wrap">
        {heartBursts.flatMap(({ id, x, y, particles }) =>
          particles.map(({ dx, dy }, i) => (
            <span
              key={`${id}-${i}`}
              className="heart-particle"
              style={{ left: x, top: y, '--dx': `${dx}px`, '--dy': `${dy}px` } as React.CSSProperties}
            >
              ❤️
            </span>
          ))
        )}
      </div>
    </div>
  )
}
