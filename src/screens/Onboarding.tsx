import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'

export function Onboarding() {
  const [name, setName] = useState('')
  const [char, setChar] = useState('kuma')
  const [error, setError] = useState(false)
  const saveUser = useAppStore(s => s.saveUser)
  const goHome = useAppStore(s => s.goHome)
  const goTo = useAppStore(s => s.goTo)

  const handleStart = () => {
    if (!name.trim()) { setError(true); return }
    saveUser({ name: name.trim(), character: char, onboarded: true })
    goHome()
  }

  const handleGoCreator = () => {
    if (name.trim()) {
      saveUser({ name: name.trim(), character: char, onboarded: false })
    }
    goTo('character-creator')
  }

  return (
    <div className="screen-scroll">
      <div className="logo-block">
        <div className="logo-icon">
          <img src="assets/images/logo.png" alt="noteのまえに" width={160} height={160} />
        </div>
        <h1 className="app-title">noteのまえに</h1>
        <p className="app-sub">書く日も、読む日も、休む日も。</p>
      </div>

      <div className="form-block">
        <p className="label">お名前を教えてください</p>
        <input
          type="text"
          className={`text-input${error ? ' error' : ''}`}
          placeholder="例：たろう"
          maxLength={20}
          autoComplete="off"
          value={name}
          onChange={e => { setName(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
        />
        <p className="hint">あとから変更できます</p>
      </div>

      <div className="form-block">
        <p className="label">相棒を選んでください</p>
        <CharGrid selected={char} onSelect={setChar} />
      </div>

      <button className="btn-primary wide" onClick={handleStart}>
        はじめる
      </button>

      <button className="btn-secondary wide" onClick={handleGoCreator}>
        相棒クリエイト
      </button>
    </div>
  )
}
