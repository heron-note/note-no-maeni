import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'

export function WriteOverlay({ reactionText, onClose }: {
  reactionText: string
  onClose: () => void
}) {
  const user = useAppStore(s => s.user)
  const logToday = useAppStore(s => s.logToday)
  const ch = user?.character ?? 'kuma'

  const handleDone = () => {
    logToday('write')
    onClose()
  }

  return (
    <div className="stamp-overlay" onClick={onClose}>
      <div className="stamp-overlay-inner" onClick={e => e.stopPropagation()}>
        <div className="chara-block">
          <img className="chara-img chara-lg" src={charImgPath(ch, 'write')} alt="相棒" />
        </div>
        <div className="bubble">
          <p className="reaction-text">{reactionText}</p>
        </div>
        <div className="rest-btns">
          <a
            href="https://note.com"
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
      </div>
    </div>
  )
}
