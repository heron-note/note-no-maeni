import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'

export function Reaction() {
  const user = useAppStore(s => s.user)
  const logToday = useAppStore(s => s.logToday)
  const goHome = useAppStore(s => s.goHome)

  const ch = user?.character ?? 'kuma'
  const text = (window as any).__reactionText ?? 'よく選べたね。'

  const handleDone = () => {
    logToday('write')
    goHome()
  }

  return (
    <div className="screen-inner">
      <div className="chara-block">
        <img className="chara-img chara-lg" src={charImgPath(ch, 'write')} alt="相棒" />
      </div>
      <div className="bubble">
        <p className="reaction-text">{text}</p>
      </div>
      <a
        href="https://note.com/notes/new"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary wide btn-note"
        onClick={handleDone}
      >
        noteを開く ↗
      </a>
      <button className="btn-secondary wide" onClick={handleDone}>
        今日もひとつ、選べたね
      </button>
    </div>
  )
}
