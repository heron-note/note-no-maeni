import { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'
import { importData } from '../utils/transfer'
import { speakVoicevox } from '../utils/voicevox'
import { PwaInstallHint } from '../components/PwaInstallHint'

export function Onboarding() {
  const [name, setName] = useState('')
  const [char, setChar] = useState('kuma')
  const [error, setError] = useState(false)
  const saveUser = useAppStore(s => s.saveUser)
  const goHome = useAppStore(s => s.goHome)
  const goTo = useAppStore(s => s.goTo)
  const init = useAppStore(s => s.init)
  const importRef = useRef<HTMLInputElement>(null)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importData(file)
      init()
    } catch {
      // ファイルが不正な場合は無視
    }
    e.target.value = ''
  }

  const handleStart = () => {
    if (!name.trim()) { setError(true); return }
    saveUser({ name: name.trim(), character: char, onboarded: true })
    speakVoicevox('vv_hajimemashite')
    goHome()
  }

  const handleGoCreator = (mode: 'character-creator-simple' | 'character-creator') => {
    if (name.trim()) {
      saveUser({ name: name.trim(), character: char, onboarded: false })
    }
    goTo(mode)
  }

  return (
    <div className="screen-scroll">
      <div className="onboarding-pwa-row">
        <PwaInstallHint />
      </div>
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
        />
        <p className="hint">あとから変更できます</p>
      </div>

      <div className="form-block">
        <p className="label">相棒を選んでください</p>
        <CharGrid selected={char} onSelect={setChar} />
        <div className="creator-btn-row" style={{ marginTop: '8px' }}>
          <button className="btn-secondary" onClick={() => handleGoCreator('character-creator-simple')}>
            相棒クリエイト
          </button>
          <button className="btn-secondary" onClick={() => handleGoCreator('character-creator')}>
            AI相棒クリエイト
          </button>
        </div>
        {localStorage.getItem('nob_custom_img_normal') && (
          <button
            className="btn-secondary wide"
            style={{ marginTop: '8px' }}
            onClick={() => {
              const url = localStorage.getItem('nob_custom_img_normal')
              if (!url) return
              const a = document.createElement('a')
              a.href = url
              a.download = 'mychar.png'
              a.click()
            }}
          >
            マイキャラをダウンロード
          </button>
        )}
      </div>

      <button className="btn-primary wide" onClick={handleStart}>
        はじめる
      </button>

      <div className="transfer-row">
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        <button className="btn-secondary wide" onClick={() => importRef.current?.click()}>
          引越しデータをインポート
        </button>
      </div>
    </div>
  )
}
