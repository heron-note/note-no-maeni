import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { Calendar } from '../components/Calendar'

export function Complete() {
  const user = useAppStore(s => s.user)
  const logs = useAppStore(s => s.logs)
  const choice = useAppStore(s => s.choice)
  const goTo = useAppStore(s => s.goTo)

  const ch = user?.character ?? 'kuma'

  return (
    <div className="screen-inner">
      <div className="chara-block">
        <img className="chara-img chara-lg" src={charImgPath(ch, choice ?? 'normal')} alt="相棒" />
      </div>
      <p className="complete-msg">今日もひとつ、選べたね。</p>
      <Calendar logs={logs} />
      <button className="btn-primary wide" onClick={() => goTo('already-done')}>
        閉じる
      </button>
    </div>
  )
}
