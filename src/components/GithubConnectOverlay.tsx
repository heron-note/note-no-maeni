import { useEffect, useRef, useState } from 'react'
import { useBottomSheet } from '../hooks/useBottomSheet'
import { requestDeviceCode, pollForAccessToken, ensureDataRepo, pullLocalSettings, pushLocalSettings, DeviceFlowError, type DeviceCodeResponse } from '../utils/github'
import { collectData, applyLocalData } from '../utils/transfer'
import { syncIdbOnConnect } from '../utils/idbSync'

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
        const d = await requestDeviceCode('repo workflow')
        if (controller.signal.aborted) return
        setDevice(d)
        setPhase('waiting')

        const token = await pollForAccessToken(d, { signal: controller.signal })
        if (controller.signal.aborted) return
        setPhase('finalizing')

        const { owner } = await ensureDataRepo(token)
        if (controller.signal.aborted) return

        // 起動時の整合性チェック（仕様書10章）: GitHub側に既にデータがあれば取得して反映、
        // 無ければ初回セットアップとしてローカルの内容をアップロードする。
        const remote = await pullLocalSettings(token, owner)
        if (remote) {
          applyLocalData(remote)
        } else {
          await pushLocalSettings(token, owner, collectData())
        }
        if (controller.signal.aborted) return

        // 記事ストッカー・背景画像・画像スタンプ（IndexedDB）も同様に同期する
        await syncIdbOnConnect(token, owner)
        if (controller.signal.aborted) return

        onConnected(token, owner)
      } catch (e) {
        if (e instanceof DeviceFlowError && e.message === 'cancelled') return
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
