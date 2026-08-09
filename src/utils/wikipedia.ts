export interface WikiHint {
  title: string
  extract: string
  pageUrl: string
}

const FALLBACKS: WikiHint[] = [
  { title: 'まず1行', extract: '完璧な文章より、まず1行。書き始めることがいちばん大事。', pageUrl: '' },
  { title: '継続のコツ', extract: '毎日少しずつ続けることが、長期的な成長につながる。', pageUrl: '' },
  { title: '雑談から生まれるアイデア', extract: '日常の何気ない会話の中に、記事のタネが眠っていることが多い。', pageUrl: '' },
]

async function fetchOnce(): Promise<WikiHint | null> {
  const res = await fetch('https://ja.wikipedia.org/api/rest_v1/page/random/summary')
  if (!res.ok) return null
  const data = await res.json()
  const extract: string = data.extract ?? ''
  if (extract.length < 40) return null  // 短すぎる記事はスキップ
  if (/曖昧さ回避|一覧|号線|系統|年の/.test(data.title)) return null
  return {
    title: data.title,
    extract: extract.length > 120 ? extract.slice(0, 120) + '…' : extract,
    pageUrl: data.content_urls?.desktop?.page ?? '',
  }
}

export async function fetchWikiHint(): Promise<WikiHint> {
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
