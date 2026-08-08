import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'
import { Toast } from '../components/Toast'

export function Settings() {
  const user = useAppStore(s => s.user)
  const saveUser = useAppStore(s => s.saveUser)
  const goHome = useAppStore(s => s.goHome)
  const goTo = useAppStore(s => s.goTo)

  const [name, setName] = useState(user?.name ?? '')
  const [char, setChar] = useState(user?.character ?? 'kuma')
  const [toast, setToast] = useState<string | null>(null)

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
        <CharGrid selected={char} onSelect={setChar} />
      </div>

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <button className="btn-secondary wide" onClick={() => goTo('character-creator')}>
        相棒クリエイト
      </button>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
