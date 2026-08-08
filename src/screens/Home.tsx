import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { Calendar } from '../components/Calendar'
import { pickDeclaration, pickWriteReaction } from '../data/declarations'
import type { ChoiceType } from '../types'

export function Home() {
  const user = useAppStore(s => s.user)
  const logs = useAppStore(s => s.logs)
  const goTo = useAppStore(s => s.goTo)
  const setChoice = useAppStore(s => s.setChoice)
  const setDeclaration = useAppStore(s => s.setDeclaration)
  const setSettingsFrom = useAppStore(s => s.setSettingsFrom)

  const ch = user?.character ?? 'kuma'
  const name = user?.name ?? ''

  const handleChoice = (type: ChoiceType) => {
    setChoice(type)
    if (type === 'write') {
      // reactionテキストはここで決定（ガチャ）
      ;(window as any).__reactionText = pickWriteReaction(name)
      goTo('reaction')
    } else {
      setDeclaration(pickDeclaration())
      goTo('rest')
    }
  }

  return (
    <div className="screen-inner">
      <div className="top-bar">
        <button className="icon-btn" onClick={() => { setSettingsFrom('home'); goTo('settings') }}>⚙</button>
      </div>
      <div className="chara-block">
        <img className="chara-img" src={charImgPath(ch, 'normal')} alt="相棒" />
      </div>
      <div className="greeting-block">
        <p className="greeting">おかえり、{name}。</p>
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
      <Calendar logs={logs} />
    </div>
  )
}
