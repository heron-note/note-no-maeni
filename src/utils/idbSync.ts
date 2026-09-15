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

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).clear()
    req.onsuccess = () => resolve()
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

async function applyArticleStocker(data: Record<string, unknown[]>): Promise<void> {
  const db = await openArticleStockerDB()
  for (const store of AS_STORES) {
    await idbClear(db, store)
    if (Array.isArray(data[store])) await idbPutAll(db, store, data[store])
  }
}
async function applyBgImages(images: unknown[]): Promise<void> {
  const db = await openBgDB()
  await idbClear(db, 'ec_bg_images')
  await idbPutAll(db, 'ec_bg_images', images)
}
async function applyStampImages(images: unknown[]): Promise<void> {
  const db = await openStampDB()
  await idbClear(db, 'ec_stamp_images')
  await idbPutAll(db, 'ec_stamp_images', images)
}

/**
 * GitHub連携直後に呼び出す。GitHub側にデータがあれば取得してIndexedDBへ反映し、
 * 無ければ（初回セットアップ）ローカルの内容をアップロードする（仕様書10章）。
 */
export async function syncIdbOnConnect(token: string, owner: string): Promise<void> {
  const [remoteArticles, remoteBg, remoteStamps] = await Promise.all([
    pullArticleStocker(token, owner),
    pullBgImages(token, owner),
    pullStampImages(token, owner),
  ])

  if (remoteArticles) await applyArticleStocker(remoteArticles)
  else await pushArticleStocker(token, owner, await collectArticleStocker())

  if (remoteBg) await applyBgImages(remoteBg)
  else await pushBgImages(token, owner, await collectBgImages())

  if (remoteStamps) await applyStampImages(remoteStamps)
  else await pushStampImages(token, owner, await collectStampImages())
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
