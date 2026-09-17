import { useEffect, useRef, useState } from 'react'
import { useBottomSheet } from '../hooks/useBottomSheet'
import { useAppStore } from '../store/useAppStore'

/**
 * GitHub連携（Device Flow）ダイアログ。
 *
 * 連携処理そのもの（デバイスコード取得〜ポーリング〜リポジトリ確認〜バック
 * グラウンド同期）はuseAppStore.startGithubConnect()側で行う。このコンポーネントは
 * その進行状況（githubConnectPhase/Device/Error）を購読して表示するだけの
 * 「ビュー」に徹する。
 *
 * 以前はこの処理全体をこのコンポーネント内で行い、AbortControllerでコンポーネントの
 * unmountに連動して中断させていた。そのため、リポジトリ作成後・連携完了前に
 * ダイアログが閉じる（あるいは何らかの理由で再マウントされる）と、連携処理が
 * 完了を通知する前に静かに止まってしまう不具合があった。connect処理をUIの
 * マウント状態から切り離すことで、ダイアログを閉じても連携は継続し、
 * githubTokenが設定された時点で自動的に閉じるようにする。
 */
export function GithubConnectOverlay({ onClose }: { onClose: () => void }) {
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)
  const phase = useAppStore(s => s.githubConnectPhase)
  const device = useAppStore(s => s.githubConnectDevice)
  const error = useAppStore(s => s.githubConnectError)
  const githubToken = useAppStore(s => s.githubToken)
  const startGithubConnect = useAppStore(s => s.startGithubConnect)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    startGithubConnect() // 既に進行中・連携済みなら何もしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 連携が完了してgithubTokenがセットされたら、このダイアログを開いている間に
  // 限り自動で閉じる。バックグラウンド同期自体はダイアログを閉じても続く。
  const prevTokenRef = useRef(githubToken)
  useEffect(() => {
    if (!prevTokenRef.current && githubToken) onClose()
    prevTokenRef.current = githubToken
  }, [githubToken, onClose])

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // クリップボードAPIが使えない場合は無視（コードは画面に表示済みなので手入力できる）
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
          <span className="subscreen-title">GitHub連携</span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="github-connect-body">
          {phase === 'requesting' && (
            <p className="settings-hint">準備しています…</p>
          )}

          {(phase === 'waiting' || phase === 'finalizing') && device && (
            <>
              <p className="settings-hint">下のコードをコピーして、GitHubのページで入力してください。</p>
              <div className="github-user-code-row">
                <p className="github-user-code">{device.user_code}</p>
                <button type="button" className="btn-secondary" onClick={() => handleCopy(device.user_code)}>
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
              </div>
              <a
                className="btn-primary wide"
                href={device.verification_uri}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHubを開いて承認する
              </a>
              <p className="settings-hint">
                {phase === 'finalizing' ? '連携を完了しています…' : '承認をお待ちしています…（自動で進みます）'}
              </p>
              <p className="settings-hint">
                承認が終わったら、開いた画面の「完了」または「×」を押してこのアプリに戻ってきてください。
                このダイアログを閉じても連携処理は裏側で続きます。
              </p>
            </>
          )}

          {phase === 'error' && (
            <>
              <p className="bookmark-error">{error}</p>
              <button className="btn-secondary wide" onClick={startGithubConnect}>もう一度試す</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
