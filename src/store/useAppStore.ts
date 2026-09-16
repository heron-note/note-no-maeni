import { create } from 'zustand'
import type { ScreenName, ChoiceType, User, LogEntry, Declaration } from '../types'
import { storage, todayStr, onGithubAuthCleared, onGithubSyncActivityChange, syncSettingsWithGithub } from '../utils/storage'
import {
  checkDataRepoValid, requestDeviceCode, pollForAccessToken, ensureDataRepo, DeviceFlowError,
  savePendingDeviceFlow, loadPendingDeviceFlow, clearPendingDeviceFlow, type DeviceCodeResponse,
} from '../utils/github'
import { syncIdbOnConnect } from '../utils/idbSync'

export type GithubConnectPhase = 'idle' | 'requesting' | 'waiting' | 'finalizing' | 'error'

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

  // GitHub連携フロー（Device Flow〜リポジトリ確認まで）の進行状況。
  // ストア（コンポーネントのライフサイクルとは無関係な、モジュール単位の
  // シングルトン）に持たせることで、これを表示しているダイアログが閉じたり
  // 再マウントされたりしても処理そのものは中断されずに継続する。
  githubConnectPhase: GithubConnectPhase
  githubConnectDevice: DeviceCodeResponse | null
  githubConnectError: string | null

  // 設定・記録・記事・画像いずれかの同期が進行中かどうか（ホーム画面のインジケーター用）。
  githubSyncing: boolean

  // Actions
  init: () => void
  refreshFromStorage: () => void
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
  startGithubConnect: () => void

  // Selectors
  todayLog: () => LogEntry | undefined
}

/**
 * 設定・記録・記事・画像の同期をバックグラウンドで行う。トークン取得＋リポジトリ
 * 確認が終わった時点で「連携完了」とし、この重い処理は連携ダイアログを閉じた後も
 * 中断せず継続する（仕様書10章）。完了後、画面に反映するため init() を呼び直す。
 *
 * 設定同期と記事・画像同期は別々のtry/catchにする。片方が失敗しても
 * もう片方の同期が実行されなくなる（＝原因不明のまま画像が一切同期されない）
 * ことを避けるため。失敗した内容はconsoleに出す（原因調査のため。以降は
 * 通常の自動同期で再試行される）。
 */
function syncGithubDataInBackground(token: string, owner: string): void {
  ;(async () => {
    await syncSettingsWithGithub()
    try {
      await syncIdbOnConnect(token, owner)
    } catch (e) {
      console.error('[GitHub連携] 記事・画像の同期に失敗しました', e)
    }
    // init()ではなくrefreshFromStorage()を使う。init()は画面をhome/onboardingに
    // 強制的に切り替えてしまうため、設定画面などバックグラウンド同期とは無関係の
    // 場所にいるユーザーを勝手に遷移させてしまう（実際に連携直後の挙動が
    // わかりづらい原因になっていた）。ここではpull→mergeで取り込まれた
    // user/logsをストアに反映するだけでよい。
    useAppStore.getState().refreshFromStorage()
  })()
}

export const useAppStore = create<AppStore>((set, get) => {
  // 自動同期（storage.ts）が有効チェックの結果GitHub連携を解除した場合、ストアの状態も追従させる。
  onGithubAuthCleared(() => set({ githubToken: null, githubUsername: null }))
  // 設定・記録／記事・画像いずれかの同期が進行中かをホーム画面のインジケーターに反映する。
  onGithubSyncActivityChange(syncing => set({ githubSyncing: syncing }))

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
  githubSyncing: false,
  githubConnectPhase: 'idle',
  githubConnectDevice: null,
  githubConnectError: null,

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
        // 接続済みなら起動のたびに必ず設定・記録・記事・画像の同期を試みる
        // （pendingフラグの有無に関わらず）。この仕組みが入る前に登録された
        // 画像等、フラグが立っていない既存データも取りこぼさないようにするため。
        // 既に同期済みの内容は変更なしとしてスキップされるので、通信コストは
        // 小さい（PWAがバックグラウンド化で同期処理を打ち切ってしまい、画像だけ
        // 同期されない、という問題への対処。仕様書10章参照）。
        void syncSettingsWithGithub()
        void syncIdbOnConnect(githubToken, githubUsername)
      })
    }
  },

  // init()から画面遷移の副作用を切り離したもの。バックグラウンド同期の完了後など、
  // 「ユーザーが今どの画面にいてもそこに留まったまま、pull→mergeで取り込まれた
  // データだけをストアへ反映したい」場面で使う。init()は起動時の画面決定
  // （onboarding/home）も兼ねているため、セッション中に呼ぶと勝手に画面が
  // 切り替わってしまう（実際に連携直後の挙動がわかりづらい原因になっていた）。
  refreshFromStorage() {
    set({ user: storage.loadUser(), logs: storage.loadLogs() })
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

  /**
   * GitHub連携（Device Flow）を開始する。UIコンポーネント（連携ダイアログ）の
   * マウント状態とは無関係にストア側で完結させる。以前はこの処理全体を
   * ダイアログのコンポーネント内で行っており、リポジトリ作成後・連携完了前に
   * ダイアログが閉じる（再マウントされる等）と、AbortControllerの中断チェックに
   * 引っかかって連携処理そのものがそこで静かに止まってしまう不具合があった。
   *
   * 既に進行中（requesting/waiting/finalizing）なら何もしない（多重起動防止）。
   * ダイアログは githubConnectPhase/Device/Error を購読して表示するだけにする。
   */
  startGithubConnect() {
    const phase = get().githubConnectPhase
    if (phase === 'requesting' || phase === 'waiting' || phase === 'finalizing') return

    set({ githubConnectPhase: 'requesting', githubConnectError: null, githubConnectDevice: null })

    ;(async () => {
      try {
        // ホーム画面に追加したPWA（特にiOS）では、承認ページを開くと外部ブラウザ／
        // アプリ内ブラウザに切り替わり、戻ってきた際にページが再読み込みされて
        // 状態（発行済みのデバイスコード）が失われることがある。その場合でも
        // 承認待ちの既存コードのまま確認を再開できるよう、localStorageを見る。
        let d: DeviceCodeResponse
        let deadline: number | undefined
        const pending = loadPendingDeviceFlow()
        if (pending) {
          d = pending.device
          deadline = pending.requestedAt + pending.device.expires_in * 1000
        } else {
          d = await requestDeviceCode('repo workflow')
          savePendingDeviceFlow(d)
        }
        set({ githubConnectDevice: d, githubConnectPhase: 'waiting' })

        const token = await pollForAccessToken(d, { deadline })
        clearPendingDeviceFlow()
        set({ githubConnectPhase: 'finalizing' })

        const { owner } = await ensureDataRepo(token)

        get().setGithubAuth(token, owner)
        set({ githubConnectPhase: 'idle', githubConnectDevice: null })

        // 重い同期処理はバックグラウンドに回し、ここでは待たない（仕様書10章）。
        syncGithubDataInBackground(token, owner)
      } catch (e) {
        if (e instanceof DeviceFlowError && e.message === 'expired_token') clearPendingDeviceFlow()
        set({
          githubConnectError: e instanceof Error ? e.message : '接続に失敗しました',
          githubConnectPhase: 'error',
        })
      }
    })()
  },

  todayLog() { return get().logs[todayStr()] },
  }
})
