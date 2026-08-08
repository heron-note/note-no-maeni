import type { Bookmark } from '../types'
import { todayStr } from './storage'

export function selectRecommend(bookmarks: Bookmark[]): Bookmark | null {
  if (bookmarks.length === 0) return null

  const today = todayStr()
  const eligible = bookmarks.filter(b => b.lastRecommendedDate !== today)
  if (eligible.length === 0) {
    return bookmarks[Math.floor(Math.random() * bookmarks.length)]
  }

  const weights = eligible.map(b => {
    const base = b.lastRecommendedDate
      ? Math.max(1, Math.floor(
          (new Date(today).getTime() - new Date(b.lastRecommendedDate).getTime())
          / (1000 * 60 * 60 * 24)
        ) * 10)
      : 100
    return base * (1 + (b.priority ?? 0) * 0.5)
  })

  const total = weights.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < eligible.length; i++) {
    rand -= weights[i]
    if (rand <= 0) return eligible[i]
  }
  return eligible[eligible.length - 1]
}

export function recordRecommend(bookmarks: Bookmark[], id: string): Bookmark[] {
  const today = todayStr()
  return bookmarks.map(b =>
    b.id === id
      ? { ...b, recommendCount: b.recommendCount + 1, lastRecommendedDate: today }
      : b
  )
}
