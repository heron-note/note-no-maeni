import { useState, useRef, useEffect } from 'react'
import { sendGeminiMessage, fetchGeminiModels } from '../utils/gemini'
import { storage } from '../utils/storage'
import type { ChatMessage, GeminiModel } from '../utils/gemini'

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
  const [models, setModels] = useState<GeminiModel[]>([])
  const [selectedModel, setSelectedModel] = useState(() => storage.loadGeminiModel() ?? '')
  const [fetchingModels, setFetchingModels] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const personality = storage.loadCharPersonality()
  const hasKey = apiKey !== ''

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!apiKey) return
    fetchGeminiModels(apiKey)
      .then(list => {
        if (list.length === 0) return
        setModels(list)
        const saved = storage.loadGeminiModel()
        const matched = saved ? list.find(m => m.id === saved) : null
        const chosen = matched ?? list[0]
        setSelectedModel(chosen.id)
        storage.saveGeminiModel(chosen.id)
      })
      .catch(() => {}) // エラーは無視（チャット自体は使える）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  const handleSaveKey = async () => {
    const k = keyInput.trim()
    if (!k) { setKeyError('APIキーを入力してください'); return }
    setFetchingModels(true)
    setKeyError(null)
    try {
      const list = await fetchGeminiModels(k)
      if (list.length === 0) { setKeyError('利用可能なモデルが見つかりませんでした'); return }
      storage.saveGeminiKey(k)
      setApiKey(k)
      setModels(list)
      // 保存済みモデルが一覧にあればそれを使う、なければ先頭を選択
      const saved = storage.loadGeminiModel()
      const matched = saved ? list.find(m => m.id === saved) : null
      const chosen = matched ?? list[0]
      setSelectedModel(chosen.id)
      storage.saveGeminiModel(chosen.id)
      setKeyInput('')
    } catch {
      setKeyError('APIキーが無効か、接続に失敗しました')
    } finally {
      setFetchingModels(false)
    }
  }

  const handleModelChange = (id: string) => {
    setSelectedModel(id)
    storage.saveGeminiModel(id)
  }

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 260)
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
    <div className={`chat-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="chat-sheet" onClick={e => e.stopPropagation()}>
        <div className="chat-header">
          <span className="chat-title">AIに相談する</span>
          <button className="icon-btn" onClick={handleClose}>✕</button>
        </div>

        {!hasKey && (
          <div className="chat-no-key">
            <p className="chat-no-key-title">Gemini APIキーを入力してください</p>
            <p className="chat-no-key-desc">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                Google AI Studio で無料取得 →
              </a>
            </p>
            <input
              type="password"
              className="text-input"
              placeholder="AIzaSy..."
              autoComplete="off"
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setKeyError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveKey() }}
            />
            {keyError && <p className="chat-error">{keyError}</p>}
            <button className="btn-primary wide" onClick={handleSaveKey} disabled={fetchingModels}>
              {fetchingModels ? 'モデルを確認中...' : '保存して始める'}
            </button>
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

            {(models.length > 0 || selectedModel) && (
              <div className="chat-model-row">
                {models.length > 0 ? (
                  <select
                    className="chat-model-select"
                    value={selectedModel}
                    onChange={e => handleModelChange(e.target.value)}
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="chat-model-label">{selectedModel}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
