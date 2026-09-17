import type { User, LogEntry, Template, Bookmark, UserTemplate, RestTemplate, CustomCompanion } from '../types'
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
  customCompanions: 'nob_custom_companions',
} as const

const LEGACY_CUSTOM_IMG_KEYS = ['normal', 'write', 'rest'] as const

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

  // カスタム相棒（複数対応）。旧フォーマット（nob_custom_img_normal/write/rest の
  // 3キーに1体だけ保存）が残っていれば、初回アクセス時に自動マイグレーションする。
  loadCustomCompanions: (): CustomCompanion[] => {
    const existing = safeLoad<CustomCompanion[]>(SK.customCompanions)
    if (existing !== null) return existing
    const legacy = LEGACY_CUSTOM_IMG_KEYS.map(k => localStorage.getItem(`nob_custom_img_${k}`))
    if (!legacy.every(v => v)) return []
    const migrated: CustomCompanion[] = [{
      id: crypto.randomUUID(),
      label: 'マイキャラ',
      normal: legacy[0]!,
      write: legacy[1]!,
      rest: legacy[2]!,
      createdAt: Date.now(),
    }]
    localStorage.setItem(SK.customCompanions, JSON.stringify(migrated))
    LEGACY_CUSTOM_IMG_KEYS.forEach(k => localStorage.removeItem(`nob_custom_img_${k}`))
    const user = safeLoad<User>(SK.user)
    if (user && user.character === 'custom') {
      user.character = `custom:${migrated[0].id}`
      localStorage.setItem(SK.user, JSON.stringify(user))
    }
    return migrated
  },
  saveCustomCompanions: (v: CustomCompanion[]) => localStorage.setItem(SK.customCompanions, JSON.stringify(v)),

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
// zip一括復元（idbSync.ts）からも使うため export する。
const LEGACY_CUSTOM_IMG_FULL_KEYS = LEGACY_CUSTOM_IMG_KEYS.map(k => `nob_custom_img_${k}`)

export function mergeRemoteIntoLocal(remote: Record<string, string>): void {
  for (const [key, value] of Object.entries(remote)) {
    if (!key.startsWith('nob_') || key === SK.logs || key === SK.customCompanions) continue
    // 旧形式のカスタム相棒キー（nob_custom_img_*）は下の専用処理でしか扱わない。
    // まだ新形式に移行していない端末（アプリ未更新）が押し戻してくることがあるため、
    // ここで無条件に「無ければ補う」をしてしまうと、新形式へ移行済みの端末では
    // 既に消したはずのキーが復活し、しかも配列側には二度と取り込まれない孤立データになる。
    if (LEGACY_CUSTOM_IMG_FULL_KEYS.includes(key)) continue
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

  // カスタム相棒はキー単位（配列まるごと）ではなく、相棒ID単位でマージする。
  // 他のnob_設定と同じ「ローカルに無ければ補う」方式だと、別端末で作った
  // 別のカスタム相棒が一切取り込まれない（配列全体が「既にある」とみなされ無視される）。
  // 逆に単純に上書きすると、今使っているカスタム相棒が消えてしまう。
  // そのためIDで突き合わせ、ローカルに無いIDだけ追加するユニオンマージにする。
  const remoteCompanionsRaw = remote[SK.customCompanions]
  if (remoteCompanionsRaw) {
    try {
      const remoteCompanions = JSON.parse(remoteCompanionsRaw) as CustomCompanion[]
      const localCompanions = rawStorage.loadCustomCompanions()
      const localIds = new Set(localCompanions.map(c => c.id))
      const newOnes = remoteCompanions.filter(c => !localIds.has(c.id))
      if (newOnes.length > 0) {
        localStorage.setItem(SK.customCompanions, JSON.stringify([...localCompanions, ...newOnes]))
      }
    } catch {
      // リモートのデータが壊れている場合は無視（ローカルはそのまま）
    }
  }

  // 旧形式（相棒1体・IDなし）のままの端末からリモートに届いたデータを取り込む。
  // 内容が完全一致する相棒がまだ無ければ、新形式の配列に1件追加する
  // （IDで突き合わせられないため、画像データそのものの一致で重複を防ぐ）。
  const remoteLegacyImgs = LEGACY_CUSTOM_IMG_KEYS.map(k => remote[`nob_custom_img_${k}`])
  if (remoteLegacyImgs.every(v => v)) {
    const [normal, write, rest] = remoteLegacyImgs as [string, string, string]
    const current = rawStorage.loadCustomCompanions()
    const alreadyHave = current.some(c => c.normal === normal && c.write === write && c.rest === rest)
    if (!alreadyHave) {
      const added: CustomCompanion = {
        id: crypto.randomUUID(),
        label: current.length === 0 ? 'マイキャラ' : `マイキャラ${current.length + 1}`,
        normal, write, rest,
        createdAt: Date.now(),
      }
      localStorage.setItem(SK.customCompanions, JSON.stringify([...current, added]))
    }
  }

  // 復元されたユーザー設定が旧形式の 'custom'（相棒IDなし）のままだった場合、
  // マージ後に存在する相棒に紐付け直す（IDが無いままだと表示できないため）。
  const mergedUser = safeLoad<User>(SK.user)
  if (mergedUser && mergedUser.character === 'custom') {
    const companions = rawStorage.loadCustomCompanions()
    if (companions.length > 0) {
      localStorage.setItem(SK.user, JSON.stringify({ ...mergedUser, character: `custom:${companions[0].id}` }))
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
