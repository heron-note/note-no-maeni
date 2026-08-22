import { encryptText, decryptText } from './crypto'

// ─── IndexedDB helpers ─────────────────────────────────────────────────────

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

// ─── Article Stocker backup ─────────────────────────────────────────────────

const AS_STORES = ['nob_stk_articles', 'nob_stk_nouns', 'nob_stk_article_nouns', 'nob_stk_collections'] as const

function openAsDB(): Promise<IDBDatabase> {
  return idbOpen('NobStockerV2DB', 2, db => {
    const keyPaths: Record<string, string | null> = {
      nob_stk_articles: 'postId', nob_stk_nouns: 'id',
      nob_stk_article_nouns: null, nob_stk_collections: 'id',
    }
    AS_STORES.forEach(s => {
      if (!db.objectStoreNames.contains(s)) {
        const kp = keyPaths[s]
        db.createObjectStore(s, kp ? { keyPath: kp } : { autoIncrement: true })
      }
    })
  })
}

export async function exportArticles(): Promise<void> {
  const db = await openAsDB()
  const data: Record<string, unknown[]> = {}
  for (const store of AS_STORES) data[store] = await idbGetAll(db, store)
  saveFile(JSON.stringify({ __type__: 'nob_articles_v2', data }, null, 2),
    `note-app-articles-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importArticles(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text())
  if (parsed.__type__ !== 'nob_articles_v2' || typeof parsed.data !== 'object') throw new Error('invalid')
  if (!window.confirm('記事ストッカーの既存データをすべて置き換えます。よろしいですか？')) throw new Error('cancelled')
  const db = await openAsDB()
  for (const store of AS_STORES) {
    await idbClear(db, store)
    if (Array.isArray(parsed.data[store])) await idbPutAll(db, store, parsed.data[store])
  }
}

// ─── BgImages backup ────────────────────────────────────────────────────────

// ─── StampImages backup ──────────────────────────────────────────────────────

export async function exportStampImages(): Promise<void> {
  const db = await idbOpen('EcStampDB', 1, d => { if (!d.objectStoreNames.contains('ec_stamp_images')) d.createObjectStore('ec_stamp_images', { keyPath: 'id' }) })
  const images = await idbGetAll(db, 'ec_stamp_images')
  saveFile(JSON.stringify({ __type__: 'nob_stampimages_v1', images }, null, 2),
    `note-app-stampimages-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importStampImages(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text())
  if (parsed.__type__ !== 'nob_stampimages_v1' || !Array.isArray(parsed.images)) throw new Error('invalid')
  if (!window.confirm('画像スタンプの既存データをすべて置き換えます。よろしいですか？')) throw new Error('cancelled')
  const db = await idbOpen('EcStampDB', 1, d => { if (!d.objectStoreNames.contains('ec_stamp_images')) d.createObjectStore('ec_stamp_images', { keyPath: 'id' }) })
  await idbClear(db, 'ec_stamp_images')
  await idbPutAll(db, 'ec_stamp_images', parsed.images)
}

export async function exportBgImages(): Promise<void> {
  const db = await idbOpen('EcBgDB', 1, d => { if (!d.objectStoreNames.contains('ec_bg_images')) d.createObjectStore('ec_bg_images', { keyPath: 'id' }) })
  const images = await idbGetAll(db, 'ec_bg_images')
  saveFile(JSON.stringify({ __type__: 'nob_bgimages_v1', images }, null, 2),
    `note-app-bgimages-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importBgImages(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text())
  if (parsed.__type__ !== 'nob_bgimages_v1' || !Array.isArray(parsed.images)) throw new Error('invalid')
  if (!window.confirm('背景画像の既存データをすべて置き換えます。よろしいですか？')) throw new Error('cancelled')
  const db = await idbOpen('EcBgDB', 1, d => { if (!d.objectStoreNames.contains('ec_bg_images')) d.createObjectStore('ec_bg_images', { keyPath: 'id' }) })
  await idbClear(db, 'ec_bg_images')
  await idbPutAll(db, 'ec_bg_images', parsed.images)
}

const ENCRYPTED_MARKER = '__enc_v1__'

function collectData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.startsWith('nob_')) data[key] = localStorage.getItem(key)!
  }
  return data
}

function saveFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadImage(dataUrl: string, filename: string): Promise<void> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const file = new File([blob], filename, { type: blob.type })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch {
      // user cancelled or share failed — fall through
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportData(): Promise<void> {
  const data = collectData()
  const filename = `note-no-maeni-backup-${new Date().toISOString().slice(0, 10)}.json`
  const password = window.prompt('バックアップを暗号化するパスワードを入力してください。\n空欄にすると暗号化せずに保存します。')
  if (password === null) return // キャンセル

  if (password === '') {
    saveFile(JSON.stringify(data, null, 2), filename)
    return
  }

  const encrypted = await encryptText(JSON.stringify(data), password)
  saveFile(JSON.stringify({ [ENCRYPTED_MARKER]: encrypted }), filename)
}

export async function importData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target!.result as string) as Record<string, string>
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('invalid')); return
        }

        let data: Record<string, string>

        if (ENCRYPTED_MARKER in parsed) {
          const password = window.prompt('このファイルは暗号化されています。パスワードを入力してください。')
          if (password === null) { reject(new Error('cancelled')); return }
          try {
            data = JSON.parse(await decryptText(parsed[ENCRYPTED_MARKER], password))
          } catch {
            reject(new Error('パスワードが正しくありません')); return
          }
        } else {
          data = parsed
        }

        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('nob_') && typeof value === 'string') {
            localStorage.setItem(key, value)
          }
        }
        resolve()
      } catch {
        reject(new Error('parse error'))
      }
    }
    reader.onerror = () => reject(new Error('read error'))
    reader.readAsText(file)
  })
}
