import { useAppStore } from '../store/useAppStore'
import { useSlideBack } from '../hooks/useSlideBack'

// LP管理画面（仮）。仕様書 docs/LP作成機能_仕様書.md 参照。
// ブロック編集・記事管理・デプロイ等はこれから実装する。
export function LpEditor() {
  const goHome = useAppStore(s => s.goHome)
  const { closing, handleBack } = useSlideBack(goHome)

  return (
    <div className={`screen-scroll${closing ? ' screen-slide-out' : ''}`}>
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
          <h2 className="subscreen-title">LP管理</h2>
        </div>
      </div>

      <div className="settings-row">
        <p className="settings-hint">準備中です。もうしばらくお待ちください。</p>
      </div>
    </div>
  )
}
