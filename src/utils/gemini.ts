// 優先モデル順（無料・高速なものを先頭に）
const PREFERRED_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
]

let resolvedModel: string | null = null

async function getModel(apiKey: string): Promise<string> {
  if (resolvedModel) return resolvedModel

  // ai-config.json で手動指定があればそれを優先
  try {
    const cfgRes = await fetch(`${import.meta.env.BASE_URL}ai-config.json`, { cache: 'no-store' })
    if (cfgRes.ok) {
      const cfg = await cfgRes.json()
      if (cfg.aiModel) {
        resolvedModel = cfg.aiModel
        return resolvedModel
      }
    }
  } catch {
    // ignore
  }

  // Groq API から利用可能なモデルを取得して自動選択
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = await res.json()
      const ids: string[] = data.data?.map((m: { id: string }) => m.id) ?? []
      for (const pref of PREFERRED_MODELS) {
        if (ids.includes(pref)) {
          resolvedModel = pref
          return resolvedModel
        }
      }
      // 優先リストにないときはテキスト系の最初のモデルを使用
      const textModel = ids.find((id: string) =>
        !id.includes('whisper') && !id.includes('guard') &&
        !id.includes('orpheus') && !id.includes('safeguard') &&
        !id.includes('tts'),
      )
      if (textModel) {
        resolvedModel = textModel
        return resolvedModel
      }
    }
  } catch {
    // ignore
  }

  // 取得失敗時はキャッシュせず次回再試行できるようにする
  return PREFERRED_MODELS[0]
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
  const modelName = await getModel(apiKey)

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
