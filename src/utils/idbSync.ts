// IndexedDBデータ（記事ストッカー・背景画像・画像スタンプ）のGitHub自動同期。
// storage.ts の localStorage同期とは別枠（IndexedDBはlocalStorageの save* 経由では検知できないため）。
// 仕様書10章参照。EyecatchCreator.tsx / ArticleStorcker.tsx の保存・削除箇所から
// scheduleIdbSync() を呼び出すことで同期する。

import { storage, withGithubSyncIndicator, mergeRemoteIntoLocal } from './storage'
import { logConnect } from './syncLog'
import { collectData } from './transfer'
import {
  pushArticleStocker, pushBgImages, pushStampImages, checkDataRepoValid,
  pullArticleStocker, pullBgImages, pullStampImages,
  pullArticleIndex, pullImageIndex, pushInitialSnapshot, pullRepoSnapshot, type ImageRecord,
} from './github'

function idbOpen(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => upgrade(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGetAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function extractKey(record: unknown, keyPath: string | string[]): IDBValidKey {
  const rec = record as Record<string, unknown>
  return Array.isArray(keyPath) ? (keyPath.map(k => rec[k]) as IDBValidKey) : (rec[keyPath] as IDBValidKey)
}

// マージでは「まだローカルに無いレコードだけ追加する」。既にローカルにある同じidの
// レコードは上書きしない。同じidを put で単純に上書きすると、例えば
// コレクションの並び替え・記事の削除直後にsync（pull→merge→push）が走った際、
// まだそのローカル編集を知らない（1歩古い）リモートの内容でローカルの編集
// そのものを潰して元に戻してしまう（＝編集が無かったことになる）重大な不具合になる。
//
// 以前はレコードごとにget()を発行し、そのonsuccessコールバックの中で個別に
// put()するという実装だった。1トランザクション内に数百件分の「未完了のget()」
// が並行してぶら下がる形になり、ブラウザによってはコールバックが出揃う前に
// トランザクションが自動コミットされてしまうリスクがある（実際に、同じ操作を
// 別ブラウザで行うと復元される記事件数が毎回同じ数だけ少なくなる不具合が
// 確認された）。getAllKeys()で既存キーを1回のリクエストでまとめて取得し、
// その後は同期的にput()するだけにすることで、この種のタイミング依存を無くす。
function idbPutIfAbsent(db: IDBDatabase, store: string, records: unknown[], keyPath: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    const keysReq = os.getAllKeys()
    keysReq.onsuccess = () => {
      const existing = new Set(keysReq.result.map(k => JSON.stringify(k)))
      for (const r of records) {
        if (!existing.has(JSON.stringify(extractKey(r, keyPath)))) os.put(r)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// マージで取り込むリモートのレコードから、指定idのものだけ除外する。
// 「ユーザーが今まさにこの端末で削除した項目」をmerge対象から外すために使う。
// これが無いと、削除直後にpull→mergeすると「リモートにはまだ残っている
// （このpushで消すはずだった）削除済み項目」が削除前の状態としてローカルに
// 復活してしまい、削除操作そのものが無かったことになってしまう。
function excludeById(records: unknown[], keyField: string, excludeId: string | undefined): unknown[] {
  if (!excludeId) return records
  return records.filter(r => (r as Record<string, unknown>)[keyField] !== excludeId)
}

const AS_DB_NAME = 'NobStockerV2DB'
const AS_STORES = ['nob_stk_articles', 'nob_stk_nouns', 'nob_stk_article_nouns', 'nob_stk_collections'] as const

// ArticleStorcker.tsx側のスキーマ（keyPath・autoIncrement・インデックス）と完全に一致させること。
// GitHub連携直後など、ArticleStorcker画面を一度も開いていない端末でこちらが先にDBを
// 新規作成してしまうと、onupgradeneededが再度発火せずスキーマ不一致のまま固定されてしまう
// （必要なインデックスが無く、画面側の名詞検索等がエラーになる）ため。
function openArticleStockerDB(): Promise<IDBDatabase> {
  return idbOpen(AS_DB_NAME, 2, db => {
    if (!db.objectStoreNames.contains('nob_stk_articles')) {
      db.createObjectStore('nob_stk_articles', { keyPath: 'postId' })
    }
    if (!db.objectStoreNames.contains('nob_stk_nouns')) {
      const ns = db.createObjectStore('nob_stk_nouns', { keyPath: 'id', autoIncrement: true })
      ns.createIndex('word', 'word', { unique: true })
    }
    if (!db.objectStoreNames.contains('nob_stk_article_nouns')) {
      const ls = db.createObjectStore('nob_stk_article_nouns', { keyPath: ['postId', 'nounId'] })
      ls.createIndex('nounId', 'nounId', { unique: false })
      ls.createIndex('postId', 'postId', { unique: false })
    }
    if (!db.objectStoreNames.contains('nob_stk_collections')) {
      db.createObjectStore('nob_stk_collections', { keyPath: 'id' })
    }
  })
}

async function collectArticleStocker(): Promise<Record<string, unknown[]>> {
  const db = await openArticleStockerDB()
  const data: Record<string, unknown[]> = {}
  for (const store of AS_STORES) data[store] = await idbGetAll(db, store)
  return data
}

function openBgDB(): Promise<IDBDatabase> {
  return idbOpen('EcBgDB', 1, d => { if (!d.objectStoreNames.contains('ec_bg_images')) d.createObjectStore('ec_bg_images', { keyPath: 'id' }) })
}
function openStampDB(): Promise<IDBDatabase> {
  return idbOpen('EcStampDB', 1, d => { if (!d.objectStoreNames.contains('ec_stamp_images')) d.createObjectStore('ec_stamp_images', { keyPath: 'id' }) })
}

async function collectBgImages(): Promise<unknown[]> {
  return idbGetAll(await openBgDB(), 'ec_bg_images')
}
async function collectStampImages(): Promise<unknown[]> {
  return idbGetAll(await openStampDB(), 'ec_stamp_images')
}

// 「リモートにあればローカルを丸ごと上書き、無ければアップロード」という排他的な
// 分岐は、リモートに何かしらデータがある場合にローカルだけにある項目（他端末で
// まだ同期していない画像・記事）を消してしまう（アップロードされずに終わる）
// 重大なバグだった。IndexedDBへの反映は「無ければ追加」だけ行い、既存のローカル
// 項目は消さない（idbClearしない）だけでなく、上書きもしない（idbPutIfAbsent）。
// そのうえで必ずマージ後の全件をpushする。
const AS_KEYPATHS: Record<string, string | string[]> = {
  nob_stk_articles: 'postId', nob_stk_nouns: 'id',
  nob_stk_article_nouns: ['postId', 'nounId'], nob_stk_collections: 'id',
}

async function mergeArticleStocker(data: Record<string, unknown[]>, excludeCollectionId?: string): Promise<void> {
  const db = await openArticleStockerDB()
  for (const store of AS_STORES) {
    if (!Array.isArray(data[store])) continue
    const records = store === 'nob_stk_collections' ? excludeById(data[store], 'id', excludeCollectionId) : data[store]
    await idbPutIfAbsent(db, store, records, AS_KEYPATHS[store])
  }
}
async function mergeBgImages(images: unknown[], excludeId?: string): Promise<void> {
  await idbPutIfAbsent(await openBgDB(), 'ec_bg_images', excludeById(images, 'id', excludeId), 'id')
}
async function mergeStampImages(images: unknown[], excludeId?: string): Promise<void> {
  await idbPutIfAbsent(await openStampDB(), 'ec_stamp_images', excludeById(images, 'id', excludeId), 'id')
}

// ─── 同期未完了の永続化・自動リトライ ──────────────────────────────────────
// ホーム画面に追加したPWA（特にiOS）は、バックグラウンド化されるとJS実行が
// 通常のSafariタブより積極的に打ち切られることがある。設定・記録・記事・画像を
// 1本のキューで順番に処理する都合上、途中で打ち切られると後ろの方（画像）の
// 同期だけが毎回犠牲になる（実機で確認済み: 通常タブでは成功、PWAでは失敗）。
//
// 1回の実行で必ず終わらせようとするのではなく、「次回アプリ起動時に、まだ
// 終わっていなければ自動的にやり直す」という自己修復の仕組みにする。
const IDB_SYNC_PENDING_KEY = 'ghauth_idb_sync_pending'

function markIdbSyncPending(): void {
  localStorage.setItem(IDB_SYNC_PENDING_KEY, '1')
}
function clearIdbSyncPending(): void {
  localStorage.removeItem(IDB_SYNC_PENDING_KEY)
}
export function isIdbSyncPending(): boolean {
  return localStorage.getItem(IDB_SYNC_PENDING_KEY) === '1'
}

/**
 * 1カテゴリ分の「GitHub側を先に取り込んでからpushする」処理本体。GitHub連携直後・
 * 次回起動時の再試行・記事や画像の保存/削除の即時同期、そのすべてから必ずこの順番
 * （pull→merge→push）で呼び出すこと。pushだけを行うと、まだ何も取り込んでいない
 * 空のローカル状態でリモートの既存データを潰してしまう事故につながる
 * （実際に、記事ストッカーのインデックスがこれで空上書きされた不具合があった）。
 */
type IdbCategory = 'articleStocker' | 'bgImages' | 'stampImages'

const CATEGORY_LABELS: Record<IdbCategory, string> = {
  articleStocker: '記事ストッカー', bgImages: '背景画像', stampImages: '画像スタンプ',
}

/**
 * excludeId: 呼び出し元がこの同期の直前に削除した項目のid（記事ストッカーの
 * 場合はコレクションid）。指定があれば、リモートから取り込む際にこのidだけは
 * 除外し、削除がmergeによって復活しないようにする。
 */
async function pullMergePushCategory(category: IdbCategory, token: string, owner: string, excludeId?: string): Promise<void> {
  await withGithubSyncIndicator(async () => {
    if (category === 'articleStocker') {
      // インデックス（articles/index.json）はこの同期で1回だけ取得し、
      // pull（新規記事の取り込み）・push（追加/削除の差分計算）の両方で
      // 使い回す。以前はpull側・push側がそれぞれ個別に取得し直しており、
      // 記事本体は増分だけで済むよう最適化していてもインデックスだけ
      // 毎回2回取得する無駄なやり取りが残っていた。
      const remoteIndex = await pullArticleIndex(token, owner)
      const localArticles = (await collectArticleStocker()).nob_stk_articles as { postId?: string }[]
      const knownIds = new Set(localArticles.map(a => a.postId).filter((id): id is string => !!id))
      console.info(`[GitHub連携] 記事ストッカー同期: ローカル${localArticles.length}件 / リモートインデックス${remoteIndex?.length ?? '(なし)'}`)
      const remote = await pullArticleStocker(token, owner, remoteIndex, knownIds)
      if (remote) await mergeArticleStocker(remote, excludeId)
      await pushArticleStocker(token, owner, await collectArticleStocker(), remoteIndex)
    } else if (category === 'bgImages') {
      const remoteIndex = await pullImageIndex(token, owner, 'images/bg')
      const localImages = (await collectBgImages()) as { id?: string }[]
      const knownIds = new Set(localImages.map(i => i.id).filter((id): id is string => !!id))
      console.info(`[GitHub連携] 背景画像同期: ローカル${localImages.length}件 / リモートインデックス${remoteIndex?.length ?? '(なし)'}`)
      const remote = await pullBgImages(token, owner, remoteIndex, knownIds)
      if (remote) await mergeBgImages(remote, excludeId)
      await pushBgImages(token, owner, await collectBgImages(), remoteIndex, excludeId)
    } else {
      const remoteIndex = await pullImageIndex(token, owner, 'images/stamp')
      const localImages = (await collectStampImages()) as { id?: string }[]
      const knownIds = new Set(localImages.map(i => i.id).filter((id): id is string => !!id))
      console.info(`[GitHub連携] 画像スタンプ同期: ローカル${localImages.length}件 / リモートインデックス${remoteIndex?.length ?? '(なし)'}`)
      const remote = await pullStampImages(token, owner, remoteIndex, knownIds)
      if (remote) await mergeStampImages(remote, excludeId)
      await pushStampImages(token, owner, await collectStampImages(), remoteIndex, excludeId)
    }
  })
}

/**
 * GitHub連携直後、および次回起動時に未完了分を再開する際に呼び出す。
 *
 * 記事・背景画像・画像スタンプは互いに独立させる。1カテゴリの同期が失敗しても
 * 他のカテゴリの同期は実行する。全カテゴリ成功した場合のみ「完了」とし、
 * 1つでも失敗が残っていれば次回起動時にまた自動で再試行される。
 */
export async function syncIdbOnConnect(token: string, owner: string): Promise<void> {
  markIdbSyncPending()

  // 3カテゴリとも同じブランチ（main）のrefを更新するコミットを行うため、
  // Promise.allSettledで並行に走らせると3者が同じrefを取り合って
  // コンフリクト（非fast-forward）とリトライを頻発させてしまう
  // （リトライ自体は動作を確認済みだが、3者が繰り返し衝突すると
  // 既定のリトライ回数内に収まらず失敗する可能性がある）。実際のHTTP
  // リクエストはこの下のenqueueRequestキューでどのみち直列化されるため、
  // 並行実行にした所で速くはならない。素直に順番に実行し、この種の
  // 衝突自体を起こさないようにする。
  const categories: IdbCategory[] = ['articleStocker', 'bgImages', 'stampImages']
  let allOk = true
  for (const category of categories) {
    try {
      await pullMergePushCategory(category, token, owner)
    } catch (e) {
      allOk = false
      console.error(`[GitHub連携] ${CATEGORY_LABELS[category]}の同期に失敗しました`, e)
    }
  }

  if (allOk) clearIdbSyncPending()
}

/**
 * リポジトリを今まさに新規作成した直後（＝中身は空だと確定している）にだけ
 * 呼び出す。カテゴリ別にpull→merge→pushする理由が無い（突き合わせるべき
 * リモートの状態が存在しない）ため、設定・記録・記事・画像すべてをローカルから
 * まとめて集め、1回のadd-commit-pushで送る。カテゴリごとに分けて処理すると、
 * 各カテゴリが同じrefへのコミットを取り合う・個別にリモートの空インデックスを
 * 読みに行くといった、空だと分かっている場面では本来不要なやり取りが発生する。
 */
export async function pushInitialSnapshotToGithub(token: string, owner: string): Promise<void> {
  await withGithubSyncIndicator(async () => {
    const articleStocker = await collectArticleStocker()
    const bgImages = (await collectBgImages()) as ImageRecord[]
    const stampImages = (await collectStampImages()) as ImageRecord[]
    const articles = articleStocker.nob_stk_articles ?? []
    logConnect('info', `初回一括アップロード: 記事${articles.length}件・背景画像${bgImages.length}件・画像スタンプ${stampImages.length}件`)
    await pushInitialSnapshot(token, owner, {
      localData: collectData(),
      articles,
      articleNouns: articleStocker.nob_stk_nouns ?? [],
      articleNounLinks: articleStocker.nob_stk_article_nouns ?? [],
      collections: articleStocker.nob_stk_collections ?? [],
      bgImages,
      stampImages,
    })
  })
}

/**
 * 新規端末で既存のリポジトリに接続した直後（＝ローカルはまだ空）にだけ使う。
 * 記事ごとに1リクエストで取得するカテゴリ別pullだと、記事が数百件ある場合に
 * その件数分リクエストが発生し、実際に403件中200件程度までしか降ってこない
 * 不具合が起きた。リポジトリ全体をzip1回でダウンロードして展開する
 * pullRepoSnapshotを使うことで、件数によらずリクエストは1回で済む。
 *
 * 戻り値は「リモートに何かデータがあり、復元を試みたか」。false（リポジトリの
 * 中身が読めなかった）の場合、呼び出し側は従来のカテゴリ別pull→merge→push に
 * フォールバックすること。
 */
export async function pullInitialSnapshotFromGithub(token: string, owner: string): Promise<boolean> {
  return withGithubSyncIndicator(async () => {
    const snapshot = await pullRepoSnapshot(token, owner)
    if (!snapshot) {
      logConnect('info', 'zip一括復元: リモートにデータが無いためスキップ')
      return false
    }
    logConnect('info', `zip一括復元: リモートから記事${snapshot.articles.length}件・背景画像${snapshot.bgImages.length}件・画像スタンプ${snapshot.stampImages.length}件を取得`)

    // ローカルに既にあるキーは上書きしない（この端末にだけある設定・記録を
    // 消さないため）。記事・画像側と同じ「無ければ追加」方針をここでも守る。
    mergeRemoteIntoLocal(snapshot.localData)

    await mergeArticleStocker({
      nob_stk_articles: snapshot.articles,
      nob_stk_nouns: snapshot.articleNouns,
      nob_stk_article_nouns: snapshot.articleNounLinks,
      nob_stk_collections: snapshot.collections,
    })
    await mergeBgImages(snapshot.bgImages)
    await mergeStampImages(snapshot.stampImages)

    const localArticleCount = ((await collectArticleStocker()).nob_stk_articles ?? []).length
    const localBgCount = (await collectBgImages()).length
    const localStampCount = (await collectStampImages()).length
    logConnect('info', `zip一括復元: マージ後のローカル件数 記事${localArticleCount}件・背景画像${localBgCount}件・画像スタンプ${localStampCount}件`)
    return true
  })
}

async function syncCategory(category: IdbCategory, excludeId?: string): Promise<void> {
  const auth = storage.loadGithubAuth()
  if (!auth) return
  markIdbSyncPending()
  try {
    await pullMergePushCategory(category, auth.token, auth.username, excludeId)
    // このカテゴリ単体の呼び出しでは、他カテゴリの完了状況までは分からないため
    // pendingフラグはここでは下ろさない。次回起動時のsyncIdbOnConnectが
    // 全カテゴリまとめて確認し、揃って成功していればフラグを下ろす。
  } catch (e) {
    console.error(`[GitHub連携] ${CATEGORY_LABELS[category]}の同期に失敗しました`, e)
    const valid = await checkDataRepoValid(auth.token, auth.username).catch(() => false)
    if (!valid) storage.clearGithubAuth() // ローカルデータには触れない（仕様書10章）
  }
}

/**
 * 記事ストッカー・背景画像・画像スタンプの保存/削除箇所から呼び出す。
 *
 * 画像の登録・削除は連打されるような操作ではないため、デバウンスせず即座に
 * 同期する。以前は2秒待ってから同期する作りだったが、保存直後にアプリを
 * 閉じる／再読み込みするとタイマーが発火する前に消えてしまい、何度やっても
 * 永遠にアップロードされないという重大な不具合があった。
 *
 * deletedId: 直前に削除した項目のid（背景画像・画像スタンプはそのid、記事
 * ストッカーはコレクションid）。削除操作から呼ぶ場合は必ず渡すこと。渡さないと
 * pull→mergeで削除前の状態がリモートから復活し、削除がpushされずに終わる。
 */
export function scheduleIdbSync(category: IdbCategory, deletedId?: string): void {
  void syncCategory(category, deletedId)
}
