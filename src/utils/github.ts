// GitHub連携（Device Flow）と、アプリデータ保管用リポジトリの確認・作成。
// 仕様: docs/LP作成機能_仕様書.md 3章・10章

import JSZip from 'jszip'

const AUTH_RELAY_URL = 'https://note-no-maeni-auth-relay.daisuke-hatano.workers.dev'
const GITHUB_API = 'https://api.github.com'
const DATA_REPO_NAME = 'note-no-maeni-data'
const DATA_REPO_DESCRIPTION = 'noteのまえに - アプリデータ保管用リポジトリ（自動生成）'

export class DeviceFlowError extends Error {}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface TokenSuccess {
  access_token: string
  token_type: string
  scope: string
}

interface TokenError {
  error: string
  error_description?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function requestDeviceCode(scope: string): Promise<DeviceCodeResponse> {
  const res = await fetch(`${AUTH_RELAY_URL}/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  })
  if (!res.ok) throw new DeviceFlowError(`デバイスコードの取得に失敗しました (HTTP ${res.status})`)
  return res.json()
}

// ─── 承認待ち状態の永続化 ───────────────────────────────────────────────────
// GitHubの承認ページを開くと、ホーム画面に追加したPWA（特にiOS）ではSafariへ
// 切り替わり、戻ってきた際にページが再読み込みされてReactの状態（発行済みの
// デバイスコード等）が失われることがある。その場合でも「もう一度試す」だけで
// 同じコードのまま承認確認を再開できるよう、localStorageに保存しておく。
const PENDING_FLOW_KEY = 'ghauth_pending_device_flow'

interface PendingDeviceFlow {
  device: DeviceCodeResponse
  requestedAt: number
}

export function savePendingDeviceFlow(device: DeviceCodeResponse): void {
  const pending: PendingDeviceFlow = { device, requestedAt: Date.now() }
  localStorage.setItem(PENDING_FLOW_KEY, JSON.stringify(pending))
}

/** 有効期限内の承認待ちコードが残っていれば返す。期限切れなら破棄してnullを返す。 */
export function loadPendingDeviceFlow(): PendingDeviceFlow | null {
  try {
    const raw = localStorage.getItem(PENDING_FLOW_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as PendingDeviceFlow
    const deadline = pending.requestedAt + pending.device.expires_in * 1000
    if (Date.now() >= deadline) {
      localStorage.removeItem(PENDING_FLOW_KEY)
      return null
    }
    return pending
  } catch {
    return null
  }
}

export function clearPendingDeviceFlow(): void {
  localStorage.removeItem(PENDING_FLOW_KEY)
}

async function requestToken(deviceCode: string): Promise<TokenSuccess | TokenError> {
  const res = await fetch(`${AUTH_RELAY_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  return res.json()
}

export interface PollOptions {
  signal?: AbortSignal
  /** 明示的な絶対期限（ms epoch）。省略時は device.expires_in から算出する。承認待ちの再開時に使う。 */
  deadline?: number
}

/** ユーザーがGitHub上で承認するまでポーリングし、アクセストークンを返す。 */
export async function pollForAccessToken(device: DeviceCodeResponse, options: PollOptions = {}): Promise<string> {
  let interval = device.interval
  const deadline = options.deadline ?? (Date.now() + device.expires_in * 1000)

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DeviceFlowError('cancelled')
    await sleep(interval * 1000)
    if (options.signal?.aborted) throw new DeviceFlowError('cancelled')

    const result = await requestToken(device.device_code)
    if ('access_token' in result) return result.access_token

    if (result.error === 'authorization_pending') continue
    if (result.error === 'slow_down') { interval += 5; continue }
    throw new DeviceFlowError(result.error_description || result.error)
  }
  throw new DeviceFlowError('expired_token')
}

export interface GithubUser {
  login: string
  id: number
  avatar_url: string
}

// GitHub APIへのリクエストを直列化するキュー。
// 設定・記録・記事・画像など複数カテゴリの同期が同時に発火しても、
// 実際のAPIリクエストは常に1つずつ順番に処理される（連打によるレート制限回避）。
let requestQueue: Promise<unknown> = Promise.resolve()

function enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(task, task)
  requestQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

// GitHubのレート制限（一次: 認証済みで5,000リクエスト/時。二次: 短時間に大量の
// 書き込み系リクエスト＝ここでは記事1件ごとに1コミットが発生するため、記事を
// 大量インポートすると容易に踏む）に引っかかった場合、Retry-After等のヘッダーに
// 従って待ってから自動でリトライする。実際に403件の記事インポートが158件で
// 止まる不具合が確認されており、そこで投げていた例外がsyncArticleFilesの
// アップロードループを中断させ、記事本体はアップロードされたのに件数の途中で
// インデックス更新まで到達できない、という不完全な状態を招いていた。
// 待ち時間が長すぎる（一次制限のリセット待ちなど）場合は素直に諦めて例外を投げる。
// 中断しても記事等はpostIdごとの個別ファイルなので、次回の同期で未取り込み分だけ
// 再開できる（idbSync.tsのpending機構・重複防止ロジック参照）。
const RATE_LIMIT_MAX_RETRIES = 6
const RATE_LIMIT_MAX_WAIT_MS = 2 * 60 * 1000

function isRateLimitResponse(res: Response): boolean {
  if (res.status === 429) return true
  return res.status === 403 && (res.headers.get('retry-after') !== null || res.headers.get('x-ratelimit-remaining') === '0')
}

function rateLimitWaitMs(res: Response, attempt: number): number | null {
  const retryAfter = Number(res.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000

  const resetEpochSec = Number(res.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(resetEpochSec) && resetEpochSec > 0) {
    const wait = resetEpochSec * 1000 - Date.now() + 1000
    if (wait > 0) return wait
  }

  return Math.min(1000 * 2 ** attempt, 30000) // ヘッダーが読めない場合の指数バックオフ
}

async function githubFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return enqueueRequest(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${GITHUB_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.headers ?? {}),
        },
      })
      if (!isRateLimitResponse(res) || attempt >= RATE_LIMIT_MAX_RETRIES) return res
      const wait = rateLimitWaitMs(res, attempt)
      if (wait === null || wait > RATE_LIMIT_MAX_WAIT_MS) return res
      await sleep(wait)
    }
  })
}

