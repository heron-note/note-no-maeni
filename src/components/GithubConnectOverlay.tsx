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
      await syncIdbOnConnect(token, owner)
      useAppStore.getState().init()
    } catch {
      // 失敗しても、以降の通常の自動同期（storage.ts / idbSync.ts）で再試行されるため、
      // ここではユーザーに見せるエラーは出さない。
    }
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
  const abortRef = useRef<AbortController | null>(null)

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
              <p className="github-user-code">{device.user_code}</p>
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
