import { useState, useRef, useEffect } from 'react'
import { sendGeminiMessage } from '../utils/gemini'
import { storage } from '../utils/storage'
import type { ChatMessage } from '../utils/gemini'

interface Props {
  userName: string
  onClose: () => void
  onGoSettings: () => void
}

const SYSTEM_PROMPT = (name: string) =>
  `あなたはnoteクリエイターの創作を応援するAIアシスタントです。${name ? `ユーザーの名前は${name}さんです。` : ''}noteの記事ネタ出し、構成案の相談、文章の壁打ちなど、noteを書く活動全般をサポートしてください。フレンドリーで親しみやすい口調で会話してください。`

export function ChatOverlay({ userName, onClose, onGoSettings }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const apiKey = storage.loadGeminiKey()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 260)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    if (!apiKey) { setError('設定画面でGemini APIキーを入力してください'); return }

    const next: ChatMessage[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const reply = await sendGeminiMessage(apiKey, messages, text, SYSTEM_PROMPT(userName))
      setMessages([...next, { role: 'model', text: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className={`chat-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="chat-sheet" onClick={e => e.stopPropagation()}>
        <div className="chat-header">
          <span className="chat-title">AIに相談する</span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>

        {!apiKey && (
          <div className="chat-no-key">
            <p>Gemini APIキーが設定されていません。</p>
            <button className="btn-primary wide" onClick={onGoSettings}>設定画面へ</button>
          </div>
        )}

        {apiKey && (
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
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
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
