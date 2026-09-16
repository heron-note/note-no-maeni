import { create } from 'zustand'
import type { ScreenName, ChoiceType, User, LogEntry, Declaration } from '../types'
import { storage, todayStr, onGithubAuthCleared, onGithubSyncActivityChange, syncSettingsWithGithub } from '../utils/storage'
import {
  checkDataRepoValid, requestDeviceCode, pollForAccessToken, ensureDataRepo, DeviceFlowError,
  savePendingDeviceFlow, loadPendingDeviceFlow, clearPendingDeviceFlow, type DeviceCodeResponse,
} from '../utils/github'
import { syncIdbOnConnect, pushInitialSnapshotToGithub, pullInitialSnapshotFromGithub } from '../utils/idbSync'

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
 * isFreshRepo（リポジトリを今まさに新規作成した）がtrueなら、中身が空だと
 * 確定しているのでカテゴリ別のpull→merge→pushは行わず、設定・記録・記事・画像
 * すべてをまとめて1回のコミットでアップロードする（pushInitialSnapshotToGithub）。
 *
 * falseの場合（連携時にリポジトリを新規作成しなかった＝既存リポジトリへの接続）は、
 * 端末側のローカルデータの有無に関わらず必ずzip一括ダウンロード
 * （pullInitialSnapshotFromGithub）を先に行う。「ローカルが空に見える端末だけ
 * zipを使う」という条件分岐にすると、判定条件の見落とし（実際にオンボーディング
 * 済みだが記事は未インポート、というケースが漏れて記事の一部しか降りてこない
 * 不具合が起きた）を繰り返す。既存リポジトリへの接続は常にリモートの全件を
 * 安価に（1リクエストで）取り込めるのだから、無条件にそうすればよい。
 * zip側の取り込みはmergeRemoteIntoLocal・idbPutIfAbsentによりローカル優先で
 * 安全なので、ローカルに既にデータがあっても壊さない。
 *
 * そのうえで、この端末にしか無いローカルデータ（zip一括ダウンロードでは
 * 拾えない、まだリモートに無い分）を取りこぼさないよう、続けて従来の
 * カテゴリ別pull→merge→pushも行う。すでに大部分はzipで取り込み済みなので、
 * ここで発生するリクエストは通常わずか（新規追加分のみ）で済む。
 */
function syncGithubDataInBackground(token: string, owner: string, isFreshRepo: boolean): void {
  ;(async () => {
    console.info(`[GitHub連携] 同期方式: ${isFreshRepo ? '初回アップロード（1コミット）' : 'zip一括復元 + カテゴリ別pull→merge→push'}`)
    if (isFreshRepo) {
      try {
        await pushInitialSnapshotToGithub(token, owner)
      } catch (e) {
        console.error('[GitHub連携] 初回データのアップロードに失敗しました', e)
      }
    } else {
      try {
        await pullInitialSnapshotFromGithub(token, owner)
      } catch (e) {
        console.error('[GitHub連携] 初回データの復元に失敗しました', e)
      }
      await syncSettingsWithGithub()
      try {
        await syncIdbOnConnect(token, owner)
      } catch (e) {
        console.error('[GitHub連携] 記事・画像の同期に失敗しました', e)
      }
    }
    // init()ではなくrefreshFromStorage()を使う。init()は画面をhome/onboardingに
    // 強制的に切り替えてしまうため、設定画面などバックグラウンド同期とは無関係の
    // 場所にいるユーザーを勝手に遷移させてしまう（実際に連携直後の挙動が
    // わかりづらい原因になっていた）。ここではpull→mergeで取り込まれた
    // user/logsをストアに反映するだけでよい。
    useAppStore.getState().refreshFromStorage()
  })()
}

// GitHub連携の有効チェック（仕様書10章）＋設定・記録・記事・画像の同期を試みる。
// 無効（リポジトリ誤削除・トークン失効等）なら連携状態だけを解除する。ローカルデータには触れない。
// 起動時（init）だけでなく、アプリがバックグラウンドから復帰した時（visibilitychange）にも
// 呼ぶ。iOSのPWAはバックグラウンド化でJS実行が打ち切られやすく、同期処理が完了する前に
// 中断されることがある。以前は「次にアプリを起動し直すまで再開されない」状態だったが、
// バックグラウンド→フォアグラウンド復帰のタイミングで自動的に続きを試みるようにすることで、
// アプリを閉じ直さなくても（少し時間を置いて戻ってくるだけで）自己修復されるようにする。
let lastGithubSyncAttemptAt = 0
const MIN_GITHUB_SYNC_INTERVAL_MS = 30 * 1000 // 短時間に何度もvisibilitychangeが起きても連打しない

function attemptGithubSync(): void {
  const { githubToken, githubUsername } = useAppStore.getState()
  if (!githubToken || !githubUsername) return
  const now = Date.now()
  if (now - lastGithubSyncAttemptAt < MIN_GITHUB_SYNC_INTERVAL_MS) return
  lastGithubSyncAttemptAt = now

  checkDataRepoValid(githubToken, githubUsername).then(valid => {
    if (!valid) {
      useAppStore.getState().clearGithubAuth()
      return
    }
    // 設定同期と記事・画像同期を並行に走らせない。どちらも同じmainブランチの
    // refを更新するコミットを行うため、同時に走らせると片方のコミットが
    // 進んだ後にもう片方がfast-forwardできず失敗しうる（コンフリクト時は
    // リトライするが、無用な衝突自体を避けるほうが確実）。
    void (async () => {
      await syncSettingsWithGithub()
      await syncIdbOnConnect(githubToken, githubUsername)
    })()
  })
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attemptGithubSync()
  })
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

    // 接続済みなら起動のたびに必ず設定・記録・記事・画像の同期を試みる
    // （pendingフラグの有無に関わらず）。この仕組みが入る前に登録された
    // 画像等、フラグが立っていない既存データも取りこぼさないようにするため。
    // 既に同期済みの内容は変更なしとしてスキップされるので、通信コストは
    // 小さい。バックグラウンド復帰時にも同じ関数を呼ぶ（attemptGithubSync参照）。
    attemptGithubSync()
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

        const { owner, created } = await ensureDataRepo(token)

        get().setGithubAuth(token, owner)
        set({ githubConnectPhase: 'idle', githubConnectDevice: null })

        // 重い同期処理はバックグラウンドに回し、ここでは待たない（仕様書10章）。
        syncGithubDataInBackground(token, owner, created)
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
