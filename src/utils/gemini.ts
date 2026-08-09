import { GoogleGenerativeAI } from '@google/generative-ai'

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
  const modelName = await getModel()
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  })

  const chat = model.startChat({
    history: history.map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  })

  try {
    const result = await chat.sendMessage(userText)
    const text = result.response.text()
    if (!text) throw new Error('応答が空でした')
    return text
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
      throw new Error('APIキーが無効です。チャット画面で再入力してください。')
    }
    if (msg.includes('429') || msg.includes('Quota') || msg.includes('quota')) {
      const retryMatch = msg.match(/retry in ([\d.]+)s/)
      const retryMsg = retryMatch ? `約${Math.ceil(Number(retryMatch[1]))}秒後に再試行してください。` : 'しばらくしてから再試行してください。'
      throw new Error(`リクエスト上限に達しました。${retryMsg}`)
    }
    throw new Error(msg)
  }
}
