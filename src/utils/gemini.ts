// 優先モデル順（無料・高速なものを先頭に）
const PREFERRED_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
]

const EXCLUDED_KEYWORDS = ['whisper', 'guard', 'orpheus', 'safeguard', 'tts']

// アクセスエラーになったモデルを記録
const failedModels = new Set<string>()
// Groq API から取得したモデル一覧キャッシュ
let availableModels: string[] | null = null
let resolvedModel: string | null = null

async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  if (availableModels) return availableModels
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = await res.json()
      availableModels = (data.data as { id: string }[])
        ?.map(m => m.id)
        .filter(id => !EXCLUDED_KEYWORDS.some(kw => id.includes(kw))) ?? []
      return availableModels
    }
  } catch {
    // ignore
  }
  return []
}

async function getModel(apiKey: string): Promise<string | null> {
  // 現在のモデルがまだ有効なら使い回す
  if (resolvedModel && !failedModels.has(resolvedModel)) return resolvedModel
  resolvedModel = null

  // ai-config.json で手動指定があればそれを優先
  try {
    const cfgRes = await fetch(`${import.meta.env.BASE_URL}ai-config.json`, { cache: 'no-store' })
    if (cfgRes.ok) {
      const cfg = await cfgRes.json()
      if (cfg.aiModel && !failedModels.has(cfg.aiModel)) {
        resolvedModel = cfg.aiModel
        return resolvedModel
      }
    }
  } catch {
    // ignore
  }

  const models = await fetchAvailableModels(apiKey)

  // 優先モデルを順番に試す
  for (const pref of PREFERRED_MODELS) {
    if (failedModels.has(pref)) continue
    if (models.length === 0 || models.includes(pref)) {
      resolvedModel = pref
      return resolvedModel
    }
  }

  // それ以外で使えるモデルがあれば使用
  const fallback = models.find(id => !failedModels.has(id))
  if (fallback) {
    resolvedModel = fallback
    return resolvedModel
  }

  return null
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
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: userText },
  ]

  for (let attempt = 0; attempt < 5; attempt++) {
    const modelName = await getModel(apiKey)
    if (!modelName) throw new Error('利用可能なAIモデルが見つかりませんでした。')

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
      // モデルへのアクセス不可 → 次のモデルで再試行
      if (msg.includes('does not exist') || msg.includes('do not have access')) {
        failedModels.add(modelName)
        resolvedModel = null
        continue
      }
      throw new Error(msg)
    }

    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('応答が空でした')
    return text
  }

  throw new Error('利用可能なAIモデルが見つかりませんでした。')
}
