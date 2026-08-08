import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { Calendar } from '../components/Calendar'
import { StampOverlay } from '../components/StampOverlay'
import { WriteOverlay } from '../components/WriteOverlay'
import { pickDeclaration, pickWriteReaction } from '../data/declarations'
import type { ChoiceType, Declaration } from '../types'

export function Home() {
  const user = useAppStore(s => s.user)
  const logs = useAppStore(s => s.logs)
  const goTo = useAppStore(s => s.goTo)
  const goHome = useAppStore(s => s.goHome)
  const logToday = useAppStore(s => s.logToday)

  const [stampDeclaration, setStampDeclaration] = useState<Declaration | null>(null)
  const [writeReaction, setWriteReaction] = useState<string | null>(null)

  const ch = user?.character ?? 'kuma'
  const name = user?.name ?? ''

  const handleChoice = (type: ChoiceType) => {
    if (type === 'write') {
      setWriteReaction(pickWriteReaction(name))
    } else {
      const decl = pickDeclaration()
      logToday('rest', decl.id)
      setStampDeclaration(decl)
    }
  }

  return (
    <div className="screen-inner">
      <div className="top-bar">
        <button className="icon-btn" onClick={() => goTo('settings')}>⚙</button>
      </div>
      <div className="chara-block">
        <img className="chara-img" src={charImgPath(ch, 'normal')} alt="相棒" />
      </div>
      <div className="greeting-block">
        <p className="greeting">おかえり、{name}さん。</p>
        <p className="greeting-sub">今日のnote、どうする？</p>
      </div>
      <div className="choice-block">
        <button className="choice-btn write" onClick={() => handleChoice('write')}>
          <span className="choice-icon">🟨</span>
          <span className="choice-main">書く</span>
          <span className="choice-sub">1行でも書く</span>
        </button>
        <button className="choice-btn rest" onClick={() => handleChoice('rest')}>
          <span className="choice-icon">🟦</span>
          <span className="choice-main">休む</span>
          <span className="choice-sub">書くプレッシャーをリセット</span>
        </button>
      </div>
      <button className="template-shortcut-btn" onClick={() => goTo('template-editor')}>
        ✏️ 休もっ化計画テンプレートを編集
      </button>
      <Calendar logs={logs} />

      {stampDeclaration && (
        <StampOverlay
          declaration={stampDeclaration}
          onClose={() => { setStampDeclaration(null); goHome() }}
        />
      )}
      {writeReaction && (
        <WriteOverlay
          reactionText={writeReaction}
          onClose={() => { setWriteReaction(null); goHome() }}
        />
      )}
    </div>
  )
}
