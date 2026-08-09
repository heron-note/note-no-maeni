export interface WikiHint {
  title: string
  extract: string  // カード表示用（短縮）
  pageUrl: string
}

const FALLBACKS: WikiHint[] = [
  { title: 'まず1行', extract: '完璧な文章より、まず1行。書き始めることがいちばん大事。', pageUrl: '' },
  { title: '継続のコツ', extract: '毎日少しずつ続けることが、長期的な成長につながる。', pageUrl: '' },
  { title: '雑談から生まれるアイデア', extract: '日常の何気ない会話の中に、記事のタネが眠っていることが多い。', pageUrl: '' },
]

let cache: Promise<WikiHint> | null = null

async function fetchOnce(): Promise<WikiHint | null> {
  const res = await fetch('https://ja.wikipedia.org/api/rest_v1/page/random/summary')
  if (!res.ok) return null
  const data = await res.json()
  const extract: string = data.extract ?? ''
  if (extract.length < 40) return null
  if (/曖昧さ回避|一覧|号線|系統|年の/.test(data.title)) return null
  return {
    title: data.title,
    extract: extract.length > 120 ? extract.slice(0, 120) + '…' : extract,
    pageUrl: data.content_urls?.desktop?.page ?? '',
  }
}

async function fetchWithRetry(): Promise<WikiHint> {
  for (let i = 0; i < 3; i++) {
    try {
      const hint = await fetchOnce()
      if (hint) return hint
    } catch {
      // retry
    }
  }
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
}

/** スプラッシュ中に呼んでおく。結果をキャッシュする。 */
export function prefetchWikiHint(): void {
  if (!cache) cache = fetchWithRetry()
}

/** キャッシュがあれば即解決、なければ取得する。 */
export function fetchWikiHint(): Promise<WikiHint> {
  if (!cache) cache = fetchWithRetry()
  return cache
}

/** ↻ ボタン用：キャッシュを破棄して再取得する。 */
export function refreshWikiHint(): Promise<WikiHint> {
  cache = fetchWithRetry()
  return cache
}

/** 記事タイトルから本文全文を取得する（モーダル表示用）。 */
export async function fetchFullArticle(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    titles: title,
    format: 'json',
    origin: '*',
    explaintext: 'true',
    exsectionformat: 'plain',
  })
  const res = await fetch(`https://ja.wikipedia.org/w/api.php?${params}`)
  if (!res.ok) throw new Error('fetch failed')
  const data = await res.json()
  const pages = data.query?.pages ?? {}
  const page = Object.values(pages)[0] as { extract?: string }
  return page.extract ?? ''
}