export async function getAuthenticatedUser(token: string): Promise<GithubUser> {
  const res = await githubFetch(token, '/user')
  if (!res.ok) throw new Error(`GitHubのユーザー情報取得に失敗しました (HTTP ${res.status})`)
  return res.json()
}

async function repoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await githubFetch(token, `/repos/${owner}/${repo}`)
  if (res.status === 404) return false
  if (!res.ok) throw new Error(`リポジトリ確認に失敗しました (HTTP ${res.status})`)
  return true
}

async function createDataRepo(token: string): Promise<void> {
  const res = await githubFetch(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: DATA_REPO_NAME,
      private: true,
      description: DATA_REPO_DESCRIPTION,
      auto_init: true,
    }),
  })
  // 422: 既に存在する（同時実行等）場合は許容
  if (!res.ok && res.status !== 422) {
    throw new Error(`${DATA_REPO_NAME} の作成に失敗しました (HTTP ${res.status})`)
  }
}

export interface EnsureDataRepoResult {
  owner: string
  created: boolean
}

/** 汎用データリポジトリ（note-no-maeni-data）が無ければ作成する。仕様書10章参照。 */
export async function ensureDataRepo(token: string): Promise<EnsureDataRepoResult> {
  const user = await getAuthenticatedUser(token)
  const exists = await repoExists(token, user.login, DATA_REPO_NAME)
  if (exists) return { owner: user.login, created: false }
  await createDataRepo(token)
  return { owner: user.login, created: true }
}

/**
 * データリポジトリ（note-no-maeni-data）が今も有効か確認する。
 * トークン失効・リポジトリ誤削除などを検知するための「有効チェック」（仕様書10章）。
 * 無効な場合、呼び出し側は「連携済み」状態だけを解除し、ローカルデータには触れないこと。
 *
 * 「無効」と判定するのは、GitHubが明確に404（リポジトリが存在しない）を返した場合のみ。
 * レート制限やネットワーク不通などの一時的なエラーは「不明」として安全側に倒し、
 * 連携を解除しない（誤って解除するとユーザーに無用な再連携の手間を強いることになるため）。
 */
export async function checkDataRepoValid(token: string, owner: string): Promise<boolean> {
  try {
    const res = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}`)
    return res.status !== 404
  } catch {
    return true
  }
}

// ─── アプリ全般データの同期（仕様書10章参照） ───────────────────────────────

function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))))
}

async function getRepoFile(token: string, owner: string, path: string): Promise<{ content: string; sha: string } | null> {
  const res = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/contents/${path}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${path} の取得に失敗しました (HTTP ${res.status})`)
  const data = await res.json()
  return { content: base64ToUtf8(data.content), sha: data.sha }
}

