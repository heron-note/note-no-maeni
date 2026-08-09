import { useRef, useState } from 'react'
import { exportData } from '../utils/transfer'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

export function PwaInstallHint() {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)

  if (isStandalone()) return null

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 260)
  }

  const onDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    if (panelRef.current) panelRef.current.style.transition = 'none'
  }
  const onDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current)
    if (panelRef.current) panelRef.current.style.transform = `translateY(${delta}px)`
  }
  const onDragEnd = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.changedTouches[0].clientY - dragStartY.current)
    dragStartY.current = null
    if (delta > 80) {
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform 0.22s ease'
        panelRef.current.style.transform = 'translateY(100%)'
      }
      setTimeout(() => { setOpen(false); setClosing(false) }, 220)
    } else {
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)'
        panelRef.current.style.transform = 'translateY(0)'
        setTimeout(() => { if (panelRef.current) { panelRef.current.style.transition = ''; panelRef.current.style.transform = '' } }, 300)
      }
    }
  }

  return (
    <>
      <button className="pwa-hint-btn" onClick={() => setOpen(true)} aria-label="アプリをホーム画面に追加">
        <span className="pwa-hint-excl">!</span>
      </button>

      {open && (
        <div className={`pwa-hint-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
          <div
            ref={panelRef}
            className="pwa-hint-panel"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="pwa-hint-drag-handle-area"
              onTouchStart={onDragStart}
              onTouchMove={onDragMove}
              onTouchEnd={onDragEnd}
            >
              <div className="pwa-hint-drag-handle" />
            </div>
            <button className="pwa-hint-close" onClick={handleClose}>✕</button>

            <p className="pwa-hint-title">ホーム画面に追加しよう</p>

            <div className="pwa-hint-warning">
              <span className="pwa-hint-warning-icon">⚠️</span>
              <span>ブラウザのまま使うと、<strong>7日間アクセスがないとデータが自動削除</strong>される場合があります。ホーム画面に追加するとデータが守られます。</span>
            </div>

            {isIOS() && (
              <div className="pwa-hint-steps">
                <p className="pwa-hint-os">iPhone / iPad（Safari）</p>
                <ol>
                  <li>画面下部の <strong>共有ボタン（<span className="pwa-hint-symbol">□↑</span>）</strong> をタップ</li>
                  <li>「<strong>ホーム画面に追加</strong>」を選択</li>
                  <li>右上の「<strong>追加</strong>」をタップして完了</li>
                </ol>
                <p className="pwa-hint-note">※ Safariからのみ追加できます</p>
              </div>
            )}

            {isAndroid() && (
              <div className="pwa-hint-steps">
                <p className="pwa-hint-os">Android（Chrome）</p>
                <ol>
                  <li>右上の <strong>メニュー（<span className="pwa-hint-symbol">⋮</span>）</strong> をタップ</li>
                  <li>「<strong>ホーム画面に追加</strong>」または「<strong>アプリをインストール</strong>」を選択</li>
                  <li>「<strong>追加</strong>」をタップして完了</li>
                </ol>
              </div>
            )}

            {!isIOS() && !isAndroid() && (
              <div className="pwa-hint-steps">
                <p className="pwa-hint-os">PC（Chrome / Edge）</p>
                <ol>
                  <li>アドレスバー右端の <strong>インストールアイコン</strong> をクリック</li>
                  <li>「<strong>インストール</strong>」をクリックして完了</li>
                </ol>
              </div>
            )}

            <div className="pwa-hint-export">
              <p className="pwa-hint-export-title">データを引き継ぐ方法</p>
              <p className="pwa-hint-export-desc">
                ブラウザ版でエクスポートしたデータを、ホーム画面追加版の設定画面からインポートすることでデータを復元できます。
              </p>
              <button className="btn-secondary wide" onClick={() => exportData().catch(() => {})}>
                設定をエクスポート
              </button>
            </div>

            <button className="btn-primary wide" onClick={handleClose}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  )
}
