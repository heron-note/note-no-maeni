export interface TodayEvent {
  title: string
  description: string
}

type MonthData = Record<string, TodayEvent[]>

const cache: Partial<Record<string, MonthData>> = {}

async function loadMonth(month: string): Promise<MonthData> {
  if (cache[month]) return cache[month]!
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}today-events-${month}.json`, { cache: 'no-store' })
    if (res.ok) {
      cache[month] = await res.json()
      return cache[month]!
    }
  } catch {
    // ignore
  }
  return {}
}

function pickRandom2<T>(arr: T[]): T[] {
  if (arr.length <= 2) return arr
  const i = Math.floor(Math.random() * arr.length)
  let j = Math.floor(Math.random() * (arr.length - 1))
  if (j >= i) j++
  return [arr[i], arr[j]]
}

export async function getTodayEvents(date: Date = new Date()): Promise<TodayEvent[]> {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const key = `${mm}-${dd}`
  const data = await loadMonth(mm)
  const events = data[key] ?? []
  return pickRandom2(events)
}