// 複数端末が同時に接続していると、片方が読んだshaがもう片方の書き込みで古くなり、
// 更新時に409 Conflictになることがある（新規作成のつもりでsha無しで送った場合は、
// 別端末が先に作っていると422になる）。取得し直したshaで数回リトライすることで、
// 「2端末を同時に開くと同期が失敗する」事態を避ける（内容はローカル側が正として上書きする）。
const CONFLICT_STATUSES = new Set([409, 422])

async function putRepoFile(token: string, owner: string, path: string, content: string, message: string, sha?: string): Promise<void> {
  let currentSha = sha
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: utf8ToBase64(content),
        ...(currentSha ? { sha: currentSha } : {}),
      }),
    })
    if (res.ok) return
    if (!CONFLICT_STATUSES.has(res.status) || attempt === 2) throw new Error(`${path} の更新に失敗しました (HTTP ${res.status})`)
    const latest = await getRepoFile(token, owner, path)
    currentSha = latest?.sha
  }
}

const SETTINGS_PATH = 'settings.json'
const LOGS_PATH = 'logs.json'
// nob_logs は「休む/書く」を押すたびに増え続け、他の設定と違って際限なく大きくなっていく。
// 同じファイルに入れると、些細な設定変更のたびに肥大化した履歴ごと転送することになり
// 使うほど同期が遅くなってしまうため、別ファイルに分離する。
const LOGS_KEY = 'nob_logs'

function splitLocalData(data: Record<string, string>): { settings: Record<string, string>; logs: Record<string, string> } {
  const settings: Record<string, string> = {}
  const logs: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === LOGS_KEY) logs[key] = value
    else settings[key] = value
  }
  return { settings, logs }
}

async function pushJsonFile(token: string, owner: string, path: string, obj: unknown, message: string): Promise<void> {
  const existing = await getRepoFile(token, owner, path)
  const content = JSON.stringify(obj, null, 2)
  if (existing && existing.content === content) return // 変更なしなら書き込まない
  await putRepoFile(token, owner, path, content, message, existing?.sha)
}

async function pullJsonFile<T>(token: string, owner: string, path: string): Promise<T | null> {
  const file = await getRepoFile(token, owner, path)
  return file ? (JSON.parse(file.content) as T) : null
}

// ─── 複数ファイルの一括コミット（Git Data API） ──────────────────────────────
// Contents API（1ファイル=1コミット）で記事を大量インポートすると、記事の
// 件数分だけコミット（＝リクエスト）が発生し、実際に403件のインポートが
// 158件で二次レート制限に引っかかって止まる不具合が発生した。新規追加・削除
// ぶんをまとめてtree一つ・コミット一つで済ませることで、件数によらず
// リクエスト数を数回に抑える。

const DATA_REPO_BRANCH = 'main'

interface GitTreeEntry {
  path: string
  mode: '100644'
  type: 'blob'
  /** 新規/更新するファイルの中身（テキスト）。sha指定時は省略する。 */
  content?: string
  /** 既存blobを指すsha。nullを指定するとそのパスを削除する（base_tree使用時）。 */
  sha?: string | null
}

async function getBranchState(token: string, owner: string, branch: string): Promise<{ commitSha: string; treeSha: string } | null> {
  const res = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/branches/${branch}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`ブランチ情報の取得に失敗しました (HTTP ${res.status})`)
  const data = await res.json()
  return { commitSha: data.commit.sha, treeSha: data.commit.commit.tree.sha }
}

async function createBlob(token: string, owner: string, base64Content: string): Promise<string> {
  const res = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: base64Content, encoding: 'base64' }),
  })
  if (!res.ok) throw new Error(`blobの作成に失敗しました (HTTP ${res.status})`)
  const data = await res.json()
  return data.sha
}

/**
 * entriesで指定した変更（追加・更新・sha:nullで削除）を1つのコミットにまとめて
 * pushする。他端末が同時に更新してブランチが進んでいた場合（fast-forwardに
 * 失敗した場合）は、最新のブランチ状態を取り直して数回リトライする。
 */
