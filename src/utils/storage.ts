import type { User, LogEntry, Template, Bookmark } from '../types'

const SK = {
  user: 'nob_user',
  logs: 'nob_logs',
  template: 'nob_template',
} as const

function safeLoad<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

export const storage = {
  loadUser: ()         => safeLoad<User>(SK.user),
  saveUser: (v: User)  => localStorage.setItem(SK.user, JSON.stringify(v)),

  loadLogs: ()                          => safeLoad<Record<string, LogEntry>>(SK.logs) ?? {},
  saveLogs: (v: Record<string, LogEntry>) => localStorage.setItem(SK.logs, JSON.stringify(v)),

  loadTemplate: ()           => safeLoad<Template>(SK.template),
  saveTemplate: (v: Template) => localStorage.setItem(SK.template, JSON.stringify(v)),

  loadSoundEnabled: () => localStorage.getItem('nob_sound') !== 'off',
  saveSoundEnabled: (v: boolean) => localStorage.setItem('nob_sound', v ? 'on' : 'off'),

  loadBookmarks: () => safeLoad<Bookmark[]>('nob_bookmarks') ?? [],
  saveBookmarks: (v: Bookmark[]) => localStorage.setItem('nob_bookmarks', JSON.stringify(v)),
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
