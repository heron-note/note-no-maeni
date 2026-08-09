import { useState, useRef, useEffect } from 'react'
import { sendGeminiMessage } from '../utils/gemini'
import { storage } from '../utils/storage'
import type { ChatMessage } from '../utils/gemini'

interface Props {
  userName: string
  onClose: () => void
}

const SYSTEM_PROMPT = (name: string, personality: string) => {
  const parts = [
    'あなたはnoteクリエイターの創作を応援するAIアシスタントです。',
    name ? `ユーザーの名前は${name}さんです。` : '',
    'noteの記事ネタ出し、構成案の相談、文章の壁打ちなど、noteを書く活動全般をサポートしてください。',
    personality
      ? `以下の性格・口調で会話してください：${personality}`
      : 'フレンドリーで親しみやすい口調で会話してください。',
  ]
  return parts.filter(Boolean).join('')
}

export function ChatOverlay({ userName, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [apiKey, setApiKey] = useState(() => storage.loadGeminiKey() ?? '')
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)

  const [showPersonality, setShowPersonality] = useState(false)
  const [personality, setPersonality] = useState(() => storage.loadCharPersonality())
  const hasKey = apiKey !== ''

  const handleSavePersonality = () => {
    storage.saveCharPersonality(personality)
    setShowPersonality(false)
  }

  useEffect(() => {
    if (hasKey) setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSaveKey = () => {
    const k = keyInput.trim()
    if (!k) { setKeyError('APIキーを入力してください'); return }
    storage.saveGeminiKey(k)
    setApiKey(k)
    setKeyInput('')
  }

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 260)
  }

  const handleDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }

  const handleDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`
  }

  const handleDragEnd = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = Math.max(0, e.changedTouches[0].clientY - dragStartY.current)
    dragStartY.current = null
    if (delta > 80) {
      if (sheetRef.current) { sheetRef.current.style.transition = 'transform 0.22s ease'; sheetRef.current.style.transform = 'translateY(100%)' }
      if (overlayRef.current) { overlayRef.current.style.transition = 'opacity 0.22s ease'; overlayRef.current.style.opacity = '0' }
      setTimeout(onClose, 220)
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)'
        sheetRef.current.style.transform = 'translateY(0)'
        setTimeout(() => { if (sheetRef.current) { sheetRef.current.style.transition = ''; sheetRef.current.style.transform = '' } }, 300)
      }
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !hasKey) return

    const next: ChatMessage[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const reply = await sendGeminiMessage(apiKey, messages, text, SYSTEM_PROMPT(userName, personality))
      setMessages([...next, { role: 'model', text: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div ref={overlayRef} className={`chat-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div ref={sheetRef} className="chat-sheet" onClick={e => e.stopPropagation()}>
        <div
          className="chat-header"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div className="chat-drag-handle" />
          <div className="chat-header-row">
            <span className="chat-title">AIに相談する</span>
            <div className="chat-header-actions">
              <button className="icon-btn" onClick={e => { e.stopPropagation(); setShowPersonality(v => !v) }} aria-label="性格・口調設定">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              <button className="icon-btn" onClick={handleClose}>✕</button>
            </div>
          </div>
          {showPersonality && (
            <div className="chat-personality-panel" onClick={e => e.stopPropagation()}>
              <p className="chat-personality-label">AIの性格・口調</p>
              <textarea
                className="chat-personality-input"
                rows={3}
                placeholder="例：明るくてちょっと天然。語尾に「だよ～」をつける"
                value={personality}
                onChange={e => setPersonality(e.target.value)}
              />
              <button className="btn-primary wide" onClick={handleSavePersonality}>保存して閉じる</button>
            </div>
          )}
        </div>

        {!hasKey && (
          <div className="chat-no-key">
            <p className="chat-no-key-title">Groq APIキーを入力してください</p>
            <p className="chat-no-key-desc">
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                Groq Console で無料取得（クレカ不要）→
              </a>
            </p>
            <input
              type="password"
              className="text-input"
              placeholder="gsk_..."
              autoComplete="off"
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setKeyError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveKey() }}
            />
            {keyError && <p className="chat-error">{keyError}</p>}
            <button className="btn-primary wide" onClick={handleSaveKey}>保存して始める</button>
          </div>
        )}

        {hasKey && (
          <>
            <div className="chat-messages">
              {messages.length === 0 && (
                <p className="chat-placeholder">noteのネタ、構成、文章の悩みを気軽に相談してみよう</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`chat-bubble-wrap ${m.role}`}>
                  <div className="chat-bubble">{m.text}</div>
                </div>
              ))}
              {loading && (
                <div className="chat-bubble-wrap model">
                  <div className="chat-bubble chat-loading">
                    <span /><span /><span />
                  </div>
                </div>
              )}
              {error && <p className="chat-error">{error}</p>}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={2}
                placeholder="メッセージを入力..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend() }
                }}
              />
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                aria-label="送信"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