async function commitTreeChanges(token: string, owner: string, entries: GitTreeEntry[], message: string): Promise<void> {
  if (entries.length === 0) return

  for (let attempt = 0; attempt < 3; attempt++) {
    const base = await getBranchState(token, owner, DATA_REPO_BRANCH)
    if (!base) throw new Error(`ブランチ ${DATA_REPO_BRANCH} が見つかりません`)

    const treeRes = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: base.treeSha, tree: entries }),
    })
    if (!treeRes.ok) throw new Error(`treeの作成に失敗しました (HTTP ${treeRes.status})`)
    const tree = await treeRes.json()

    const commitRes = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [base.commitSha] }),
    })
    if (!commitRes.ok) throw new Error(`commitの作成に失敗しました (HTTP ${commitRes.status})`)
    const commit = await commitRes.json()

    const refRes = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/git/refs/heads/${DATA_REPO_BRANCH}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    })
    if (refRes.ok) return
    // 409/422: 他端末が同時に更新しfast-forwardできなかった。最新状態を取り直してリトライ。
    if (!CONFLICT_STATUSES.has(refRes.status) || attempt === 2) {
      throw new Error(`refの更新に失敗しました (HTTP ${refRes.status})`)
    }
  }
}

/**
 * ローカル設定（storage.ts の nob_ プレフィックス項目）を note-no-maeni-data リポジトリへアップロードする。
 * GitHub連携の直後（初回アップロード）と、設定保存のたびに呼び出す（仕様書10章のローカルファースト方針）。
 * 際限なく増える記録（nob_logs）は settings.json とは別ファイル（logs.json）に分けて保存する。
 */
export async function pushLocalSettings(token: string, owner: string, localData: Record<string, string>): Promise<void> {
  const { settings, logs } = splitLocalData(localData)
  await pushJsonFile(token, owner, SETTINGS_PATH, settings, '設定を同期')
  if (Object.keys(logs).length > 0) {
    await pushJsonFile(token, owner, LOGS_PATH, logs, '記録を同期')
  }
}

/**
 * GitHub側の設定・記録を取得する。どちらも無ければ null（まだ一度も同期していない）。
 */
export async function pullLocalSettings(token: string, owner: string): Promise<Record<string, string> | null> {
  const [settingsFile, logsFile] = await Promise.all([
    getRepoFile(token, owner, SETTINGS_PATH),
    getRepoFile(token, owner, LOGS_PATH),
  ])
  if (!settingsFile && !logsFile) return null
  return {
    ...(settingsFile ? JSON.parse(settingsFile.content) : {}),
    ...(logsFile ? JSON.parse(logsFile.content) : {}),
  }
}

// ─── IndexedDBデータの同期（記事ストッカー・背景画像・画像スタンプ） ─────────
// 仕様書10章参照。
//
// 記事・画像は件数が増えていくため、1ファイルにまとめず「ディレクトリ内に1件1ファイル
// ＋ 一覧を持つインデックスファイル」の構成にする。新規追加分だけをアップロードし、
// 既存ファイル（記事・画像とも内容が変わらない前提）は再アップロードしない。
// 削除された分だけインデックスと突き合わせて個別に削除する。
// これにより、件数が増えるほど毎回の同期が重くなる問題を避ける。

// ---- 記事ストッカー ----
// nob_stk_articles は1記事1ファイル＋インデックスに分割。
// nob_stk_nouns / nob_stk_article_nouns / nob_stk_collections は形態素解析の
// 内部インデックス・ユーザーが作るコレクション一覧で、件数が少なく低頻度更新のため
// 単一ファイル（articles-meta.json）にまとめたままにする。

interface ArticleIndexEntry { postId: string; title: string; date: string }

const ARTICLES_INDEX_PATH = 'articles/index.json'
const ARTICLES_META_PATH = 'articles-meta.json'

function articleFilePath(postId: string): string {
  return `articles/${postId}.json`
}

/**
 * 記事インデックス（articles/index.json）を取得する唯一の入口。1回の同期で
 * pull側・push側の両方がこれぞれ個別に取得し直すと、記事ファイル本体は
 * 増分だけで済むよう最適化していてもインデックスだけ毎回2回取得する無駄な
 * やり取りが残ってしまう。呼び出し側（idbSync.ts）で1回だけ取得し、
 * pullArticleStocker・pushArticleStockerの両方に同じ値を渡して使い回すこと。
 */
export async function pullArticleIndex(token: string, owner: string): Promise<ArticleIndexEntry[] | null> {
  return pullJsonFile<ArticleIndexEntry[]>(token, owner, ARTICLES_INDEX_PATH)
}

