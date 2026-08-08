import { create } from 'zustand'
import type { ScreenName, ChoiceType, User, LogEntry, Declaration } from '../types'
import { storage, todayStr } from '../utils/storage'

interface AppStore {
  // State
  screen: ScreenName
  user: User | null
  logs: Record<string, LogEntry>
  choice: ChoiceType | null
  declaration: Declaration | null
  settingsFrom: 'home' | 'already'

  // Actions
  init: () => void
  goTo: (screen: ScreenName) => void
  goHome: () => void
  saveUser: (user: User) => void
  logToday: (type: ChoiceType, declarationId?: string | null) => void
  setChoice: (type: ChoiceType) => void
  setDeclaration: (d: Declaration) => void
  setSettingsFrom: (from: 'home' | 'already') => void

  // Selectors
  todayLog: () => LogEntry | undefined
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: 'onboarding',
  user: null,
  logs: {},
  choice: null,
  declaration: null,
  settingsFrom: 'home',

  init() {
    const user = storage.loadUser()
    const logs = storage.loadLogs()
    set({ user, logs })
    if (!user?.onboarded) {
      set({ screen: 'onboarding' })
    } else {
      set({ screen: logs[todayStr()] ? 'already-done' : 'home' })
    }
  },

  goTo(screen) { set({ screen }) },

  goHome() {
    const logs = storage.loadLogs()
    set({ logs, screen: logs[todayStr()] ? 'already-done' : 'home' })
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
  setSettingsFrom(settingsFrom) { set({ settingsFrom }) },

  todayLog() { return get().logs[todayStr()] },
}))
