import { useState } from 'react'
import { useBottomSheet } from '../hooks/useBottomSheet'
import { getConnectLog, formatConnectLog } from '../utils/syncLog'

/**
 * GitHub初回連携時のログを表示する。iPhone実機ではconsole.log等を確認する
 * 手段が無く、サポート（開発者）が直接デバイスを触れない状況でも状況を
 * 伝えられるよう、コピーしてそのまま貼り付けられる形にする。
 */
export function SyncLogOverlay({ onClose }: { onClose: () => void }) {
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)
  const [copied, setCopied] = useState(false)
  const entries = getConnectLog()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatConnectLog())
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`stamp-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div ref={sheetRef} className={`bookmark-editor${closing ? ' sheet-leaving' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="sheet-drag-handle-area" {...dragHandleProps}><div className="sheet-drag-handle" /></div>
        <div className="bookmark-editor-header">
          <span className="subscreen-title">連携ログ</span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="github-connect-body">
          {entries.length === 0 ? (
            <p className="settings-hint">記録されたログがありません。</p>
          ) : (
            <>
              <p className="settings-hint">
                直近のGitHub初回連携時の記録です。うまくいかない場合は、コピーしてサポートへ送ってください。
              </p>
              <div className="sync-log-list">
                {entries.map((e, i) => (
                  <div key={i} className={`sync-log-entry${e.level === 'error' ? ' sync-log-error' : ''}`}>
                    <span className="sync-log-time">{new Date(e.time).toLocaleTimeString('ja-JP')}</span>
                    <span className="sync-log-message">{e.message}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-primary wide" onClick={handleCopy}>
                {copied ? 'コピーしました' : 'ログをコピー'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
