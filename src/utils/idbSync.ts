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
const AS_KEY_PATHS: Record<string, string | null> = {
  nob_stk_articles: 'postId', nob_stk_nouns: 'id',
  nob_stk_article_nouns: null, nob_stk_collections: 'id',
}

function openArticleStockerDB(): Promise<IDBDatabase> {
  return idbOpen(AS_DB_NAME, 2, db => {
    AS_STORES.forEach(s => {
      if (!db.objectStoreNames.contains(s)) {
        const kp = AS_KEY_PATHS[s]
        db.createObjectStore(s, kp ? { keyPath: kp } : { autoIncrement: true })
      }
    })
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

/**
 * GitHub連携直後に呼び出す。GitHub側の記事・画像をローカルへマージ（無ければ追加、
 * 既存のローカル項目は消さない）したうえで、マージ後の全件を必ずGitHubへも
 * アップロードする。片方だけの上書きにならないようにする（仕様書10章）。
 *
 * 記事・背景画像・画像スタンプは互いに独立させる。1カテゴリの同期が失敗しても
 * 他のカテゴリの同期は実行する（原因不明のまま全カテゴリが同期されない、という
 * 状態を避けるため）。
 */
export async function syncIdbOnConnect(token: string, owner: string): Promise<void> {
  const results = await Promise.allSettled([
    pullArticleStocker(token, owner).then(async remote => {
      if (remote) await mergeArticleStocker(remote)
      await pushArticleStocker(token, owner, await collectArticleStocker())
    }),
    pullBgImages(token, owner).then(async remote => {
      if (remote) await mergeBgImages(remote)
      await pushBgImages(token, owner, await collectBgImages())
    }),
    pullStampImages(token, owner).then(async remote => {
      if (remote) await mergeStampImages(remote)
      await pushStampImages(token, owner, await collectStampImages())
    }),
  ])

  const labels = ['記事ストッカー', '背景画像', '画像スタンプ']
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[GitHub連携] ${labels[i]}の同期に失敗しました`, result.reason)
    }
  })
}

type IdbCategory = 'articleStocker' | 'bgImages' | 'stampImages'

const timers: Record<IdbCategory, ReturnType<typeof setTimeout> | null> = {
  articleStocker: null, bgImages: null, stampImages: null,
}

async function syncCategory(category: IdbCategory): Promise<void> {
  const auth = storage.loadGithubAuth()
  if (!auth) return
  try {
    if (category === 'articleStocker') {
      await pushArticleStocker(auth.token, auth.username, await collectArticleStocker())
    } else if (category === 'bgImages') {
      await pushBgImages(auth.token, auth.username, await collectBgImages())
    } else {
      await pushStampImages(auth.token, auth.username, await collectStampImages())
    }
  } catch {
    const valid = await checkDataRepoValid(auth.token, auth.username).catch(() => false)
    if (!valid) storage.clearGithubAuth() // ローカルデータには触れない（仕様書10章）
  }
}

/** 記事ストッカー・背景画像・画像スタンプの保存/削除箇所から呼び出す（デバウンス付き）。 */
export function scheduleIdbSync(category: IdbCategory): void {
  const existing = timers[category]
  if (existing) clearTimeout(existing)
  timers[category] = setTimeout(() => syncCategory(category), 2000)
}
