import React from 'react'
import type { LogEntry } from '../types'

interface Props {
  logs: Record<string, LogEntry>
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function Calendar({ logs }: Props) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: React.ReactElement[] = []

  // 空白セル
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const log = logs[key]
    const isToday = d === today
    const cls = ['cal-day', isToday && 'today', log && `logged ${log.type}`]
      .filter(Boolean).join(' ')
    cells.push(<div key={key} className={cls}>{d}</div>)
  }

  return (
    <div className="calendar-block">
      <div className="calendar-header">{year}年{month + 1}月</div>
      <div className="calendar-grid">
        {DAY_LABELS.map(d => <div key={d} className="cal-day-label">{d}</div>)}
        {cells}
      </div>
    </div>
  )
}