async function syncArticleFiles(token: string, owner: string, localArticles: unknown[], remoteIndexInput: ArticleIndexEntry[] | null): Promise<void> {
  const remoteIndex = remoteIndexInput ?? []

  // ローカルが空なのにリモートには記事がある場合、IndexedDBの読み込みが終わる前に
  // 同期が走った等の異常とみなし、インデックス上書き・ファイル削除を行わない。
  // 複数端末を同時に開いた際、片方が空の状態で同期を走らせてしまい、もう片方が
  // アップロード済みの記事インデックスを空で潰してしまう実害が確認されたための安全策。
  if (localArticles.length === 0 && remoteIndex.length > 0) return

  const remoteIds = new Set(remoteIndex.map(e => e.postId))
  const localIds = new Set<string>()

  // 新規追加・削除・インデックス更新をすべて1つのtree/commitにまとめる
  // （1ファイル=1コミットのContents APIだと、記事を大量インポートした際に
  // 件数分のリクエストが発生し、二次レート制限に引っかかって途中で止まって
  // しまう不具合が実際にあったため）。
  const entries: GitTreeEntry[] = []
  let addedCount = 0
  let removedCount = 0

  for (const article of localArticles) {
    const rec = article as { postId?: unknown; title?: unknown; date?: unknown }
    const postId = String(rec.postId ?? '')
    if (!postId) continue
    localIds.add(postId)
    if (remoteIds.has(postId)) continue // 既存記事は不変な前提で再アップロードしない
    entries.push({ path: articleFilePath(postId), mode: '100644', type: 'blob', content: JSON.stringify(article, null, 2) })
    addedCount++
  }

  for (const entry of remoteIndex) {
    if (localIds.has(entry.postId)) continue
    entries.push({ path: articleFilePath(entry.postId), mode: '100644', type: 'blob', sha: null })
    removedCount++
  }

  if (entries.length === 0) return // 記事本体に変更なし（インデックスも変わらないはず）

  const newIndex: ArticleIndexEntry[] = localArticles.map(a => {
    const rec = a as { postId?: unknown; title?: unknown; date?: unknown }
    return { postId: String(rec.postId ?? ''), title: String(rec.title ?? ''), date: String(rec.date ?? '') }
  })
  entries.push({ path: ARTICLES_INDEX_PATH, mode: '100644', type: 'blob', content: JSON.stringify(newIndex, null, 2) })

  await commitTreeChanges(token, owner, entries, `記事を同期（追加${addedCount}件・削除${removedCount}件）`)
}

// knownIds（この端末のローカルに既にある記事のpostId集合）に含まれる記事は
// 取得をスキップする。1件でも欠けている記事があれば、その分だけをContents API
// で1件ずつ取得するのではなく、リポジトリ全体をzip1回でダウンロードして
// そこから読み出す（fetchRepoZip/makeZipReaderはpullRepoSnapshotと共通）。
// 記事が数百件になると、件数分だけリクエストが発生する個別取得は
// タイムアウト・レート制限・端末側の中断などで容易に「一部だけ取得できた
// 状態」のまま止まってしまい、しかも次回起動時の再試行（自己修復）も同じ
// 個別取得方式のままだと同じ理由でまた止まる、という永久に治らない状態に
// なる不具合が実際に確認された。zip方式ならリクエストは常に1回で済み、
// 何度再試行してもそのリクエスト自体が失敗しない限り必ず全件取得できる。
async function pullArticleFiles(token: string, owner: string, remoteIndex: ArticleIndexEntry[], knownIds: Set<string>): Promise<unknown[]> {
  const missing = remoteIndex.filter(entry => !knownIds.has(entry.postId))
  if (missing.length === 0) return []

  const zip = await fetchRepoZip(token, owner)
  if (!zip) return []
  const { readJson } = makeZipReader(zip)

  const articles: unknown[] = []
  for (const entry of missing) {
    const article = await readJson(articleFilePath(entry.postId))
    if (article) articles.push(article)
  }
  return articles
}

export async function pushArticleStocker(token: string, owner: string, data: Record<string, unknown[]>, remoteIndex: ArticleIndexEntry[] | null): Promise<void> {
  await syncArticleFiles(token, owner, data.nob_stk_articles ?? [], remoteIndex)
  await pushJsonFile(token, owner, ARTICLES_META_PATH, {
    nob_stk_nouns: data.nob_stk_nouns ?? [],
    nob_stk_article_nouns: data.nob_stk_article_nouns ?? [],
    nob_stk_collections: data.nob_stk_collections ?? [],
  }, '記事メタデータを同期')
}

