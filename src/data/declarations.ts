import type { Declaration } from '../types'

// フォールバック用（JSONロード失敗時）
const FALLBACK_REST: string[] = [
  '今日は休む。それもひとつの、正しい選択。',
  '本日のnote活動、終了！',
  'そうだ、今日note休もう。',
  'これでいいのだ。書かなくても、これでいいのだ。',
]

const FALLBACK_WRITE = {
  normal: [
    '{name}、書こうとしてる。それだけでもう十分偉い。',
    '1行でいい。書き出したら、続くもんだよ。',
    '{name}の言葉を待ってる人が、きっといる。',
  ],
  rare: [
    '今日の{name}にしか書けないことがある。',
    '書けない日があっても、書いた日は絶対残る。応援してる！',
  ],
  superRare: [
    'まじか、書くのか！やるじゃん{name}！！',
  ],
}

interface ContentConfig {
  restDeclarations: string[]
  writeReactions: { normal: string[]; rare: string[]; superRare: string[] }
}

let cache: ContentConfig | null = null

async function loadContentConfig(): Promise<ContentConfig> {
  if (cache) return cache
  try {
    const res = await fetch('/content-config.json', { cache: 'no-store' })
    if (res.ok) cache = await res.json()
  } catch {
    // ignore
  }
  return cache ?? { restDeclarations: FALLBACK_REST, writeReactions: FALLBACK_WRITE }
}

export function prefetchContentConfig(): void {
  if (!cache) loadContentConfig()
}

export const STAMP_COLORS = [
  '#6B8A52',
  '#4E7AB8',
  '#C86E38',
  '#3E8E8E',
  '#7A62A8',
  '#7A7A7A',
]

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export async function pickDeclaration(): Promise<Declaration> {
  const cfg = await loadContentConfig()
  const texts = cfg.restDeclarations.length ? cfg.restDeclarations : FALLBACK_REST
  const text = pickRandom(texts)
  return { id: `rest_${Date.now()}`, text }
}

export function pickStampColor(): string {
  return pickRandom(STAMP_COLORS)
}

export async function pickWriteReaction(name: string): Promise<string> {
  const cfg = await loadContentConfig()
  const wr = cfg.writeReactions
  const p = Math.random()
  const pool =
    p < 0.05 ? (wr.superRare.length ? wr.superRare : FALLBACK_WRITE.superRare) :
    p < 0.20 ? (wr.rare.length       ? wr.rare       : FALLBACK_WRITE.rare)      :
               (wr.normal.length      ? wr.normal      : FALLBACK_WRITE.normal)
  return pickRandom(pool).replace(/{name}/g, name ? `${name}さん` : 'きみ')
}
