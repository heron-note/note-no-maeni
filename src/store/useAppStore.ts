import { create } from 'zustand'
import type { ScreenName, ChoiceType, User, LogEntry, Declaration } from '../types'
import { storage, todayStr, onGithubAuthCleared } from '../utils/storage'
import { checkDataRepoValid } from '../utils/github'
import { syncIdbOnConnect, isIdbSyncPending } from '../utils/idbSync'

interface AppStore {
  // State
  screen: ScreenName
  user: User | null
  logs: Record<string, LogEntry>
  choice: ChoiceType | null
  declaration: Declaration | null
  editingUserTemplateId: string | null  // null = 新規作成
  editingRestTemplateId: string | null  // null = 新規作成

  // GitHub連携（localStorageに永続化。毎回の再連携の手間を避けるため。仕様書3章参照）
  githubToken: string | null
  githubUsername: string | null

  // Actions
  init: () => void
  goTo: (screen: ScreenName) => void
  goHome: () => void
  saveUser: (user: User) => void
  logToday: (type: ChoiceType, declarationId?: string | null) => void
  setChoice: (type: ChoiceType) => void
  setDeclaration: (d: Declaration) => void
  setEditingUserTemplateId: (id: string | null) => void
  setEditingRestTemplateId: (id: string | null) => void
  setGithubAuth: (token: string, username: string) => void
  clearGithubAuth: () => void

  // Selectors
  todayLog: () => LogEntry | undefined
}

export const useAppStore = create<AppStore>((set, get) => {
  // 自動同期（storage.ts）が有効チェックの結果GitHub連携を解除した場合、ストアの状態も追従させる。
  onGithubAuthCleared(() => set({ githubToken: null, githubUsername: null }))

  return {
  screen: 'onboarding',
  user: null,
  logs: storage.loadLogs(),
  choice: null,
  declaration: null,
  editingUserTemplateId: null,
  editingRestTemplateId: null,
  githubToken: storage.loadGithubAuth()?.token ?? null,
  githubUsername: storage.loadGithubAuth()?.username ?? null,

  init() {
    const user = storage.loadUser()
    const logs = storage.loadLogs()
    set({ user, logs })
    if (!user?.onboarded) {
      set({ screen: 'onboarding' })
    } else {
      set({ screen: 'home' })
    }

    // GitHub連携の有効チェック（仕様書10章）。
    // 無効（リポジトリ誤削除・トークン失効等）なら連携状態だけを解除する。ローカルデータには触れない。
    const { githubToken, githubUsername } = get()
    if (githubToken && githubUsername) {
      checkDataRepoValid(githubToken, githubUsername).then(valid => {
        if (!valid) {
          get().clearGithubAuth()
          return
        }
        // 記事・画像の同期が前回完了しきれていなければ、起動のたびに自動で
        // 再開する（PWAがバックグラウンド化で同期処理を打ち切ってしまい、
        // 画像だけ同期されない、という問題への対処。仕様書10章参照）。
        if (isIdbSyncPending()) {
          void syncIdbOnConnect(githubToken, githubUsername)
        }
      })
    }
  },

  goTo(screen) { set({ screen }) },

  goHome() {
    const logs = storage.loadLogs()
    set({ logs, screen: 'home' })
  },

  saveUser(user) {
    storage.saveUser(user)
    set({ user })
  },

  logToday(type, declarationId = null) {
    const logs = get().logs
    const entry: LogEntry = { type, timestamp: new Date().toISOString(), declarationId }
    const next = { ...logs, [todayStr()]: entry }
    storage.saveLogs(next)
    set({ logs: next })
  },

  setChoice(choice) { set({ choice }) },
  setDeclaration(declaration) { set({ declaration }) },
  setEditingUserTemplateId(id) { set({ editingUserTemplateId: id }) },
  setEditingRestTemplateId(id) { set({ editingRestTemplateId: id }) },
  setGithubAuth(token, username) {
    storage.saveGithubAuth(token, username)
    set({ githubToken: token, githubUsername: username })
  },
  clearGithubAuth() {
    storage.clearGithubAuth()
    set({ githubToken: null, githubUsername: null })
  },

  todayLog() { return get().logs[todayStr()] },
  }
})
