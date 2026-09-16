import type { User, LogEntry, Template, Bookmark, UserTemplate, RestTemplate } from '../types'
import { pushLocalSettings, pullLocalSettings, checkDataRepoValid } from './github'
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

// ─── 同期中インジケーター ────────────────────────────────────────────────────
// ホーム画面に「同期中」を表示するための、進行中の同期処理数のカウンター。
// 設定・記録の同期（このファイル）と記事・画像の同期（idbSync.ts）の両方から
// withGithubSyncIndicator() で包んで使う。0→1で「開始」、1→0で「終了」を通知する。
type SyncActivityListener = (syncing: boolean) => void
const syncActivityListeners: SyncActivityListener[] = []
let activeSyncCount = 0

export function onGithubSyncActivityChange(cb: SyncActivityListener): void {
  syncActivityListeners.push(cb)
}

export async function withGithubSyncIndicator<T>(fn: () => Promise<T>): Promise<T> {
  activeSyncCount++
  if (activeSyncCount === 1) syncActivityListeners.forEach(cb => cb(true))
  try {
    return await fn()
  } finally {
    activeSyncCount = Math.max(0, activeSyncCount - 1)
    if (activeSyncCount === 0) syncActivityListeners.forEach(cb => cb(false))
  }
}

// リモートの nob_ 設定値をローカルへ取り込む。ローカルに既にあるキーは
// （今まさに保存した値である可能性があるため）上書きしない。無いキーだけ補う。
// nob_logs だけは「日付をキーにしたレコード集合」なので、キー単位ではなく
// 日付単位でマージする（同じ日付はローカル優先、リモートだけにある日付を残す）。
function mergeRemoteIntoLocal(remote: Record<string, string>): void {
  for (const [key, value] of Object.entries(remote)) {
    if (!key.startsWith('nob_') || key === SK.logs) continue
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
  }
  const remoteLogsRaw = remote[SK.logs]
  if (remoteLogsRaw) {
    try {
      const remoteLogs = JSON.parse(remoteLogsRaw) as Record<string, LogEntry>
      const localLogs = rawStorage.loadLogs()
      const merged = { ...remoteLogs, ...localLogs }
      localStorage.setItem(SK.logs, JSON.stringify(merged))
    } catch {
      // リモートのログが壊れている場合は無視（ローカルはそのまま）
    }
  }
}

/**
 * 設定・記録の同期本体。必ずpull→merge→pushの順で行う。pushだけを行うと、
 * まだ他端末の変更を取り込んでいないローカル状態でリモートを丸ごと上書きしてしまい、
 * 他端末側の設定・記録を消してしまう（記事・画像の同期で実際に起きた不具合と同種）。
 * GitHub連携直後の初回同期・保存のたびの自動同期・起動時の同期、すべてここを通す。
 */
export async function syncSettingsWithGithub(): Promise<void> {
  const auth = rawStorage.loadGithubAuth()
  if (!auth) return
  await withGithubSyncIndicator(async () => {
    try {
      const remote = await pullLocalSettings(auth.token, auth.username)
      if (remote) mergeRemoteIntoLocal(remote)
      await pushLocalSettings(auth.token, auth.username, collectData())
    } catch (e) {
      console.error('[GitHub連携] 設定・記録の同期に失敗しました', e)
      const valid = await checkDataRepoValid(auth.token, auth.username).catch(() => false)
      if (!valid) {
        rawStorage.clearGithubAuth()
        authClearedListeners.forEach(cb => cb())
      }
    }
  })
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleGithubSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { void syncSettingsWithGithub() }, 2000)
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
