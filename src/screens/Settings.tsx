import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'
import { Toast } from '../components/Toast'

export function Settings() {
  const user = useAppStore(s => s.user)
  const saveUser = useAppStore(s => s.saveUser)
  const goTo = useAppStore(s => s.goTo)
  const goHome = useAppStore(s => s.goHome)
  const settingsFrom = useAppStore(s => s.settingsFrom)

  const [name, setName] = useState(user?.name ?? '')
  const [char, setChar] = useState(user?.character ?? 'kuma')
  const [toast, setToast] = useState<string | null>(null)

  const handleBack = () => {
    settingsFrom === 'already' ? goTo('already-done') : goHome()
  }

  const handleSave = () => {
    if (!name.trim()) return
    saveUser({ name: name.trim(), character: char, onboarded: true })
    setToast('保存しました')
  }

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <button className="back-btn" onClick={handleBack}>← 戻る</button>
        <h2 className="subscreen-title">設定</h2>
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

      <div className="settings-row">
        <p className="label">投稿テンプレート</p>
        <p className="hint">「休む」選択時に宣言文を埋め込んで投稿できます。</p>
        <button className="btn-secondary" onClick={() => goTo('template-editor')}>
          テンプレートを編集する
        </button>
      </div>

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
