import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { Calendar } from '../components/Calendar'

export function AlreadyDone() {
  const user = useAppStore(s => s.user)
  const logs = useAppStore(s => s.logs)
  const goTo = useAppStore(s => s.goTo)
  const setSettingsFrom = useAppStore(s => s.setSettingsFrom)

  const ch = user?.character ?? 'kuma'

  return (
    <div className="screen-inner">
      <div className="top-bar">
        <button className="icon-btn" onClick={() => { setSettingsFrom('already'); goTo('settings') }}>⚙</button>
      </div>
      <div className="chara-block">
        <img className="chara-img chara-lg" src={charImgPath(ch, 'watch')} alt="相棒" />
      </div>
      <p className="greeting">おかえり。</p>
      <p className="greeting-sub">今日はもう十分やったんじゃない？</p>
      <Calendar logs={logs} />
      <button className="btn-secondary wide" onClick={() => goTo('home')}>
        閉じる
      </button>
    </div>
  )
}
