import type { Bookmark } from '../types'
import { todayStr } from './storage'

export function selectRecommend(bookmarks: Bookmark[]): Bookmark | null {
  if (bookmarks.length === 0) return null

  const today = todayStr()
  const eligible = bookmarks.filter(b => b.lastRecommendedDate !== today)
  if (eligible.length === 0) return null

  const weights = eligible.map(b => {
    if (!b.lastRecommendedDate) return 100
    const daysSince = Math.floor(
      (new Date(today).getTime() - new Date(b.lastRecommendedDate).getTime())
      / (1000 * 60 * 60 * 24)
    )
    return Math.max(1, daysSince * 10)
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
