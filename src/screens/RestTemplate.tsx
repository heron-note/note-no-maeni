import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { buildTemplateHTML, buildPlainText, copyToClipboard } from '../utils/template'
import { Toast } from '../components/Toast'

export function RestTemplate() {
  const declaration = useAppStore(s => s.declaration)
  const logToday = useAppStore(s => s.logToday)
  const goTo = useAppStore(s => s.goTo)
  const [toast, setToast] = useState<string | null>(null)

  const template = storage.loadTemplate()
  const html = template && declaration ? buildTemplateHTML(template, declaration) : ''

  const handleCopyAndOpen = async () => {
    if (template && declaration) {
      await copyToClipboard(buildPlainText(template, declaration)).catch(() => {})
      setToast('コピーしました！')
    }
    window.open('https://note.com', '_blank', 'noopener,noreferrer')
    logToday('rest', declaration?.id ?? null)
    goTo('complete')
  }

  const handleSkip = () => {
    logToday('rest', declaration?.id ?? null)
    goTo('complete')
  }

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <button className="back-btn" onClick={() => goTo('rest')}>← 戻る</button>
        <h2 className="subscreen-title">投稿テンプレート</h2>
        <p className="hint">休もっ化宣言が埋め込まれています</p>
      </div>
      <div
        className="template-preview"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="action-stack">
        <button className="btn-primary wide" onClick={handleCopyAndOpen}>
          コピーしてnoteへ ↗
        </button>
        <button className="btn-secondary wide" onClick={handleSkip}>
          今日は何もしない
        </button>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
