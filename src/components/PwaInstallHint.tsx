import { useState } from 'react'

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

  if (isStandalone()) return null

  return (
    <>
      <button className="pwa-hint-btn" onClick={() => setOpen(true)} aria-label="アプリをホーム画面に追加">
        <span className="pwa-hint-excl">!</span>
      </button>

      {open && (
        <div className="pwa-hint-overlay" onClick={() => setOpen(false)}>
          <div className="pwa-hint-panel" onClick={e => e.stopPropagation()}>
            <button className="pwa-hint-close" onClick={() => setOpen(false)}>✕</button>

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

            <button className="btn-primary wide" onClick={() => setOpen(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  )
}
