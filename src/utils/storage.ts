import type { User, LogEntry, Template, Bookmark, UserTemplate, RestTemplate } from '../types'

const SK = {
  user: 'nob_user',
  logs: 'nob_logs',
  template: 'nob_template',
  userTemplates: 'nob_user_templates',
  restTemplates: 'nob_rest_templates',
  lastRestTplId: 'nob_last_rest_tpl',
  lastUserTplId: 'nob_last_user_tpl',
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

  loadUserTemplates: () => safeLoad<UserTemplate[]>(SK.userTemplates) ?? [],
  saveUserTemplates: (v: UserTemplate[]) => localStorage.setItem(SK.userTemplates, JSON.stringify(v)),

  loadRestTemplates: (): RestTemplate[] => {
    const existing = safeLoad<RestTemplate[]>(SK.restTemplates)
    if (existing && existing.length > 0) return existing
    // 旧フォーマット (nob_template) が存在すれば自動マイグレーション
    const old = safeLoad<{ lines: string[]; insertAfterIndex: number }>(SK.template)
    if (old && old.lines && old.lines.length > 0) {
      const migrated: RestTemplate[] = [{
        id: crypto.randomUUID(),
        title: 'デフォルト',
        lines: old.lines,
        insertAfterIndex: old.insertAfterIndex ?? -1,
      }]
      localStorage.setItem(SK.restTemplates, JSON.stringify(migrated))
      return migrated
    }
    return []
  },
  saveRestTemplates: (v: RestTemplate[]) => localStorage.setItem(SK.restTemplates, JSON.stringify(v)),

  loadLastRestTplId: () => localStorage.getItem(SK.lastRestTplId),
  saveLastRestTplId: (id: string) => localStorage.setItem(SK.lastRestTplId, id),

  loadLastUserTplId: () => localStorage.getItem(SK.lastUserTplId),
  saveLastUserTplId: (id: string) => localStorage.setItem(SK.lastUserTplId, id),

  loadSoundEnabled: () => localStorage.getItem('nob_sound') !== 'off',
  saveSoundEnabled: (v: boolean) => localStorage.setItem('nob_sound', v ? 'on' : 'off'),

  loadBookmarks: () => safeLoad<Bookmark[]>('nob_bookmarks') ?? [],
  saveBookmarks: (v: Bookmark[]) => localStorage.setItem('nob_bookmarks', JSON.stringify(v)),

  loadTags: () => safeLoad<import('../types').NoteTag[]>('nob_tags') ?? [],
  saveTags: (v: import('../types').NoteTag[]) => localStorage.setItem('nob_tags', JSON.stringify(v)),

  loadLastLogin: () => localStorage.getItem('nob_last_login'),
  saveLastLogin: (date: string) => localStorage.setItem('nob_last_login', date),

  loadHelpDone: () => localStorage.getItem('nob_help_done') === 'true',
  saveHelpDone: () => localStorage.setItem('nob_help_done', 'true'),

  loadObHelpDone: () => localStorage.getItem('nob_ob_help_done') === 'true',
  saveObHelpDone: () => localStorage.setItem('nob_ob_help_done', 'true'),

  loadGeminiKey: () => localStorage.getItem('nob_gemini_key'),
  saveGeminiKey: (v: string) => localStorage.setItem('nob_gemini_key', v),


  loadCharPersonality: () => localStorage.getItem('nob_char_personality') ?? '',
  saveCharPersonality: (v: string) => localStorage.setItem('nob_char_personality', v),
}

export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
