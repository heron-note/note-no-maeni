const FALLBACK_MODEL = 'llama-3.1-8b-instant'
let resolvedModel: string | null = null

async function getModel(): Promise<string> {
  if (resolvedModel) return resolvedModel
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}ai-config.json`, { cache: 'no-store' })
    if (res.ok) {
      const cfg = await res.json()
      resolvedModel = cfg.aiModel ?? FALLBACK_MODEL
    }
  } catch {
    // ignore
  }
  return resolvedModel ?? FALLBACK_MODEL
}

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

export async function sendGeminiMessage(
  apiKey: string,
  history: ChatMessage[],
  userText: string,
  systemPrompt: string,
): Promise<string> {
  const modelName = await getModel()

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: userText },
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelName, messages }),
  })

  const data = await res.json()

  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401) throw new Error('APIキーが無効です。再入力してください。')
    if (res.status === 429) {
      const retryMatch = msg.match(/retry in ([\d.]+)s/)
      const retryMsg = retryMatch ? `約${Math.ceil(Number(retryMatch[1]))}秒後に再試行してください。` : 'しばらくしてから再試行してください。'
      throw new Error(`リクエスト上限に達しました。${retryMsg}`)
    }
    throw new Error(msg)
  }

  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('応答が空でした')
  return text
}
