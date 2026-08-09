const FALLBACK_MODEL = 'gemini-2.0-flash'
let resolvedModel: string | null = null

async function getModel(): Promise<string> {
  if (resolvedModel) return resolvedModel
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}ai-config.json`, { cache: 'no-store' })
    if (res.ok) {
      const cfg = await res.json()
      resolvedModel = cfg.geminiModel ?? FALLBACK_MODEL
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
  const contents = [
    ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userText }] },
  ]

  const model = await getModel()
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const raw: string = err?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401 || raw.includes('API_KEY_INVALID')) {
      throw new Error('APIキーが無効です。チャット画面で再入力してください。')
    }
    if (raw.includes('free_tier') || raw.includes('Quota exceeded') || res.status === 429) {
      const retryMatch = raw.match(/retry in ([\d.]+)s/)
      const retryMsg = retryMatch ? `約${Math.ceil(Number(retryMatch[1]))}秒後に再試行してください。` : 'しばらくしてから再試行してください。'
      throw new Error(`リクエスト上限に達しました。${retryMsg}`)
    }
    throw new Error(raw)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) throw new Error('応答が空でした')
  return text
}
