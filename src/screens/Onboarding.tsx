import { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'
import { importData, downloadImage } from '../utils/transfer'
import { speakVoicevox } from '../utils/voicevox'
import { PwaInstallHint } from '../components/PwaInstallHint'
import { OnboardingHelpOverlay } from '../components/OnboardingHelpOverlay'

export function Onboarding() {
  const [name, setName] = useState('')
  const [char, setChar] = useState('kuma')
  const [error, setError] = useState(false)
  const saveUser = useAppStore(s => s.saveUser)
  const goHome = useAppStore(s => s.goHome)
  const goTo = useAppStore(s => s.goTo)
  const init = useAppStore(s => s.init)
  const importRef = useRef<HTMLInputElement>(null)
  const [showHelp, setShowHelp] = useState(true)

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
        <button className="icon-btn" onClick={() => setShowHelp(true)} aria-label="ヘルプ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
      </div>
      <div className="logo-block">
        <div className="logo-icon">
          <img src="assets/images/logo.png" alt="noteのまえに" width={160} height={160} />
        </div>
        <h1 className="app-title">noteのまえに</h1>
        <p className="app-sub">書く日も、読む日も、休む日も。</p>
      </div>

      <div className="form-block" data-help="ob-name">
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

      <div className="form-block" data-help="ob-char">
        <p className="label">相棒を選んでください</p>
        <CharGrid selected={char} onSelect={setChar} />
        <div className="creator-btn-row" style={{ marginTop: '8px' }}>
          <button data-help="ob-simple-creator" className="btn-secondary" onClick={() => handleGoCreator('character-creator-simple')}>
            相棒クリエイト
          </button>
          <button data-help="ob-ai-creator" className="btn-secondary" onClick={() => handleGoCreator('character-creator')}>
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
              downloadImage(url, 'mychar.png').catch(() => {})
            }}
          >
            マイキャラをダウンロード
          </button>
        )}
      </div>

      <button data-help="ob-start" className="btn-primary wide" onClick={handleStart}>
        はじめる
      </button>

      <div className="transfer-row">
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        <button data-help="ob-import" className="btn-secondary wide" onClick={() => importRef.current?.click()}>
          引越しデータをインポート
        </button>
      </div>

      {showHelp && <OnboardingHelpOverlay onDone={() => setShowHelp(false)} />}
    </div>
  )
}
