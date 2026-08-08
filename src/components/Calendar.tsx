import { useState } from 'react'
import type { LogEntry } from '../types'

interface Props {
  logs: Record<string, LogEntry>
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function DayCell({ d, log, isToday }: { d: number; log?: LogEntry; isToday: boolean }) {
  if (!d) return <div />
  if (log?.type === 'rest') {
    return (
      <div className={`cal-day logged rest${isToday ? ' today' : ''}`}>
        <div className="cal-stamp" />
        <span className="cal-day-num">{d}</span>
      </div>
    )
  }
  if (log?.type === 'write') {
    return (
      <div className={`cal-day logged write${isToday ? ' today' : ''}`}>
        <div className="cal-write-stamp" />
        <span className="cal-write-day-num">{d}</span>
      </div>
    )
  }
  return <div className={`cal-day${isToday ? ' today' : ''}`}>{d}</div>
}

function WeekView({ logs }: Props) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const today = now.getDate()
  const dow = now.getDay() // 0=日

  // 今週の日曜日から土曜日
  const cells = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(y, m, today - dow + i)
    const d = date.getDate()
    const key = dateKey(date.getFullYear(), date.getMonth(), d)
    const isToday = i === dow
    cells.push(
      <DayCell key={key} d={d} log={logs[key]} isToday={isToday} />
    )
  }

  return (
    <div className="calendar-block">
      <div className="calendar-grid">
        {DAY_LABELS.map(l => <div key={l} className="cal-day-label">{l}</div>)}
        {cells}
      </div>
    </div>
  )
}

function MonthView({ logs, onClose }: Props & { onClose: () => void }) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const today = now.getDate()
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />)
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d)
    cells.push(<DayCell key={key} d={d} log={logs[key]} isToday={d === today} />)
  }

  return (
    <div className="month-overlay" onClick={onClose}>
      <div className="month-popup" onClick={e => e.stopPropagation()}>
        <div className="month-popup-header">
          <span className="calendar-header">{y}年{m + 1}月</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="calendar-grid">
          {DAY_LABELS.map(l => <div key={l} className="cal-day-label">{l}</div>)}
          {cells}
        </div>
      </div>
    </div>
  )
}

export function Calendar({ logs }: Props) {
  const [showMonth, setShowMonth] = useState(false)
  const now = new Date()

  return (
    <>
      <div className="calendar-week-wrap">
        <button className="calendar-month-btn" onClick={() => setShowMonth(true)}>
          {now.getFullYear()}年{now.getMonth() + 1}月 ▾
        </button>
        <WeekView logs={logs} />
      </div>
      {showMonth && <MonthView logs={logs} onClose={() => setShowMonth(false)} />}
    </>
  )
}
