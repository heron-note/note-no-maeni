import type { User, LogEntry, Template, Bookmark, UserTemplate, RestTemplate } from '../types'
import { pushLocalSettings, checkDataRepoValid } from './github'
import { collectData } from './transfer'

const SK = {
  user: 'nob_user',
  logs: 'nob_logs',
  template: 'nob_template',
  userTemplates: 'nob_user_templates',
  restTemplates: 'nob_rest_templates',
  lastRestTplId: 'nob_last_rest_tpl',
  lastUserTplId: 'nob_last_user_tpl',
  includeTodayEvent: 'nob_include_today_event',
} as const

function safeLoad<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

const rawStorage = {
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

  loadIncludeTodayEvent: () => localStorage.getItem(SK.includeTodayEvent) === 'true',
  saveIncludeTodayEvent: (v: boolean) => localStorage.setItem(SK.includeTodayEvent, v ? 'true' : 'false'),

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

  // GitHub連携。意図的に nob_ プレフィックスを付けない
  // （collectData() のバックアップ対象・GitHub同期対象から除外し、トークンをそれ自体に含めないため）。
  loadGithubAuth: (): { token: string; username: string } | null => {
    const token = localStorage.getItem('ghauth_token')
    const username = localStorage.getItem('ghauth_username')
    return token && username ? { token, username } : null
  },
  saveGithubAuth: (token: string, username: string) => {
    localStorage.setItem('ghauth_token', token)
    localStorage.setItem('ghauth_username', username)
  },
  clearGithubAuth: () => {
    localStorage.removeItem('ghauth_token')
    localStorage.removeItem('ghauth_username')
  },
}

// ─── GitHub自動同期（仕様書10章: ローカルファースト方針） ───────────────────
//
// rawStorage の save* 系関数はすべて、呼ばれるたびに（デバウンスして）GitHubへの
// 同期を試みる。どの画面・どの保存操作から呼ばれても漏れなく効くよう、個別の
//呼び出し箇所に同期コードを書き足すのではなく、この一箇所だけに実装する。

type SyncListener = () => void
const authClearedListeners: SyncListener[] = []

/** 有効チェックの結果、GitHub連携が解除された時に呼ばれる（Zustandストア等が状態を追従させるため）。 */
export function onGithubAuthCleared(cb: SyncListener): void {
  authClearedListeners.push(cb)
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleGithubSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    const auth = rawStorage.loadGithubAuth()
    if (!auth) return
    try {
      await pushLocalSettings(auth.token, auth.username, collectData())
    } catch {
      const valid = await checkDataRepoValid(auth.token, auth.username).catch(() => false)
      if (!valid) {
        rawStorage.clearGithubAuth()
        authClearedListeners.forEach(cb => cb())
      }
    }
  }, 2000)
}

const SYNC_EXCLUDED_KEYS = new Set(['saveGithubAuth', 'clearGithubAuth'])

export const storage = new Proxy(rawStorage, {
  get(target, prop) {
    const value = target[prop as keyof typeof target]
    if (typeof prop === 'string' && prop.startsWith('save') && !SYNC_EXCLUDED_KEYS.has(prop) && typeof value === 'function') {
      return (...args: unknown[]) => {
        // @ts-expect-error 呼び出し元の引数をそのまま転送する汎用ラッパー
        const result = value(...args)
        scheduleGithubSync()
        return result
      }
    }
    return value
  },
})

export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
