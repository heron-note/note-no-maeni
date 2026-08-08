import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { StampDisplay } from '../components/StampDisplay'
import { storage } from '../utils/storage'
import { copyToClipboard } from '../utils/template'

export function Rest() {
  const user = useAppStore(s => s.user)
  const declaration = useAppStore(s => s.declaration)
  const logToday = useAppStore(s => s.logToday)
  const goTo = useAppStore(s => s.goTo)

  const ch = user?.character ?? 'kuma'

  const handlePost = () => {
    const template = storage.loadTemplate()
    if (template && template.lines.length > 0) {
      goTo('rest-template')
    } else {
      // テンプレートなし：宣言文をコピー→noteを開く
      copyToClipboard(declaration?.text ?? '').catch(() => {})
      window.open('https://note.com', '_blank', 'noopener,noreferrer')
      logToday('rest', declaration?.id ?? null)
      goTo('already-done')
    }
  }

  const handleSkip = () => {
    logToday('rest', declaration?.id ?? null)
    goTo('already-done')
  }

  return (
    <div className="screen-inner">
      <StampDisplay />
      <div className="declaration-block">
        <p className="declaration-text">{declaration?.text}</p>
      </div>
      <div className="chara-block chara-block-sm">
        <img className="chara-img chara-sm" src={charImgPath(ch, 'rest')} alt="相棒" />
      </div>
      <div className="rest-btns">
        <button className="btn-primary wide" onClick={handlePost}>これを投稿する</button>
        <button className="btn-secondary wide" onClick={handleSkip}>今日は何もしない</button>
      </div>
    </div>
  )
}
