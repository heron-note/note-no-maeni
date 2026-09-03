import React, { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CharGrid } from '../components/CharGrid'
import { Toast } from '../components/Toast'
import { exportData, importData, exportArticles, importArticles, exportBgImages, importBgImages, exportStampImages, importStampImages, downloadImage } from '../utils/transfer'
import { storage } from '../utils/storage'
import { useSlideBack } from '../hooks/useSlideBack'

type HeartBurst = { id: number; x: number; y: number; particles: { dx: number; dy: number }[] }

export function Settings() {
  const user = useAppStore(s => s.user)
  const saveUser = useAppStore(s => s.saveUser)
  const goHome = useAppStore(s => s.goHome)
  const goTo = useAppStore(s => s.goTo)
  const { closing, handleBack } = useSlideBack(goHome)

  const init = useAppStore(s => s.init)
  const [name, setName] = useState(user?.name ?? '')
  const [char, setChar] = useState(user?.character ?? 'kuma')
  const [toast, setToast] = useState<string | null>(null)
  const [geminiKey, setGeminiKey] = useState(() => storage.loadGeminiKey() ?? '')
  const [charPersonality, setCharPersonality] = useState(() => storage.loadCharPersonality())
  const importRef = useRef<HTMLInputElement>(null)
  const importArticlesRef = useRef<HTMLInputElement>(null)
  const importBgRef = useRef<HTMLInputElement>(null)
  const importStampRef = useRef<HTMLInputElement>(null)
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setToast(msg === 'cancelled' ? '' : msg || 'ファイルが正しくありません')
    }
    e.target.value = ''
  }

  const handleSave = () => {
    if (!name.trim()) return
    saveUser({ name: name.trim(), character: char, onboarded: true })
    setToast('保存しました')
  }

  return (
    <div className={`screen-scroll${closing ? ' screen-slide-out' : ''}`}>
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
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
        <div className="creator-btn-row">
          <button className="btn-secondary" onClick={() => goTo('character-creator-simple')}>
            相棒クリエイト
          </button>
          <button className="btn-secondary" onClick={() => goTo('character-creator')}>
            AI相棒クリエイト
          </button>
        </div>
        {localStorage.getItem('nob_custom_img_normal') && (
          <button
            className="btn-secondary wide"
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

      <div className="settings-row">
        <p className="label">Groq APIキー</p>
        <input
          type="password"
          className="text-input"
          placeholder="gsk_..."
          autoComplete="off"
          value={geminiKey}
          onChange={e => setGeminiKey(e.target.value)}
          onBlur={() => storage.saveGeminiKey(geminiKey)}
        />
        <p className="settings-hint">
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
            Groq Console でキーを無料取得（クレカ不要）→
          </a>
        </p>
      </div>

      <div className="settings-row">
        <p className="label">AIの性格・口調</p>
        <textarea
          className="text-input"
          rows={3}
          placeholder="例：明るくてちょっと天然。語尾に「だよ～」をつける"
          value={charPersonality}
          onChange={e => setCharPersonality(e.target.value)}
          onBlur={() => storage.saveCharPersonality(charPersonality)}
          style={{ resize: 'vertical' }}
        />
        <p className="settings-hint">未入力の場合はデフォルトの口調で会話します</p>
      </div>

      <button className="btn-primary wide" onClick={handleSave}>
        保存する
      </button>

      <div className="settings-row">
        <p className="label">バックアップ</p>
        <div className="backup-group">
          <div className="backup-row">
            <span className="backup-label">アプリ設定</span>
            <button className="btn-secondary backup-btn" onClick={() => exportData().catch(() => {})}>エクスポート</button>
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            <button className="btn-secondary backup-btn" onClick={() => importRef.current?.click()}>インポート</button>
          </div>
          <div className="backup-row">
            <span className="backup-label">記事ストッカー</span>
            <button className="btn-secondary backup-btn" onClick={() => exportArticles().catch(() => setToast('エクスポート失敗'))}>エクスポート</button>
            <input ref={importArticlesRef} type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try { await importArticles(f); setToast('インポートしました') }
              catch (err) { const m = err instanceof Error ? err.message : ''; if (m !== 'cancelled') setToast(m || 'ファイルが正しくありません') }
            }} />
            <button className="btn-secondary backup-btn" onClick={() => importArticlesRef.current?.click()}>インポート</button>
          </div>
          <div className="backup-row">
            <span className="backup-label">背景画像</span>
            <button className="btn-secondary backup-btn" onClick={() => exportBgImages().catch(() => setToast('エクスポート失敗'))}>エクスポート</button>
            <input ref={importBgRef} type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try { await importBgImages(f); setToast('インポートしました') }
              catch (err) { const m = err instanceof Error ? err.message : ''; if (m !== 'cancelled') setToast(m || 'ファイルが正しくありません') }
            }} />
            <button className="btn-secondary backup-btn" onClick={() => importBgRef.current?.click()}>インポート</button>
          </div>
          <div className="backup-row">
            <span className="backup-label">画像スタンプ</span>
            <button className="btn-secondary backup-btn" onClick={() => exportStampImages().catch(() => setToast('エクスポート失敗'))}>エクスポート</button>
            <input ref={importStampRef} type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try { await importStampImages(f); setToast('インポートしました') }
              catch (err) { const m = err instanceof Error ? err.message : ''; if (m !== 'cancelled') setToast(m || 'ファイルが正しくありません') }
            }} />
            <button className="btn-secondary backup-btn" onClick={() => importStampRef.current?.click()}>インポート</button>
          </div>
        </div>
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
