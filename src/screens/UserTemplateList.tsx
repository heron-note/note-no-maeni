import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { useSlideBack } from '../hooks/useSlideBack'
import { Toast } from '../components/Toast'
import { USER_TEMPLATE_MAX } from '../types'
import type { UserTemplate } from '../types'

export function UserTemplateList() {
  const goTo = useAppStore(s => s.goTo)
  const setEditingId = useAppStore(s => s.setEditingUserTemplateId)
  const { closing, handleBack } = useSlideBack(() => goTo('home'))

  const [templates, setTemplates] = useState<UserTemplate[]>(() => storage.loadUserTemplates())
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleAdd = () => {
    setEditingId(null)
    goTo('user-template-editor')
  }

  const handleEdit = (id: string) => {
    setEditingId(id)
    goTo('user-template-editor')
  }

  const handleDelete = (id: string) => {
    const next = templates.filter(t => t.id !== id)
    storage.saveUserTemplates(next)
    setTemplates(next)
    setConfirmDeleteId(null)
    setToast('削除しました')
  }

  return (
    <div className={`screen-scroll${closing ? ' screen-slide-out' : ''}`}>
      <div className="subscreen-header" style={{flexDirection:'column', alignItems:'flex-start', gap:4}}>
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
          <h2 className="subscreen-title">テンプレート管理</h2>
        </div>
        <p className="hint" style={{margin:0}}>書く時にコピーして使えるテンプレート（最大{USER_TEMPLATE_MAX}件）</p>
      </div>

      <div className="utpl-list">
        {templates.length === 0 && (
          <p className="utpl-empty">テンプレートがまだありません</p>
        )}
        {templates.map(t => (
          <div key={t.id} className="utpl-item">
            {confirmDeleteId === t.id ? (
              <div className="utpl-confirm">
                <span className="utpl-confirm-text">「{t.title}」を削除しますか？</span>
                <button className="utpl-confirm-yes" onClick={() => handleDelete(t.id)}>削除</button>
                <button className="utpl-confirm-no" onClick={() => setConfirmDeleteId(null)}>キャンセル</button>
              </div>
            ) : (
              <>
                <button className="utpl-item-body" onClick={() => handleEdit(t.id)}>
                  <span className="utpl-title">{t.title}</span>
                  <span className="utpl-lines">{t.lines.filter(l => l).length}行</span>
                </button>
                <button className="utpl-delete-btn" onClick={() => setConfirmDeleteId(t.id)} aria-label="削除">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6m4-6v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <button
        className="btn-primary wide"
        onClick={handleAdd}
        disabled={templates.length >= USER_TEMPLATE_MAX}
      >
        {templates.length >= USER_TEMPLATE_MAX
          ? `上限${USER_TEMPLATE_MAX}件に達しました`
          : '+ 新しいテンプレートを追加'}
      </button>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