export async function pullArticleStocker(token: string, owner: string, remoteIndex: ArticleIndexEntry[] | null, knownIds: Set<string> = new Set()): Promise<Record<string, unknown[]> | null> {
  const [articles, meta] = await Promise.all([
    remoteIndex ? pullArticleFiles(token, owner, remoteIndex, knownIds) : Promise.resolve(null),
    pullJsonFile<Record<string, unknown[]>>(token, owner, ARTICLES_META_PATH),
  ])
  if (articles === null && meta === null) return null
  return {
    nob_stk_articles: articles ?? [],
    nob_stk_nouns: meta?.nob_stk_nouns ?? [],
    nob_stk_article_nouns: meta?.nob_stk_article_nouns ?? [],
    nob_stk_collections: meta?.nob_stk_collections ?? [],
  }
}

// ---- 背景画像・画像スタンプ ----
// 1画像1ファイル（バイナリのまま）＋インデックスに分割。

export interface ImageRecord { id: string; dataUrl: string; createdAt: unknown }
interface ImageIndexEntry { id: string; createdAt: unknown; ext: string }

function parseDataUrl(dataUrl: string): { base64: string; ext: string } {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl)
  if (!match) return { base64: '', ext: 'png' }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  return { base64: match[2], ext }
}

function toDataUrl(base64: string, ext: string): string {
  const mime = ext === 'jpg' ? 'jpeg' : ext
  return `data:image/${mime};base64,${base64}`
}

/** 画像インデックス（images/bg または images/stamp の index.json）を取得する唯一の入口。 */
export async function pullImageIndex(token: string, owner: string, dir: string): Promise<ImageIndexEntry[] | null> {
  return pullJsonFile<ImageIndexEntry[]>(token, owner, `${dir}/index.json`)
}

async function syncImageFiles(token: string, owner: string, dir: string, localImages: ImageRecord[], remoteIndexInput: ImageIndexEntry[] | null, excludeId?: string): Promise<void> {
  const indexPath = `${dir}/index.json`
  const remoteIndex = remoteIndexInput ?? []

  // 記事ストッカーと同様、ローカルが空でリモートに画像がある場合は上書き・削除しない安全策。
  // ただし、呼び出し元がexcludeIdで「今まさに削除した1件」を教えてくれている場合は、
  // その1件を除いてもリモートに何か残っているかどうかで判定する
  // （最後の1件を削除したときに、削除自体がブロックされてしまわないようにするため）。
  const remoteIndexExcludingDeleted = excludeId ? remoteIndex.filter(e => e.id !== excludeId) : remoteIndex
  if (localImages.length === 0 && remoteIndexExcludingDeleted.length > 0) return

  const remoteIds = new Set(remoteIndex.map(e => e.id))
  const localIds = new Set(localImages.map(i => i.id))

  // 記事と同様、新規追加・削除・インデックス更新を1つのtree/commitにまとめる。
  // 画像はバイナリなのでtreeへ直接contentを書けず、blobだけは1件ずつ作成する
  // 必要があるが、それでもコミットは常に1回で済む（件数分のコミットが発生しない）。
  const entries: GitTreeEntry[] = []
  let addedCount = 0
  let removedCount = 0

  for (const img of localImages) {
    if (remoteIds.has(img.id)) continue // 既存画像は不変な前提で再アップロードしない
    const { base64, ext } = parseDataUrl(img.dataUrl)
    const sha = await createBlob(token, owner, base64)
    entries.push({ path: `${dir}/${img.id}.${ext}`, mode: '100644', type: 'blob', sha })
    addedCount++
  }

  for (const entry of remoteIndex) {
    if (localIds.has(entry.id)) continue
    entries.push({ path: `${dir}/${entry.id}.${entry.ext}`, mode: '100644', type: 'blob', sha: null })
    removedCount++
  }

  if (entries.length === 0) return

  const newIndex: ImageIndexEntry[] = localImages.map(img => ({
    id: img.id,
    createdAt: img.createdAt,
    ext: parseDataUrl(img.dataUrl).ext,
  }))
  entries.push({ path: indexPath, mode: '100644', type: 'blob', content: JSON.stringify(newIndex, null, 2) })

  await commitTreeChanges(token, owner, entries, `画像を同期（追加${addedCount}件・削除${removedCount}件）`)
}

