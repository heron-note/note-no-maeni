import { useState, useEffect, useRef } from 'react'
import JSZip from 'jszip'
import { useAppStore } from '../store/useAppStore'

const _BASE = import.meta.env.BASE_URL

function htmlToText(value: string): string {
  let text = value
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|pre|tr)>/gi, '\n')
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<[^>]+>/g, '')
  const ta = document.createElement('textarea')
  ta.innerHTML = text
  text = ta.value
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

interface Collection {
  id: string
  title: string
  articlePostIds: string[]
  memo: string
  createdAt: string
}

export function ArticleStorcker() {
  const goTo = useAppStore(s => s.goTo)
  const [closing, setClosing] = useState(false)
  const initedRef = useRef(false)

  const handleBack = () => {
    setClosing(true)
    setTimeout(() => goTo('home'), 300)
  }

  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true

    const DB_NAME = 'NobStockerV2DB'
    const DB_VERSION = 2
    const STORE_ARTICLES = 'nob_stk_articles'
    const STORE_NOUNS = 'nob_stk_nouns'
    const STORE_ARTICLE_NOUNS = 'nob_stk_article_nouns'
    const STORE_COLLECTIONS = 'nob_stk_collections'

    let db: IDBDatabase | null = null
    let allArticles: any[] = []
    let allNouns: any[] = []
    let allCollections: Collection[] = []
    let nounById = new Map<number, any>()
    let nounByWord = new Map<string, any>()
    let currentFiltered: any[] = []
    let selectedNoun = ''
    let dragDepth = 0
    let currentSortOrder = 'desc'
    let activeArticle: any = null
    let activeCollection: Collection | null = null
    let nounWorker: Worker | null = null
    let nounWorkerReady = false
    let nounWorkerInitPromise: Promise<void> | null = null
    let workerReqSeq = 0
    const workerWaiters = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>()
    const nounQueue: string[] = []
    const nounQueueSet = new Set<string>()
    let queueProcessing = false
    let queueRetryTimer: ReturnType<typeof setTimeout> | null = null
    const NOUN_BROWSE_PAGE_SIZE = 60
    let nounBrowseFiltered: any[] = []
    let nounBrowseRendered = 0
    const morphState = {
      visible: false, phase: 'idle', initMessage: '',
      currentTitle: '', sessionTotal: 0, completed: 0
    }

    const $ = (id: string) => document.getElementById(id)

    // ─── helpers ───────────────────────────────────────────────────────────────
    function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    function waitTx(tx: IDBTransaction): Promise<void> {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    function setStatus(text: string, cls = '') {
      const el = $('as-status')
      if (!el) return
      el.className = 'as-status' + (cls ? ' ' + cls : '')
      el.textContent = text
    }

    // ─── DB ────────────────────────────────────────────────────────────────────
    const dbReq = indexedDB.open(DB_NAME, DB_VERSION)
    dbReq.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const idb = (e.target as IDBOpenDBRequest).result
      const tx = (e.target as IDBOpenDBRequest).transaction!

      if (e.oldVersion < 2) {
        // v1: STORE_ARTICLES keyPath='title', STORE_ARTICLE_NOUNS keyPath=['articleTitle','nounId']
        // v2: keyPath='postId' / ['postId','nounId']
        // v1データが存在する場合は読み出してpostIdを付与しながら移行する

        const migrateV1 = () => {
          // 旧ストアが存在する場合のみ移行
          if (!idb.objectStoreNames.contains(STORE_ARTICLES)) return

          const oldArticles: any[] = []
          const oldLinks: any[] = []
          const oldCollections: any[] = []

          const readOldArticles = tx.objectStore(STORE_ARTICLES).getAll()
          readOldArticles.onsuccess = () => {
            oldArticles.push(...(readOldArticles.result as any[]))
            const readOldLinks = idb.objectStoreNames.contains(STORE_ARTICLE_NOUNS)
              ? tx.objectStore(STORE_ARTICLE_NOUNS).getAll()
              : null
            const afterLinks = (links: any[]) => {
              oldLinks.push(...links)
              const readOldCols = idb.objectStoreNames.contains(STORE_COLLECTIONS)
                ? tx.objectStore(STORE_COLLECTIONS).getAll()
                : null
              const afterCols = (cols: any[]) => {
                oldCollections.push(...cols)
                // 旧ストアを削除して新ストアを作成
                ;[STORE_ARTICLES, STORE_ARTICLE_NOUNS].forEach(s => {
                  if (idb.objectStoreNames.contains(s)) idb.deleteObjectStore(s)
                })
                const newArticles = idb.createObjectStore(STORE_ARTICLES, { keyPath: 'postId' })
                const newLinks = idb.createObjectStore(STORE_ARTICLE_NOUNS, { keyPath: ['postId', 'nounId'] })
                newLinks.createIndex('nounId', 'nounId', { unique: false })
                newLinks.createIndex('postId', 'postId', { unique: false })

                // v1記事をpostId付きで書き直す（postIdはtitleから生成）
                const titleToPostId = new Map<string, string>()
                oldArticles.forEach(art => {
                  const postId = 'legacy_' + art.title
                  titleToPostId.set(art.title, postId)
                  newArticles.put({ ...art, postId })
                })
                // リンクを移行
                oldLinks.forEach(link => {
                  const postId = titleToPostId.get(link.articleTitle)
                  if (postId) newLinks.put({ postId, nounId: link.nounId })
                })
                // コレクションのarticleTitles → articlePostIds
                if (idb.objectStoreNames.contains(STORE_COLLECTIONS)) {
                  const colStore = tx.objectStore(STORE_COLLECTIONS)
                  oldCollections.forEach(col => {
                    const articlePostIds = (col.articleTitles as string[] ?? [])
                      .map((t: string) => titleToPostId.get(t) ?? 'legacy_' + t)
                    colStore.put({ ...col, articlePostIds, articleTitles: undefined })
                  })
                }
              }
              if (readOldCols) {
                readOldCols.onsuccess = () => afterCols(readOldCols.result as any[])
              } else {
                afterCols([])
              }
            }
            if (readOldLinks) {
              readOldLinks.onsuccess = () => afterLinks(readOldLinks.result as any[])
            } else {
              afterLinks([])
            }
          }
        }

        migrateV1()
      }

      if (!idb.objectStoreNames.contains(STORE_ARTICLES)) {
        idb.createObjectStore(STORE_ARTICLES, { keyPath: 'postId' })
      }
      if (!idb.objectStoreNames.contains(STORE_NOUNS)) {
        const ns = idb.createObjectStore(STORE_NOUNS, { keyPath: 'id', autoIncrement: true })
        ns.createIndex('word', 'word', { unique: true })
      }
      if (!idb.objectStoreNames.contains(STORE_ARTICLE_NOUNS)) {
        const ls = idb.createObjectStore(STORE_ARTICLE_NOUNS, { keyPath: ['postId', 'nounId'] })
        ls.createIndex('nounId', 'nounId', { unique: false })
        ls.createIndex('postId', 'postId', { unique: false })
      }
      if (!idb.objectStoreNames.contains(STORE_COLLECTIONS)) {
        idb.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' })
      }
    }
    dbReq.onsuccess = (e: Event) => {
      db = (e.target as IDBOpenDBRequest).result
      setStatus('データベース準備完了')
      loadAllFromDB().then(() => {
        const pending = allArticles.filter(needsNounIndexing)
        if (pending.length > 0) enqueueArticles(pending)
      })
    }
    dbReq.onerror = () => setStatus('エラー: DB接続失敗')
    dbReq.onblocked = () => setStatus('DB更新待機中（他タブを閉じてください）')

    function rebuildNounMaps() {
      nounById = new Map(); nounByWord = new Map()
      allNouns.forEach((n: any) => { nounById.set(n.id, n); nounByWord.set(n.word, n) })
    }

    async function loadAllFromDB() {
      if (!db) return
      const tx = db.transaction([STORE_ARTICLES, STORE_NOUNS, STORE_COLLECTIONS], 'readonly')
      allArticles = await idbRequest(tx.objectStore(STORE_ARTICLES).getAll())
      allNouns = await idbRequest(tx.objectStore(STORE_NOUNS).getAll())
      allNouns.sort((a: any, b: any) => (b.articleCount || 0) - (a.articleCount || 0))
      allCollections = await idbRequest(tx.objectStore(STORE_COLLECTIONS).getAll())
      rebuildNounMaps()
      renderList()
      renderNounBrowseList(true)
      renderCollectionList()
    }

    function needsNounIndexing(art: any) {
      if (art.nounsIndexed === true) return false
      if (Array.isArray(art.nounIds) && art.nounIds.length > 0) return false
      return true
    }

    // ─── Morph overlay ─────────────────────────────────────────────────────────
    function updateMorphOverlay() {
      const show = queueProcessing || nounQueue.length > 0
      const el = $('as-morph-overlay')
      if (!el) return
      el.classList.toggle('as-visible', show)
      if (!show) return
      const statusEl = $('as-morph-status')
      const progEl = $('as-morph-progress') as HTMLProgressElement | null
      const detailEl = $('as-morph-detail')
      const pending = nounQueue.length + (queueProcessing && morphState.currentTitle ? 1 : 0)
      if (morphState.phase === 'init') {
        if (statusEl) statusEl.textContent = morphState.initMessage || 'エンジン準備中...'
        if (progEl) progEl.value = 0
        return
      }
      if (morphState.phase === 'extracting') {
        if (statusEl) statusEl.textContent = morphState.currentTitle ? `解析中: ${morphState.currentTitle}` : '名詞抽出中...'
        const total = Math.max(morphState.sessionTotal, 1)
        if (progEl) progEl.value = Math.round((morphState.completed / total) * 100)
        if (detailEl) detailEl.textContent = `完了 ${morphState.completed} / ${morphState.sessionTotal}件（残り ${pending}件）`
      }
    }

    function enqueueArticles(articles: any[]) {
      let added = 0
      for (const art of articles) {
        const postId = art.postId
        if (!postId || nounQueueSet.has(postId)) continue
        const stored = allArticles.find((a: any) => a.postId === postId)
        if (stored && !needsNounIndexing(stored)) continue
        nounQueue.push(postId); nounQueueSet.add(postId); added++
      }
      if (added > 0) { morphState.sessionTotal += added; updateMorphOverlay(); scheduleQueueProcessor() }
    }

    function scheduleQueueProcessor(delayMs = 0) {
      if (queueRetryTimer) clearTimeout(queueRetryTimer)
      queueRetryTimer = setTimeout(() => { queueRetryTimer = null; startQueueProcessor() }, delayMs)
    }

    async function startQueueProcessor() {
      if (queueProcessing || nounQueue.length === 0) return
      queueProcessing = true; morphState.phase = 'init'; updateMorphOverlay()
      try {
        await ensureNounWorker(false)
        morphState.phase = 'extracting'
        while (nounQueue.length > 0) {
          const postId = nounQueue.shift()!
          nounQueueSet.delete(postId)
          const art = await loadArticleByPostId(postId)
          if (!art || !needsNounIndexing(art)) { morphState.completed++; updateMorphOverlay(); continue }
          morphState.currentTitle = art.title; updateMorphOverlay()
          try {
            const nouns = await extractNounsFromText(art.title, art.body)
            await saveArticleWithNouns(art, nouns)
            await refreshNouns()
            await updateLocalArticle(postId)
            morphState.completed++
            renderList(); renderNounBrowseList(true)
          } catch (err: any) {
            console.warn('名詞抽出失敗:', postId, err)
            nounQueue.push(postId); nounQueueSet.add(postId)
            if (String(err.message || err).includes('形態素解析エンジン')) { resetNounWorker(); throw err }
          }
          updateMorphOverlay()
          await new Promise(r => setTimeout(r, 0))
        }
        morphState.phase = 'idle'; morphState.currentTitle = ''
        if (morphState.completed >= morphState.sessionTotal) { morphState.sessionTotal = 0; morphState.completed = 0 }
        setStatus('形態素解析が完了しました', 'ok')
      } catch (err: any) {
        morphState.phase = 'idle'; morphState.initMessage = err.message || String(err)
        setStatus('形態素解析エンジン待機中（自動リトライ）', 'warn')
        scheduleQueueProcessor(5000)
      } finally {
        queueProcessing = false; morphState.currentTitle = ''; updateMorphOverlay()
        if (!queueProcessing && nounQueue.length > 0) scheduleQueueProcessor(100)
      }
    }

    async function loadArticleByPostId(postId: string) {
      const local = allArticles.find((a: any) => a.postId === postId)
      if (local) return local
      if (!db) return null
      const tx = db.transaction(STORE_ARTICLES, 'readonly')
      return idbRequest(tx.objectStore(STORE_ARTICLES).get(postId))
    }

    async function updateLocalArticle(postId: string) {
      if (!db) return
      const tx = db.transaction(STORE_ARTICLES, 'readonly')
      const art = await idbRequest(tx.objectStore(STORE_ARTICLES).get(postId))
      if (!art) return
      const idx = allArticles.findIndex((a: any) => a.postId === postId)
      if (idx >= 0) allArticles[idx] = art; else allArticles.push(art)
      if (activeArticle && activeArticle.postId === postId) {
        activeArticle = art
        const isMobile = window.innerWidth <= 768
        renderNounChips(isMobile ? $('as-modal-nouns')! : $('as-view-nouns')!, art)
      }
    }

    async function refreshNouns() {
      if (!db) return
      const tx = db.transaction(STORE_NOUNS, 'readonly')
      allNouns = await idbRequest(tx.objectStore(STORE_NOUNS).getAll())
      allNouns.sort((a: any, b: any) => (b.articleCount || 0) - (a.articleCount || 0))
      rebuildNounMaps()
    }

    // ─── Worker ────────────────────────────────────────────────────────────────
    function resetNounWorker() {
      try { nounWorker?.terminate() } catch (_) {}
      nounWorker = null; nounWorkerReady = false; nounWorkerInitPromise = null; workerWaiters.clear()
    }

    function ensureNounWorker(forceReset: boolean): Promise<void> {
      if (forceReset) resetNounWorker()
      if (nounWorkerReady) return Promise.resolve()
      if (nounWorkerInitPromise) return nounWorkerInitPromise
      morphState.phase = 'init'; morphState.initMessage = 'エンジン起動中...'; updateMorphOverlay()
      nounWorkerInitPromise = new Promise((resolve, reject) => {
        let settled = false
        const finish = (fn: (v?: any) => void, val?: any) => { if (settled) return; settled = true; fn(val) }
        const failInit = (err: any) => { workerWaiters.delete('init'); resetNounWorker(); finish(reject, err) }
        nounWorker = new Worker(_BASE + 'noun-worker.js')
        nounWorker.onmessage = (e) => {
          const { type, id, nouns, message } = e.data
          if (type === 'status' && id === 'init') { morphState.phase = 'init'; morphState.initMessage = message; updateMorphOverlay(); return }
          if (type === 'ready' && id === 'init') { nounWorkerReady = true; workerWaiters.delete('init'); finish(resolve); return }
          if (type === 'error' && id === 'init') { failInit(new Error(message || '形態素解析エンジン初期化失敗')); return }
          const waiter = workerWaiters.get(id)
          if (!waiter) return
          workerWaiters.delete(id)
          if (type === 'extracted') waiter.resolve(nouns); else if (type === 'error') waiter.reject(new Error(message))
        }
        nounWorker.onerror = (err) => failInit(err)
        workerWaiters.set('init', { resolve: () => finish(resolve), reject: failInit })
        nounWorker.postMessage({ type: 'init', id: 'init' })
      })
      return nounWorkerInitPromise
    }

    function extractNounsFromText(title: string, body: string): Promise<string[]> {
      return new Promise((resolve, reject) => {
        if (!nounWorkerReady) { reject(new Error('形態素解析エンジン未準備')); return }
        const id = 'req_' + (++workerReqSeq)
        workerWaiters.set(id, { resolve, reject })
        nounWorker!.postMessage({ type: 'extract', id, title, body })
      })
    }

    // ─── Article CRUD ──────────────────────────────────────────────────────────
    async function clearArticleNounLinks(postId: string) {
      if (!db) return
      const tx = db.transaction([STORE_ARTICLE_NOUNS, STORE_NOUNS], 'readwrite')
      const linkStore = tx.objectStore(STORE_ARTICLE_NOUNS)
      const nounStore = tx.objectStore(STORE_NOUNS)
      const links = await idbRequest(linkStore.index('postId').getAll(postId))
      for (const link of links) {
        const noun = await idbRequest(nounStore.get(link.nounId))
        if (noun) { noun.articleCount = Math.max(0, (noun.articleCount || 1) - 1); nounStore.put(noun) }
        linkStore.delete([link.postId, link.nounId])
      }
      await waitTx(tx)
    }

    async function linkArticleToNouns(postId: string, nounWords: string[]): Promise<number[]> {
      if (!db) return []
      const tx = db.transaction([STORE_NOUNS, STORE_ARTICLE_NOUNS], 'readwrite')
      const nounStore = tx.objectStore(STORE_NOUNS)
      const linkStore = tx.objectStore(STORE_ARTICLE_NOUNS)
      const nounIds: number[] = []
      for (const word of nounWords) {
        let noun = await idbRequest(nounStore.index('word').get(word))
        if (!noun) {
          const newId = await idbRequest(nounStore.add({ word, articleCount: 0 }))
          noun = { id: newId, word, articleCount: 0 }
        }
        noun.articleCount = (noun.articleCount || 0) + 1
        nounStore.put(noun); linkStore.put({ postId, nounId: noun.id }); nounIds.push(noun.id)
      }
      await waitTx(tx)
      return nounIds
    }

    async function saveArticleBasic(article: any) {
      await clearArticleNounLinks(article.postId)
      if (!db) return
      const tx = db.transaction(STORE_ARTICLES, 'readwrite')
      tx.objectStore(STORE_ARTICLES).put({ postId: article.postId, title: article.title, date: article.date, body: article.body, nounsIndexed: false, nounIds: [] })
      await waitTx(tx)
    }

    async function saveArticleWithNouns(article: any, nounWords: string[]) {
      await clearArticleNounLinks(article.postId)
      const nounIds = await linkArticleToNouns(article.postId, nounWords)
      if (!db) return
      const tx = db.transaction(STORE_ARTICLES, 'readwrite')
      tx.objectStore(STORE_ARTICLES).put({ ...article, nounIds, nounsIndexed: true })
      await waitTx(tx)
    }

    // ─── Collections ───────────────────────────────────────────────────────────
    async function saveCollection(col: Collection) {
      if (!db) return
      const tx = db.transaction(STORE_COLLECTIONS, 'readwrite')
      tx.objectStore(STORE_COLLECTIONS).put(col)
      await waitTx(tx)
      const idx = allCollections.findIndex(c => c.id === col.id)
      if (idx >= 0) allCollections[idx] = col; else allCollections.push(col)
      renderCollectionList()
    }

    async function deleteCollection(id: string) {
      if (!db) return
      const tx = db.transaction(STORE_COLLECTIONS, 'readwrite')
      tx.objectStore(STORE_COLLECTIONS).delete(id)
      await waitTx(tx)
      allCollections = allCollections.filter(c => c.id !== id)
      if (activeCollection?.id === id) { activeCollection = null; showCollectionDetail(null) }
      renderCollectionList()
    }

    function renderCollectionList() {
      const el = $('as-collection-list')
      if (!el) return
      el.innerHTML = ''
      const sorted = [...allCollections].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      if (sorted.length === 0) {
        el.innerHTML = '<div class="as-col-empty">コレクションがありません<br>記事を見てから「+コレクション」で追加</div>'
        return
      }
      sorted.forEach(col => {
        const item = document.createElement('div')
        item.className = 'as-collection-item' + (activeCollection?.id === col.id ? ' active' : '')
        item.innerHTML = `<span class="as-col-item-title">${col.title}</span><span class="as-col-item-count">${col.articlePostIds.length}件</span>`
        item.addEventListener('click', () => {
          document.querySelectorAll('.as-collection-item').forEach(e => e.classList.remove('active'))
          item.classList.add('active')
          activeCollection = col
          showCollectionDetail(col)
          if (window.innerWidth <= 768) {
            const main = $('as-pc-main')
            if (main) { main.style.display = 'block' }
          }
        })
        el.appendChild(item)
      })
    }

    function showCollectionDetail(col: Collection | null) {
      const detail = $('as-collection-detail')
      const placeholder = $('as-viewer-placeholder')
      const viewer = $('as-viewer')
      if (!detail) return
      if (!col) {
        detail.style.display = 'none'
        if (viewer) viewer.style.display = 'none'
        if (placeholder) { placeholder.style.display = ''; (placeholder as any).style.display = '' }
        return
      }
      if (viewer) viewer.style.display = 'none'
      if (placeholder) placeholder.style.display = 'none'
      detail.style.display = 'flex'
      const titleEl = $('as-col-detail-title') as HTMLInputElement | null
      if (titleEl) titleEl.value = col.title
      const memoEl = $('as-col-detail-memo') as HTMLTextAreaElement | null
      if (memoEl) memoEl.value = col.memo || ''
      renderCollectionArticles(col)
      updateCollectionStats(col)
    }

    function renderCollectionArticles(col: Collection) {
      const listEl = $('as-col-article-list')
      if (!listEl) return
      listEl.innerHTML = ''
      if (col.articlePostIds.length === 0) {
        listEl.innerHTML = '<div class="as-col-art-empty">記事がまだありません</div>'
        return
      }
      col.articlePostIds.forEach((postId, idx) => {
        const art = allArticles.find((a: any) => a.postId === postId)
        const item = document.createElement('div')
        item.className = 'as-col-article-item'
        item.innerHTML = `
          <div class="as-col-art-info">
            <span class="as-col-art-date">${art?.date?.split(' ')[0] ?? '?'}</span>
            <span class="as-col-art-title">${art?.title ?? postId}</span>
          </div>
          <div class="as-col-art-btns">
            <button class="as-col-move-btn" data-dir="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="as-col-move-btn" data-dir="down" ${idx === col.articlePostIds.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="as-col-rm-btn">✕</button>
          </div>`
        item.querySelector('[data-dir="up"]')?.addEventListener('click', () => moveInCollection(col, idx, -1))
        item.querySelector('[data-dir="down"]')?.addEventListener('click', () => moveInCollection(col, idx, 1))
        item.querySelector('.as-col-rm-btn')?.addEventListener('click', () => removeFromCollection(col, idx))
        listEl.appendChild(item)
      })
    }

    function updateCollectionStats(col: Collection) {
      const el = $('as-col-stats')
      if (!el) return
      const totalChars = col.articlePostIds.reduce((sum, postId) => {
        const art = allArticles.find((a: any) => a.postId === postId)
        return sum + (art?.body?.length ?? 0)
      }, 0)
      el.textContent = `${col.articlePostIds.length}件 / 約${totalChars.toLocaleString()}文字`
    }

    async function moveInCollection(col: Collection, idx: number, dir: number) {
      const ni = idx + dir
      if (ni < 0 || ni >= col.articlePostIds.length) return
      const ids = [...col.articlePostIds];
      [ids[idx], ids[ni]] = [ids[ni], ids[idx]]
      const updated = { ...col, articlePostIds: ids }
      await saveCollection(updated)
      activeCollection = updated
      showCollectionDetail(updated)
    }

    async function removeFromCollection(col: Collection, idx: number) {
      const updated = { ...col, articlePostIds: col.articlePostIds.filter((_, i) => i !== idx) }
      await saveCollection(updated)
      activeCollection = updated
      showCollectionDetail(updated)
    }

    function mergeAndExport(col: Collection) {
      const texts = col.articlePostIds.map(postId => {
        const art = allArticles.find((a: any) => a.postId === postId)
        return art ? `# ${art.title}\n日付: ${art.date?.split(' ')[0] ?? ''}\n\n${art.body}\n` : ''
      }).filter(Boolean)
      const merged = texts.join('\n\n---\n\n')
      const blob = new Blob([merged], { type: 'text/plain; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${col.title}.txt`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    // ─── ZIP import ────────────────────────────────────────────────────────────
    async function processZip(file: File) {
      if (!file || !db) { setStatus('エラー: DB未接続'); return }
      setStatus('zip展開中...')
      try {
        const zip = await JSZip.loadAsync(file)
        const xmlEntries = Object.keys(zip.files).filter(n => !zip.files[n].dir && /\.xml$/i.test(n))
        if (xmlEntries.length === 0) throw new Error('zip内にXMLが見つかりません。')
        setStatus('データ解析中...')
        const parsedArticles: any[] = []
        for (const path of xmlEntries) {
          const xmlText = await zip.files[path].async('string')
          const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
          const items = doc.getElementsByTagName('item')
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const postType = item.getElementsByTagName('wp:post_type')[0]?.textContent?.trim()
            const status = item.getElementsByTagName('wp:status')[0]?.textContent?.trim()
            if (postType !== 'post' && postType !== 'page') continue
            if (status && status !== 'publish') continue
            const postIdRaw = item.getElementsByTagName('wp:post_id')[0]?.textContent?.trim()
            if (!postIdRaw) continue
            const postId = postIdRaw
            const title = item.getElementsByTagName('title')[0]?.textContent?.trim() || 'untitled'
            const date = item.getElementsByTagName('wp:post_date')[0]?.textContent?.trim() || 'unknown'
            const rawBody = item.getElementsByTagName('content:encoded')[0]?.textContent || ''
            const body = htmlToText(rawBody)
            if (!body) continue
            parsedArticles.push({ postId, title, date, body })
          }
        }
        if (parsedArticles.length === 0) throw new Error('取り込める記事がありません。')
        setStatus('記事を保存中...')
        for (let i = 0; i < parsedArticles.length; i++) {
          await saveArticleBasic(parsedArticles[i])
          if (i % 20 === 0) { setStatus(`記事を保存中... ${i + 1}/${parsedArticles.length}`); await new Promise(r => setTimeout(r, 0)) }
        }
        setStatus(`${parsedArticles.length}件の記事をインポートしました`, 'ok')
        await loadAllFromDB()
        enqueueArticles(parsedArticles)
        if (window.innerWidth <= 768) $('as-filter-section')?.classList.remove('open')
      } catch (err: any) {
        setStatus('エラー: ' + err.message)
      }
    }

    // ─── Search & list ─────────────────────────────────────────────────────────
    function splitKeywords(s: string) { return s.replace(/　/g, ' ').toLowerCase().split(/\s+/).filter(w => w) }

    function resolveNounFilterIds(input: string): number[] {
      const words = splitKeywords(input)
      if (!words.length) return []
      return words.map(w => (nounByWord.get(w) || allNouns.find((n: any) => n.word.toLowerCase() === w))?.id).filter(Boolean) as number[]
    }

    function normalizeDateInput(val: string) {
      if (!val) return ''
      const t = val.trim().replace(/\//g, '-')
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''
    }

    function formatDateInputLive(value: string, cursorPos: number) {
      const left = value.slice(0, cursorPos).replace(/\D/g, '')
      const right = value.slice(cursorPos).replace(/\D/g, '')
      const digits = (left + right).slice(0, 8)
      let formatted = digits
      if (digits.length > 4) formatted = digits.slice(0, 4) + '-' + digits.slice(4)
      if (digits.length > 6) formatted = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6)
      let newPos = left.length
      if (left.length > 4) newPos++
      if (left.length > 6) newPos++
      return { formatted, newPos: Math.min(newPos, formatted.length) }
    }

    function handleDateInput(e: Event) {
      const el = e.target as HTMLInputElement
      const { formatted, newPos } = formatDateInputLive(el.value, el.selectionStart ?? el.value.length)
      if (el.value !== formatted) { el.value = formatted; el.setSelectionRange(newPos, newPos) }
      renderList()
    }

    function getSearchNounInput() { return selectedNoun }
    function getSearchQueryInput() { return ($('as-search-query') as HTMLInputElement)?.value ?? '' }
    function getDateStart() { return ($('as-date-start') as HTMLInputElement)?.value ?? '' }
    function getDateEnd() { return ($('as-date-end') as HTMLInputElement)?.value ?? '' }

    function renderList() {
      const queryWords = splitKeywords(getSearchQueryInput())
      const nounInput = getSearchNounInput()
      const nounWords = splitKeywords(nounInput)
      const nounFilterIds = resolveNounFilterIds(nounInput)
      const startVal = normalizeDateInput(getDateStart())
      const endVal = normalizeDateInput(getDateEnd())

      currentFiltered = allArticles.filter((art: any) => {
        const bodyAndTitle = (art.title + ' ' + art.body).toLowerCase()
        const matchQuery = queryWords.every(word => bodyAndTitle.includes(word))
        const artNounIds = art.nounIds || []
        const matchNoun = !nounWords.length || (nounFilterIds.length === nounWords.length && nounFilterIds.every(id => artNounIds.includes(id)))
        let matchDate = true
        if (art.date !== 'unknown') {
          const d = art.date.split(' ')[0]
          if (startVal && d < startVal) matchDate = false
          if (endVal && d > endVal) matchDate = false
        } else if (startVal || endVal) matchDate = false
        return matchQuery && matchNoun && matchDate
      })

      currentFiltered.sort((a: any, b: any) =>
        currentSortOrder === 'desc' ? new Date(b.date).getTime() - new Date(a.date).getTime() : new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      const matchCount = $('as-match-count')
      if (matchCount) matchCount.textContent = `該当: ${currentFiltered.length}件` + (nounInput ? ` (名詞: ${nounInput})` : '')
      const bulkBtn = $('as-bulk-add-col') as HTMLElement | null
      if (bulkBtn) bulkBtn.style.display = currentFiltered.length > 0 ? '' : 'none'
      updateSearchToggleLabel()
      updateNounFilterBar()

      const articleList = $('as-article-list')
      if (!articleList) return
      articleList.innerHTML = ''
      currentFiltered.forEach((art: any) => {
        const item = document.createElement('div')
        item.className = 'as-article-item'
        const mark = needsNounIndexing(art) ? '<span style="font-size:0.7rem;opacity:0.6;"> [解析待ち]</span>' : ''
        item.innerHTML = `<div class="as-date">${art.date.split(' ')[0]}</div><div style="word-break:break-all;overflow-wrap:anywhere;font-weight:600;">${art.title}</div>${mark}`
        item.addEventListener('click', () => {
          document.querySelectorAll('.as-article-item').forEach(el => el.classList.remove('active'))
          item.classList.add('active')
          showArticle(art)
        })
        articleList.appendChild(item)
      })
    }

    function updateNounFilterBar() {
      const word = getSearchNounInput()
      const bar = $('as-noun-filter-bar')
      if (!bar) return
      if (!word) { bar.setAttribute('hidden', ''); return }
      bar.removeAttribute('hidden')
      const label = $('as-noun-filter-label')
      if (label) label.textContent = `名詞: ${word}`
    }

    function getSearchFilterHint() {
      const parts = []
      if (getSearchQueryInput().trim()) parts.push('ワード')
      if (getSearchNounInput()) parts.push('名詞')
      if (getDateStart() || getDateEnd()) parts.push('日付')
      return parts.length ? ` (${parts.join('・')}指定中)` : ''
    }

    function updateSearchToggleLabel() {
      const btn = $('as-search-toggle')
      if (!btn) return
      const open = $('as-search-section')?.classList.contains('open')
      const hint = getSearchFilterHint()
      btn.textContent = open ? `検索条件を閉じる${hint}` : `検索条件を開く${hint}`
    }

    function setSearchSectionOpen(open: boolean) {
      $('as-search-section')?.classList.toggle('open', open)
      updateSearchToggleLabel()
    }

    // ─── Noun browse ───────────────────────────────────────────────────────────
    function getBrowseFilteredNouns() {
      const q = ($('as-noun-browse-query') as HTMLInputElement)?.value?.toLowerCase().trim() ?? ''
      let sorted = allNouns.filter((n: any) => (n.articleCount || 0) > 0)
      if (q) sorted = sorted.filter((n: any) => n.word.toLowerCase().includes(q))
      return sorted
    }

    function appendNounBrowseItems() {
      const end = Math.min(nounBrowseRendered + NOUN_BROWSE_PAGE_SIZE, nounBrowseFiltered.length)
      const scroll = $('as-noun-browse-scroll')
      if (!scroll) return
      for (let i = nounBrowseRendered; i < end; i++) {
        const noun = nounBrowseFiltered[i]
        const div = document.createElement('div')
        div.className = 'as-noun-browse-item'
        div.innerHTML = `<span>${noun.word}</span><span class="as-count">${noun.articleCount}件</span>`
        div.addEventListener('click', () => applyNounFilter(noun.word))
        scroll.appendChild(div)
      }
      nounBrowseRendered = end
    }

    function renderNounBrowseList(reset?: boolean) {
      if (reset !== false) {
        nounBrowseFiltered = getBrowseFilteredNouns(); nounBrowseRendered = 0
        const scroll = $('as-noun-browse-scroll')
        if (scroll) scroll.innerHTML = ''
      }
      const summary = $('as-noun-browse-summary')
      if (summary) summary.textContent = nounBrowseFiltered.length > 0
        ? `名詞 ${nounBrowseFiltered.length}件（タップで記事を絞り込み）`
        : '名詞がありません。形態素解析完了後に表示されます。'
      if (nounBrowseRendered === 0 && nounBrowseFiltered.length > 0) appendNounBrowseItems()
    }


    function applyNounFilter(word: string) {
      selectedNoun = word
      setListTab('article')
      renderList()
      if (window.innerWidth <= 768) {
        $('as-filter-section')?.classList.remove('open')
        const btn = $('as-mobile-toggle')
        if (btn) btn.textContent = '検索・インポート条件を開く'
        $('as-mobile-modal')?.classList.remove('open')
      }
    }

    // ─── List tabs ─────────────────────────────────────────────────────────────
    function setListTab(tab: string) {
      ;['article', 'noun', 'collection'].forEach(t => {
        $(`as-tab-${t}`)?.classList.toggle('active', t === tab)
        $(`as-${t}-list`)?.classList.toggle('as-hidden', t !== tab)
      })
      $('as-noun-browse-list')?.classList.toggle('as-browse-active', tab === 'noun')
      ;($('as-article-list') as HTMLElement | null)?.style && (($('as-article-list') as HTMLElement).style.display = tab === 'article' ? '' : 'none')
      ;($('as-noun-browse-list') as HTMLElement | null)?.style && (($('as-noun-browse-list') as HTMLElement).style.display = tab === 'noun' ? '' : 'none')
      ;($('as-collection-list') as HTMLElement | null)?.style && (($('as-collection-list') as HTMLElement).style.display = tab === 'collection' ? '' : 'none')
      const sortBtn = $('as-sort-toggle')
      const matchCount = $('as-match-count')
      if (sortBtn) sortBtn.style.display = tab === 'article' ? '' : 'none'
      if (matchCount) matchCount.style.display = tab === 'article' ? '' : 'none'
      if (tab === 'noun') renderNounBrowseList(true)
      if (tab !== 'collection') {
        activeCollection = null
        document.querySelectorAll('.as-collection-item').forEach(e => e.classList.remove('active'))
        const detail = $('as-collection-detail')
        if (detail) detail.style.display = 'none'
        const viewer = $('as-viewer')
        const placeholder = $('as-viewer-placeholder')
        if (activeArticle && viewer) {
          viewer.style.display = 'block'
          if (placeholder) placeholder.style.display = 'none'
        } else {
          if (viewer) viewer.style.display = 'none'
          if (placeholder) (placeholder as HTMLElement).style.display = ''
        }
      }
    }

    // ─── Article viewer ────────────────────────────────────────────────────────
    function renderNounChips(container: HTMLElement, art: any) {
      container.innerHTML = ''
      if (needsNounIndexing(art)) {
        const hint = document.createElement('span')
        hint.style.cssText = 'font-size:0.8rem;color:var(--muted);'
        hint.textContent = '形態素解析待ち...'
        container.appendChild(hint); container.style.display = 'block'; return
      }
      const ids = art.nounIds || []
      if (!ids.length) { container.style.display = 'none'; return }
      ids.forEach((id: number) => {
        const noun = nounById.get(id)
        if (!noun) return
        const chip = document.createElement('button')
        chip.type = 'button'; chip.className = 'as-noun-chip'; chip.textContent = noun.word
        chip.addEventListener('click', () => applyNounFilter(noun.word))
        container.appendChild(chip)
      })
      container.style.display = container.childElementCount > 0 ? 'flex' : 'none'
    }

    function showArticle(art: any) {
      activeArticle = art
      const isMobile = window.innerWidth <= 768
      const [titleEl, metaEl, bodyEl, nounsEl] = isMobile
        ? [$('as-modal-title'), $('as-modal-meta'), $('as-modal-body'), $('as-modal-nouns')]
        : [$('as-view-title'), $('as-view-meta'), $('as-view-body'), $('as-view-nouns')]
      if (titleEl) titleEl.textContent = art.title
      if (metaEl) metaEl.textContent = `投稿日: ${art.date}`
      if (bodyEl) bodyEl.textContent = art.body
      if (nounsEl) renderNounChips(nounsEl, art)
      if (isMobile) {
        $('as-mobile-modal')?.classList.add('open')
      } else {
        const placeholder = $('as-viewer-placeholder')
        const viewer = $('as-viewer')
        const detail = $('as-collection-detail')
        if (placeholder) placeholder.style.display = 'none'
        if (viewer) viewer.style.display = 'block'
        if (detail) detail.style.display = 'none'
      }
    }

    // ─── Event bindings ────────────────────────────────────────────────────────
    function bindEvents() {
      const dropzone = $('as-dropzone')
      const zipInput = $('as-zip-input') as HTMLInputElement | null
      if (dropzone && zipInput) {
        dropzone.addEventListener('click', () => zipInput.click())
        zipInput.addEventListener('change', (e) => { processZip((e.target as HTMLInputElement).files![0]);(e.target as HTMLInputElement).value = '' })
        dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropzone.classList.add('as-dragover') })
        dropzone.addEventListener('dragover', (e) => e.preventDefault())
        dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth--; if (dragDepth <= 0) dropzone.classList.remove('as-dragover') })
        dropzone.addEventListener('drop', (e: DragEvent) => { e.preventDefault(); dragDepth = 0; dropzone.classList.remove('as-dragover'); if (e.dataTransfer?.files?.[0]) processZip(e.dataTransfer.files[0]) })
      }

      $('as-mobile-toggle')?.addEventListener('click', () => {
        const fs = $('as-filter-section')
        fs?.classList.toggle('open')
        const btn = $('as-mobile-toggle')
        if (btn) btn.textContent = fs?.classList.contains('open') ? '検索・インポート条件を閉じる' : '検索・インポート条件を開く'
      })
      $('as-search-toggle')?.addEventListener('click', () => setSearchSectionOpen(!$('as-search-section')?.classList.contains('open')))
      $('as-search-query')?.addEventListener('input', renderList)
      $('as-date-start')?.addEventListener('input', handleDateInput)
      $('as-date-end')?.addEventListener('input', handleDateInput)
      $('as-sort-toggle')?.addEventListener('click', () => {
        currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc'
        const btn = $('as-sort-toggle')
        if (btn) btn.textContent = currentSortOrder === 'desc' ? '新しい順' : '古い順'
        renderList()
      })
      $('as-tab-article')?.addEventListener('click', () => setListTab('article'))
      $('as-tab-noun')?.addEventListener('click', () => setListTab('noun'))
      $('as-tab-collection')?.addEventListener('click', () => setListTab('collection'))
      $('as-clear-noun-filter')?.addEventListener('click', () => {
        selectedNoun = ''
        renderList()
      })
      $('as-noun-browse-query')?.addEventListener('input', () => renderNounBrowseList(true))
      $('as-noun-browse-scroll')?.addEventListener('scroll', () => {
        const el = $('as-noun-browse-scroll')!
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24 && nounBrowseRendered < nounBrowseFiltered.length) appendNounBrowseItems()
      })
      $('as-reindex-nouns')?.addEventListener('click', async () => {
        if (!db || !allArticles.length) { alert('再解析する記事がありません。'); return }
        if (!confirm(`${allArticles.length}件すべての名詞解析をやり直します。よろしいですか？`)) return
        setStatus('名詞データをリセット中...')
        for (const art of allArticles) await saveArticleBasic(art)
        await loadAllFromDB()
        morphState.sessionTotal = 0; morphState.completed = 0
        enqueueArticles(allArticles)
        setStatus(`${allArticles.length}件を形態素解析キューに追加しました`)
      })

      $('as-delete-db')?.addEventListener('click', async () => {
        if (!confirm('DBを完全に削除します。すべてのデータが消えます。よろしいですか？')) return
        if (db) { db.close() }
        const req = indexedDB.deleteDatabase('NobStockerV2DB')
        req.onsuccess = () => { alert('DB削除完了。リロードします。'); location.reload() }
        req.onerror = () => alert('DB削除失敗: ' + req.error)
      })

      // Copy buttons
      const handleCopy = () => {
        if (!activeArticle) return
        navigator.clipboard.writeText(activeArticle.body).then(() => {
          const isMobile = window.innerWidth <= 768
          const btn = isMobile ? $('as-modal-copy') : $('as-copy-body')
          if (!btn) return
          const orig = btn.textContent
          btn.textContent = 'コピー完了'
          setTimeout(() => { btn.textContent = orig }, 1500)
        })
      }
      $('as-copy-body')?.addEventListener('click', handleCopy)
      $('as-modal-copy')?.addEventListener('click', handleCopy)
      $('as-modal-close')?.addEventListener('click', () => $('as-mobile-modal')?.classList.remove('open'))
      $('as-modal-add-to-collection')?.addEventListener('click', () => {
        $('as-mobile-modal')?.classList.remove('open')
        setTimeout(() => { if (activeArticle) openColPicker([activeArticle]) }, 50)
      })
      $('as-mobile-modal')?.addEventListener('click', (e) => { if (e.target === $('as-mobile-modal')) $('as-mobile-modal')?.classList.remove('open') })

      // Collection actions
      $('as-new-collection')?.addEventListener('click', async () => {
        const title = prompt('コレクション名を入力してください')
        if (!title?.trim()) return
        const col: Collection = { id: crypto.randomUUID(), title: title.trim(), articlePostIds: [], memo: '', createdAt: new Date().toISOString() }
        await saveCollection(col)
        activeCollection = col
        setListTab('collection')
        showCollectionDetail(col)
        renderCollectionList()
      })

      // Collection picker
      let pickerArticles: any[] = []

      const openColPicker = (articles: any[]) => {
        if (!articles.length) return
        pickerArticles = articles
        const isBulk = articles.length > 1
        const listEl = $('as-col-picker-list')
        const titleEl = $('as-col-picker-title')
        if (!listEl) return
        if (titleEl) titleEl.textContent = isBulk ? `${articles.length}件をコレクションに追加` : 'コレクションに追加'
        listEl.innerHTML = ''
        if (allCollections.length === 0) {
          listEl.innerHTML = '<div class="as-col-picker-empty">コレクションがまだありません</div>'
        } else {
          const sorted = [...allCollections].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          sorted.forEach(col => {
            const newIds = articles.map(a => a.postId).filter(id => !col.articlePostIds.includes(id))
            const allAlreadyIn = newIds.length === 0
            const item = document.createElement('button')
            item.className = 'as-col-picker-item' + (allAlreadyIn ? ' as-col-picker-item--added' : '')
            item.disabled = allAlreadyIn
            const countLabel = isBulk && !allAlreadyIn ? `+${newIds.length}件` : `${col.articlePostIds.length}件${allAlreadyIn ? ' ✓' : ''}`
            item.innerHTML = `<span class="as-col-picker-item-title">${col.title}</span><span class="as-col-picker-item-count">${countLabel}</span>`
            item.addEventListener('click', async () => {
              const updated = { ...col, articlePostIds: [...col.articlePostIds, ...newIds] }
              await saveCollection(updated)
              if (activeCollection?.id === updated.id) { activeCollection = updated; showCollectionDetail(updated) }
              setStatus(`「${col.title}」に${newIds.length}件追加しました`, 'ok')
              $('as-col-picker')?.classList.remove('open')
            })
            listEl.appendChild(item)
          })
        }
        const input = $('as-col-picker-input') as HTMLInputElement | null
        if (input) input.value = ''
        $('as-col-picker')?.classList.add('open')
      }

      // "Add to collection" button in article viewer
      $('as-add-to-collection')?.addEventListener('click', () => { if (activeArticle) openColPicker([activeArticle]) })

      $('as-col-picker-close')?.addEventListener('click', () => $('as-col-picker')?.classList.remove('open'))
      $('as-col-picker')?.addEventListener('click', (e) => { if (e.target === $('as-col-picker')) $('as-col-picker')?.classList.remove('open') })
      $('as-col-picker-create')?.addEventListener('click', async () => {
        if (!pickerArticles.length) return
        const input = $('as-col-picker-input') as HTMLInputElement | null
        const title = input?.value?.trim()
        if (!title) { input?.focus(); return }
        const col: Collection = { id: crypto.randomUUID(), title, articlePostIds: pickerArticles.map(a => a.postId), memo: '', createdAt: new Date().toISOString() }
        await saveCollection(col)
        setStatus(`「${col.title}」を作成して${pickerArticles.length}件追加しました`, 'ok')
        $('as-col-picker')?.classList.remove('open')
      })

      // 一括追加ボタン
      $('as-bulk-add-col')?.addEventListener('click', () => {
        if (currentFiltered.length > 0) openColPicker(currentFiltered)
      })

      // Collection detail actions
      $('as-col-detail-close')?.addEventListener('click', () => {
        activeCollection = null
        document.querySelectorAll('.as-collection-item').forEach(e => e.classList.remove('active'))
        showCollectionDetail(null)
      })
      $('as-col-title-save')?.addEventListener('click', async () => {
        if (!activeCollection) return
        const titleEl = $('as-col-detail-title') as HTMLInputElement | null
        const memoEl = $('as-col-detail-memo') as HTMLTextAreaElement | null
        const updated = { ...activeCollection, title: titleEl?.value?.trim() || activeCollection.title, memo: memoEl?.value || '' }
        await saveCollection(updated)
        activeCollection = updated
        setStatus('コレクションを保存しました', 'ok')
        renderCollectionList()
      })
      $('as-col-delete')?.addEventListener('click', async () => {
        if (!activeCollection) return
        if (!confirm(`「${activeCollection.title}」を削除しますか？`)) return
        await deleteCollection(activeCollection.id)
      })
      $('as-col-merge-export')?.addEventListener('click', () => {
        if (activeCollection) mergeAndExport(activeCollection)
      })

      window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
          $('as-mobile-modal')?.classList.remove('open')
          if (activeArticle) showArticle(activeArticle)
        }
      })
    }

    bindEvents()
    setSearchSectionOpen(false)
    setListTab('article')

    return () => {
      try { db?.close() } catch (_) {}
      try { nounWorker?.terminate() } catch (_) {}
      if (queueRetryTimer) clearTimeout(queueRetryTimer)
    }
  }, [])

  return (
    <div className={`as-root${closing ? ' screen-slide-out' : ''}`}>
      {/* Header */}
      <div className="as-header">
        <button className="back-btn" onClick={handleBack}>‹</button>
        <h2 className="subscreen-title">記事ストッカー</h2>
      </div>

      <div className="as-wrapper">
        {/* ─── Sidebar ─────────────────────────────────────────────── */}
        <aside className="as-sidebar">
          <button id="as-mobile-toggle" className="as-mobile-toggle">検索・インポート条件を開く</button>

          <div id="as-filter-section" className="as-filter-section">
            <div className="as-card as-import-card">
              <div id="as-dropzone" className="as-dropzone">
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>zipをドロップ または クリック</div>
                <input id="as-zip-input" type="file" accept=".zip" style={{ display: 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span id="as-status" className="as-status" style={{ flex: 1 }}>DB接続中...</span>
                <button id="as-reindex-nouns" className="as-clear-db-btn" style={{ background: 'var(--primary)', color: '#fff', flexShrink: 0 }}>名詞再解析</button>
                <button id="as-delete-db" className="as-clear-db-btn" style={{ background: '#e53', color: '#fff', flexShrink: 0 }}>DB削除</button>
              </div>
            </div>
            <button id="as-search-toggle" className="as-search-toggle">検索条件を開く</button>
            <div id="as-search-section" className="as-search-section">
              <div className="as-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <label htmlFor="as-search-query" className="as-label">フリーワード検索</label>
                  <input id="as-search-query" type="text" className="as-input" placeholder="スペース区切りでAND検索" autoComplete="off" />
                </div>
                <div>
                  <label className="as-label">日付期間</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input id="as-date-start" type="text" className="as-input" inputMode="numeric" placeholder="YYYY-MM-DD" autoComplete="off" />
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-light)' }}>─</div>
                    <input id="as-date-end" type="text" className="as-input" inputMode="numeric" placeholder="YYYY-MM-DD" autoComplete="off" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* List header */}
          <div className="as-list-header">
            <div className="as-list-tabs">
              <button id="as-tab-article" className="as-list-tab active">記事一覧</button>
              <button id="as-tab-noun" className="as-list-tab">名詞一覧</button>
              <button id="as-tab-collection" className="as-list-tab">コレクション</button>
            </div>
            <span id="as-match-count" className="as-match-count">該当: 0件</span>
            <button id="as-bulk-add-col" className="as-bulk-add-btn" style={{ display: 'none' }}>一括追加</button>
            <button id="as-sort-toggle" className="as-sort-toggle">新しい順</button>
          </div>

          <div id="as-noun-filter-bar" className="as-noun-filter-bar" hidden>
            <span id="as-noun-filter-label">名詞: ---</span>
            <button id="as-clear-noun-filter" className="as-noun-filter-clear">解除</button>
          </div>

          {/* Article list */}
          <div id="as-article-list" className="as-article-list" />

          {/* Noun browse */}
          <div id="as-noun-browse-list" className="as-noun-browse-list" style={{ display: 'none' }}>
            <div className="as-noun-browse-toolbar">
              <input id="as-noun-browse-query" type="text" className="as-input" placeholder="名詞を検索（部分一致）" autoComplete="off" />
            </div>
            <div id="as-noun-browse-summary" className="as-noun-browse-summary">名詞 0件</div>
            <div id="as-noun-browse-scroll" className="as-noun-browse-scroll" />
          </div>

          {/* Collection list */}
          <div id="as-collection-list" className="as-collection-list" style={{ display: 'none' }}>
            <button id="as-new-collection" className="as-action-btn as-btn-accent" style={{ margin: '6px 0' }}>＋ 新規コレクション</button>
          </div>
        </aside>

        {/* ─── Main ────────────────────────────────────────────────── */}
        <main id="as-pc-main" className="as-main">
          {/* Article viewer */}
          <div id="as-viewer" style={{ display: 'none' }}>
            <div className="as-viewer-content">
              <h2 id="as-view-title" className="as-view-title" />
              <div id="as-view-meta" className="as-view-meta" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button id="as-copy-body" className="as-action-btn as-btn-accent" style={{ flex: 1 }}>本文を一撃コピー</button>
                <button id="as-add-to-collection" className="as-action-btn as-btn-ok" style={{ flex: 1 }}>＋ コレクションに追加</button>
              </div>
              <div id="as-view-body" className="as-view-body" />
              <div id="as-view-nouns" className="as-noun-container" />
            </div>
          </div>

          {/* Collection detail */}
          <div id="as-collection-detail" className="as-collection-detail" style={{ display: 'none' }}>
            <div className="as-col-detail-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input id="as-col-detail-title" className="as-col-detail-title-input" type="text" placeholder="コレクション名" style={{ flex: 1 }} />
                <button id="as-col-detail-close" className="as-col-picker-close">✕</button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button id="as-col-title-save" className="as-action-btn as-btn-accent" style={{ flex: 1 }}>保存</button>
                <button id="as-col-delete" className="as-action-btn" style={{ flex: 1, background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' }}>削除</button>
              </div>
              <textarea id="as-col-detail-memo" className="as-col-detail-memo" placeholder="メモ（任意）" rows={2} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span id="as-col-stats" className="as-col-stats" />
                <button id="as-col-merge-export" className="as-action-btn as-btn-ok">マージしてエクスポート</button>
              </div>
            </div>
            <div id="as-col-article-list" className="as-col-article-list" />
          </div>

          {/* Placeholder */}
          <div id="as-viewer-placeholder" className="as-placeholder">
            ← リストから記事を選択するか、zipファイルをインポートしてください。
          </div>
        </main>
      </div>

      {/* Mobile modal */}
      <div id="as-mobile-modal" className="as-modal-viewer">
        <div className="as-modal-content">
          <button id="as-modal-close" className="as-modal-close-btn">閉じる</button>
          <h2 id="as-modal-title" className="as-view-title" />
          <div id="as-modal-meta" className="as-view-meta" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button id="as-modal-copy" className="as-action-btn as-btn-accent" style={{ flex: 1 }}>本文を一撃コピー</button>
            <button id="as-modal-add-to-collection" className="as-action-btn as-btn-ok" style={{ flex: 1 }}>＋ コレクションに追加</button>
          </div>
          <div id="as-modal-body" className="as-view-body" />
          <div id="as-modal-nouns" className="as-noun-container" />
        </div>
      </div>

      {/* Collection picker modal */}
      <div id="as-col-picker" className="as-col-picker-overlay">
        <div className="as-col-picker-box">
          <div className="as-col-picker-header">
            <span className="as-col-picker-title">コレクションに追加</span>
            <button id="as-col-picker-close" className="as-col-picker-close">✕</button>
          </div>
          <div id="as-col-picker-list" className="as-col-picker-list" />
          <div className="as-col-picker-new">
            <input id="as-col-picker-input" type="text" className="as-input" placeholder="新規コレクション名" />
            <button id="as-col-picker-create" className="as-action-btn as-btn-accent">作成して追加</button>
          </div>
        </div>
      </div>

      {/* Morph overlay */}
      <div id="as-morph-overlay" className="as-morph-overlay">
        <div className="as-morph-panel">
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>形態素解析</div>
          <div id="as-morph-status" style={{ fontSize: '0.8rem', color: 'var(--primary)', marginBottom: 6 }}>準備中...</div>
          <progress id="as-morph-progress" max={100} value={0} style={{ width: '100%', height: 8 }} />
          <div id="as-morph-detail" style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 4 }} />
        </div>
      </div>
    </div>
  )
}
