// IndexedDBデータ（記事ストッカー・背景画像・画像スタンプ）のGitHub自動同期。
// storage.ts の localStorage同期とは別枠（IndexedDBはlocalStorageの save* 経由では検知できないため）。
// 仕様書10章参照。EyecatchCreator.tsx / ArticleStorcker.tsx の保存・削除箇所から
// scheduleIdbSync() を呼び出すことで同期する。

import { storage } from './storage'
import {
  pushArticleStocker, pushBgImages, pushStampImages, checkDataRepoValid,
  pullArticleStocker, pullBgImages, pullStampImages,
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

function idbPutAll(db: IDBDatabase, store: string, records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    records.forEach(r => tx.objectStore(store).put(r))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
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
// 項目は消さない（idbClearしない）。そのうえで必ずマージ後の全件をpushする。
async function mergeArticleStocker(data: Record<string, unknown[]>): Promise<void> {
  const db = await openArticleStockerDB()
  for (const store of AS_STORES) {
    if (Array.isArray(data[store])) await idbPutAll(db, store, data[store])
  }
}
async function mergeBgImages(images: unknown[]): Promise<void> {
  await idbPutAll(await openBgDB(), 'ec_bg_images', images)
}
async function mergeStampImages(images: unknown[]): Promise<void> {
  await idbPutAll(await openStampDB(), 'ec_stamp_images', images)
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

async function pullMergePushCategory(category: IdbCategory, token: string, owner: string): Promise<void> {
  if (category === 'articleStocker') {
    const remote = await pullArticleStocker(token, owner)
    if (remote) await mergeArticleStocker(remote)
    await pushArticleStocker(token, owner, await collectArticleStocker())
  } else if (category === 'bgImages') {
    const remote = await pullBgImages(token, owner)
    if (remote) await mergeBgImages(remote)
    await pushBgImages(token, owner, await collectBgImages())
  } else {
    const remote = await pullStampImages(token, owner)
    if (remote) await mergeStampImages(remote)
    await pushStampImages(token, owner, await collectStampImages())
  }
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

  const categories: IdbCategory[] = ['articleStocker', 'bgImages', 'stampImages']
  const results = await Promise.allSettled(categories.map(c => pullMergePushCategory(c, token, owner)))

  let allOk = true
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      allOk = false
      console.error(`[GitHub連携] ${CATEGORY_LABELS[categories[i]]}の同期に失敗しました`, result.reason)
    }
  })

  if (allOk) clearIdbSyncPending()
}

async function syncCategory(category: IdbCategory): Promise<void> {
  const auth = storage.loadGithubAuth()
  if (!auth) return
  markIdbSyncPending()
  try {
    await pullMergePushCategory(category, auth.token, auth.username)
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
 */
export function scheduleIdbSync(category: IdbCategory): void {
  void syncCategory(category)
}