// 記事と同様、knownIds（既にローカルにある画像id集合）に含まれる画像は取得を
// スキップする。画像は本文がbase64のバイナリで記事以上にペイロードが大きいため、
// 既知の画像を毎回律儀に取得し直すのはAPIリクエスト数・転送量とも無駄が大きい。
// 記事と同じ理由でzip一括ダウンロードを使う（fetchRepoZip/makeZipReaderは
// pullRepoSnapshotと共通）。個別取得だと画像が何件も欠けている場合に
// 件数分のリクエストが発生し、途中で止まると自己修復の再試行も同じ方式の
// ままでは同じ理由でまた止まる。
async function pullImageFiles(token: string, owner: string, dir: string, remoteIndex: ImageIndexEntry[], knownIds: Set<string>): Promise<ImageRecord[]> {
  const missing = remoteIndex.filter(entry => !knownIds.has(entry.id))
  if (missing.length === 0) return []

  const zip = await fetchRepoZip(token, owner)
  if (!zip) return []
  const { readBase64 } = makeZipReader(zip)

  const images: ImageRecord[] = []
  for (const entry of missing) {
    const base64 = await readBase64(`${dir}/${entry.id}.${entry.ext}`)
    if (base64) images.push({ id: entry.id, dataUrl: toDataUrl(base64, entry.ext), createdAt: entry.createdAt })
  }
  return images
}

export async function pushBgImages(token: string, owner: string, images: unknown[], remoteIndex: ImageIndexEntry[] | null, excludeId?: string): Promise<void> {
  await syncImageFiles(token, owner, 'images/bg', images as ImageRecord[], remoteIndex, excludeId)
}
export async function pullBgImages(token: string, owner: string, remoteIndex: ImageIndexEntry[] | null, knownIds: Set<string> = new Set()): Promise<unknown[] | null> {
  return remoteIndex ? pullImageFiles(token, owner, 'images/bg', remoteIndex, knownIds) : null
}

export async function pushStampImages(token: string, owner: string, images: unknown[], remoteIndex: ImageIndexEntry[] | null, excludeId?: string): Promise<void> {
  await syncImageFiles(token, owner, 'images/stamp', images as ImageRecord[], remoteIndex, excludeId)
}
export async function pullStampImages(token: string, owner: string, remoteIndex: ImageIndexEntry[] | null, knownIds: Set<string> = new Set()): Promise<unknown[] | null> {
  return remoteIndex ? pullImageFiles(token, owner, 'images/stamp', remoteIndex, knownIds) : null
}

// ─── 初回接続時の一括アップロード ─────────────────────────────────────────────
// リポジトリを今まさに新規作成した（＝中身は空だと確定している）場合は、
// カテゴリごとにpull→merge→pushする理由が無い。突き合わせるべきリモートの
// 状態が存在しないのだから、設定・記録・記事・画像すべてをまとめて1回の
// add-commit-pushで送ればよい。カテゴリ別に処理を分けると、各カテゴリが
// 独立にリモートの状態を読みに行ったり、同じrefへのコミットを取り合ったり
// （リトライはするが無用な複雑さ）する余地が生まれる。空だと分かっている
// 初回だけは、それ自体を避けられる。
export interface InitialSnapshotData {
  localData: Record<string, string>
  articles: unknown[]
  articleNouns: unknown[]
  articleNounLinks: unknown[]
  collections: unknown[]
  bgImages: ImageRecord[]
  stampImages: ImageRecord[]
}

export async function pushInitialSnapshot(token: string, owner: string, data: InitialSnapshotData): Promise<void> {
  const entries: GitTreeEntry[] = []

  const { settings, logs } = splitLocalData(data.localData)
  entries.push({ path: SETTINGS_PATH, mode: '100644', type: 'blob', content: JSON.stringify(settings, null, 2) })
  if (Object.keys(logs).length > 0) {
    entries.push({ path: LOGS_PATH, mode: '100644', type: 'blob', content: JSON.stringify(logs, null, 2) })
  }

  const articleIndex: ArticleIndexEntry[] = []
  for (const article of data.articles) {
    const rec = article as { postId?: unknown; title?: unknown; date?: unknown }
    const postId = String(rec.postId ?? '')
    if (!postId) continue
    entries.push({ path: articleFilePath(postId), mode: '100644', type: 'blob', content: JSON.stringify(article, null, 2) })
    articleIndex.push({ postId, title: String(rec.title ?? ''), date: String(rec.date ?? '') })
  }
  entries.push({ path: ARTICLES_INDEX_PATH, mode: '100644', type: 'blob', content: JSON.stringify(articleIndex, null, 2) })
  entries.push({
    path: ARTICLES_META_PATH, mode: '100644', type: 'blob',
    content: JSON.stringify({
      nob_stk_nouns: data.articleNouns,
      nob_stk_article_nouns: data.articleNounLinks,
      nob_stk_collections: data.collections,
    }, null, 2),
  })

  for (const [dir, images] of [['images/bg', data.bgImages], ['images/stamp', data.stampImages]] as const) {
    const imageIndex: ImageIndexEntry[] = []
    for (const img of images) {
      const { base64, ext } = parseDataUrl(img.dataUrl)
      const sha = await createBlob(token, owner, base64)
      entries.push({ path: `${dir}/${img.id}.${ext}`, mode: '100644', type: 'blob', sha })
      imageIndex.push({ id: img.id, createdAt: img.createdAt, ext })
    }
    entries.push({ path: `${dir}/index.json`, mode: '100644', type: 'blob', content: JSON.stringify(imageIndex, null, 2) })
  }

  await commitTreeChanges(token, owner, entries, 'GitHub連携: 初回データをまとめてアップロード')
}

