import { useEffect, useRef, useState } from 'react'
import { useBottomSheet } from '../hooks/useBottomSheet'
import {
  requestDeviceCode, pollForAccessToken, ensureDataRepo, pullLocalSettings, pushLocalSettings, DeviceFlowError,
  savePendingDeviceFlow, loadPendingDeviceFlow, clearPendingDeviceFlow, type DeviceCodeResponse,
} from '../utils/github'
import { collectData, applyLocalData } from '../utils/transfer'
import { syncIdbOnConnect } from '../utils/idbSync'
import { useAppStore } from '../store/useAppStore'

/**
 * 設定・記録・記事・画像の同期をバックグラウンドで行う。
 * トークン取得＋リポジトリ確認が終わった時点で「連携完了」とし、
 * この重い処理はダイアログを閉じた後も中断せず継続する（画面遷移とは無関係に完了させる）。
 * 完了後、画面に反映するため init() を呼び直す。
 *
 * 設定同期と記事・画像同期は別々のtry/catchにする。片方が失敗しても
 * もう片方の同期が実行されなくなる（＝原因不明のまま画像が一切同期されない）
 * ことを避けるため。失敗した内容はconsoleに出す（原因調査のため。以降は
 * 通常の自動同期で再試行される）。
 */
function syncInBackground(token: string, owner: string): void {
  ;(async () => {
    try {
      const remote = await pullLocalSettings(token, owner)
      if (remote) {
        applyLocalData(remote)
      } else {
        await pushLocalSettings(token, owner, collectData())
      }
    } catch (e) {
      console.error('[GitHub連携] 設定・記録の同期に失敗しました', e)
    }

    try {
      await syncIdbOnConnect(token, owner)
    } catch (e) {
      console.error('[GitHub連携] 記事・画像の同期に失敗しました', e)
    }

    useAppStore.getState().init()
  })()
}

type Phase = 'requesting' | 'waiting' | 'finalizing' | 'error'

export function GithubConnectOverlay({ onConnected, onClose }: {
  onConnected: (token: string, username: string) => void
  onClose: () => void
}) {
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)
  const [phase, setPhase] = useState<Phase>('requesting')
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

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

  const start = () => {
    setPhase('requesting')
    setError(null)
    setDevice(null)

    const controller = new AbortController()
    abortRef.current = controller

    ;(async () => {
      try {
        // ホーム画面に追加したPWA（特にiOS）では、承認ページを開くと外部ブラウザ／
        // アプリ内ブラウザに切り替わり、戻ってきた際にページが再読み込みされて
        // Reactの状態（発行済みのデバイスコード）が失われることがある。
        // その場合は「もう一度試す」を押しても新しいコードを発行し直さず、
        // 承認待ちの既存コードをそのまま使って確認を再開する。
        let d: DeviceCodeResponse
        let deadline: number | undefined
        const pending = loadPendingDeviceFlow()
        if (pending) {
          d = pending.device
          deadline = pending.requestedAt + pending.device.expires_in * 1000
        } else {
          d = await requestDeviceCode('repo workflow')
          if (controller.signal.aborted) return
          savePendingDeviceFlow(d)
        }
        setDevice(d)
        setPhase('waiting')

        const token = await pollForAccessToken(d, { signal: controller.signal, deadline })
        clearPendingDeviceFlow()
        if (controller.signal.aborted) return
        setPhase('finalizing')

        const { owner } = await ensureDataRepo(token)
        if (controller.signal.aborted) return

        // ここで接続完了とする。設定・記録・記事・画像の同期（重い処理になりうる）は
        // バックグラウンドに回し、ダイアログはすぐ閉じられるようにする（仕様書10章）。
        syncInBackground(token, owner)
        onConnected(token, owner)
      } catch (e) {
        if (e instanceof DeviceFlowError && e.message === 'cancelled') return
        if (e instanceof DeviceFlowError && e.message === 'expired_token') clearPendingDeviceFlow()
        setError(e instanceof Error ? e.message : '接続に失敗しました')
        setPhase('error')
      }
    })()
  }

  useEffect(() => {
    start()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              </p>
            </>
          )}

          {phase === 'error' && (
            <>
              <p className="bookmark-error">{error}</p>
              <button className="btn-secondary wide" onClick={start}>もう一度試す</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
