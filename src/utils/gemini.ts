import { storage } from './storage'

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

export interface GeminiModel {
  id: string   // e.g. "gemini-2.0-flash"
  name: string // display name
}

export async function fetchGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.models as { name: string; displayName?: string; supportedGenerationMethods?: string[] }[])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({
      id: m.name.replace('models/', ''),
      name: m.displayName ?? m.name.replace('models/', ''),
    }))
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

  const model = storage.loadGeminiModel() || 'gemini-1.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
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
    if (res.status === 401 || raw.includes('API_KEY_INVALID')) throw new Error('APIキーが無効です。チャット画面で再入力してください。')
    if (raw.includes('no longer available') || raw.includes('not found for API version')) throw new Error('MODEL_UNAVAILABLE')
    if (raw.includes('free_tier') || raw.includes('Quota exceeded')) {
      const retryMatch = raw.match(/retry in ([\d.]+)s/)
      const retryMsg = retryMatch ? `約${Math.ceil(Number(retryMatch[1]))}秒後に再試行してください。` : '時間をおいて再試行してください。'
      throw new Error(`無料枠の上限に達しました。${retryMsg}`)
    }
    if (res.status === 429) throw new Error('リクエストが多すぎます。しばらくしてから再試行してください。')
    throw new Error(raw)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) throw new Error('応答が空でした')
  return text
}