// ─── 新規端末で既存リポジトリに接続した際の一括ダウンロード ───────────────────
// 記事が数百件になると、記事ごとに1リクエストで取得する方式（pullArticleFiles）
// は新規端末での初回復元時にリクエスト数がそのまま記事数になってしまい、
// 実際に403件中200件程度までしか降ってこない不具合が起きた。GitHubは
// リポジトリ全体をzip一つでダウンロードできるエンドポイントを提供しており、
// ここから直接読み出せば、記事・画像が何百件あってもリクエストは1回で済む
// （以後の展開・JSON解析はすべてローカルで行う）。
async function fetchRepoZip(token: string, owner: string): Promise<JSZip | null> {
  const res = await githubFetch(token, `/repos/${owner}/${DATA_REPO_NAME}/zipball/${DATA_REPO_BRANCH}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`リポジトリのアーカイブ取得に失敗しました (HTTP ${res.status})`)
  const blob = await res.blob()
  return JSZip.loadAsync(blob)
}

/**
 * zipballの中身は "{owner}-{repo}-{shortsha}/" という単一のルートディレクトリの下に
 * 展開される。そのプレフィックスを取り除いてパス指定できるようにする。
 */
function makeZipReader(zip: JSZip) {
  const rootEntry = Object.keys(zip.files).find(name => /^[^/]+\/$/.test(name))
  const rootPrefix = rootEntry ?? ''
  return {
    async readJson<T>(relPath: string): Promise<T | null> {
      const file = zip.file(rootPrefix + relPath)
      if (!file) return null
      try {
        return JSON.parse(await file.async('string')) as T
      } catch {
        return null
      }
    },
    async readBase64(relPath: string): Promise<string | null> {
      const file = zip.file(rootPrefix + relPath)
      return file ? file.async('base64') : null
    },
  }
}

/**
 * リポジトリの中身を1回のzipダウンロードでまとめて取得する。新規端末で
 * 既存リポジトリに接続した直後（＝ローカルはまだ空）にのみ使う。それ以外の
 * 場面（他端末の変更との突き合わせが必要な場合）は従来のカテゴリ別
 * pull→merge→pushを使うこと。
 */
export async function pullRepoSnapshot(token: string, owner: string): Promise<InitialSnapshotData | null> {
  const zip = await fetchRepoZip(token, owner)
  if (!zip) return null
  const { readJson, readBase64 } = makeZipReader(zip)

  const settings = (await readJson<Record<string, string>>(SETTINGS_PATH)) ?? {}
  const logs = (await readJson<Record<string, string>>(LOGS_PATH)) ?? {}

  const articleIndex = (await readJson<ArticleIndexEntry[]>(ARTICLES_INDEX_PATH)) ?? []
  const articles: unknown[] = []
  for (const entry of articleIndex) {
    const article = await readJson(articleFilePath(entry.postId))
    if (article) articles.push(article)
  }
  const articleMeta = await readJson<Record<string, unknown[]>>(ARTICLES_META_PATH)

  async function readImages(dir: string): Promise<ImageRecord[]> {
    const index = (await readJson<ImageIndexEntry[]>(`${dir}/index.json`)) ?? []
    const images: ImageRecord[] = []
    for (const entry of index) {
      const base64 = await readBase64(`${dir}/${entry.id}.${entry.ext}`)
      if (base64) images.push({ id: entry.id, dataUrl: toDataUrl(base64, entry.ext), createdAt: entry.createdAt })
    }
    return images
  }

  return {
    localData: { ...settings, ...logs },
    articles,
    articleNouns: articleMeta?.nob_stk_nouns ?? [],
    articleNounLinks: articleMeta?.nob_stk_article_nouns ?? [],
    collections: articleMeta?.nob_stk_collections ?? [],
    bgImages: await readImages('images/bg'),
    stampImages: await readImages('images/stamp'),
  }
}
