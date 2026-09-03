#!/usr/bin/env node
// make_article_images.mjs
// note記事用 操作ガイド画像生成（Playwright + 赤枠アノテーション）

import { spawn } from 'child_process'
import { mkdirSync } from 'fs'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const ROOT     = '/Volumes/Extreme SSD/note/20260808_app_note_no_maeni'
const OUT_DIR  = `${ROOT}/docs/article_images`

mkdirSync(OUT_DIR, { recursive: true })

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_USER = JSON.stringify({ name: 'たろう', character: 'kuma', onboarded: true })
const DEMO_LOGS = JSON.stringify({
  '2026-08-01': { type: 'write', timestamp: '2026-08-01T10:00:00.000Z', declarationId: null },
  '2026-08-04': { type: 'write', timestamp: '2026-08-04T10:00:00.000Z', declarationId: null },
})
const DEMO_BOOKMARKS = JSON.stringify([
  { id: 'b1', name: 'クリエイターA', url: 'https://note.com', priority: 3, lastRecommendedDate: null, recommendCount: 0 },
])

const STOCKER_ARTICLES = [
  { postId: 'n001', title: '毎日投稿を続けるコツ',            date: '2026-01-15 00:00:00', body: '連続投稿を3ヶ月続けて気づいたことをまとめます。まず大切なのは完璧を求めないこと。', nounsIndexed: true, nounIds: [1, 2] },
  { postId: 'n002', title: 'noteで稼ぐ方法を考えてみた',     date: '2026-02-20 00:00:00', body: 'noteで収益化するためのアプローチを紹介します。有料記事、定期購読マガジンなど。',   nounsIndexed: true, nounIds: [2, 3] },
  { postId: 'n003', title: 'フォロワーが増えた記事の共通点',  date: '2026-03-05 00:00:00', body: 'フォロワーが増えた記事には共通するパターンがありました。タイトルの付け方が大切。',  nounsIndexed: true, nounIds: [1, 3, 4] },
  { postId: 'n004', title: '書けない日の乗り越え方',          date: '2026-04-10 00:00:00', body: 'スランプを乗り越えるための5つの方法を紹介します。散歩、読書などが効果的です。',    nounsIndexed: true, nounIds: [1, 4] },
  { postId: 'n005', title: 'AIを使ってnoteネタを出す',        date: '2026-05-01 00:00:00', body: 'AIツールを使ってネタ出しをする方法を解説します。GroqやChatGPTの活用法。',         nounsIndexed: true, nounIds: [2, 5] },
  { postId: 'n006', title: 'Kindle出版に向けて記事を整理する', date: '2026-06-15 00:00:00', body: '過去記事をKindleの一冊にまとめる方法を考えます。テーマ別に分類する流れを紹介。', nounsIndexed: true, nounIds: [3, 5, 6] },
]
const STOCKER_NOUNS = [
  { id: 1, word: '投稿',       articleCount: 3 },
  { id: 2, word: 'note',      articleCount: 3 },
  { id: 3, word: 'フォロワー', articleCount: 3 },
  { id: 4, word: 'スランプ',   articleCount: 2 },
  { id: 5, word: 'AI',        articleCount: 2 },
  { id: 6, word: 'Kindle',    articleCount: 1 },
]
const STOCKER_LINKS        = STOCKER_ARTICLES.flatMap(a => a.nounIds.map(nounId => ({ postId: a.postId, nounId })))
const STOCKER_COLLECTIONS  = [
  { id: 'col001', title: 'Kindle出版候補', articlePostIds: ['n002', 'n003', 'n006'], memo: 'まとめて一冊にしたい記事', createdAt: '2026-06-01T00:00:00.000Z' },
]

const VIEWPORT = { width: 390, height: 844 }

// ─── Playwright helpers ───────────────────────────────────────────────────────
async function setupPage(browser) {
  const page = await browser.newPage()
  await page.setViewportSize(VIEWPORT)
  await page.addInitScript(({ user, logs, bookmarks }) => {
    localStorage.setItem('nob_user',         user)
    localStorage.setItem('nob_logs',         logs)
    localStorage.setItem('nob_bookmarks',    bookmarks)
    localStorage.setItem('nob_sound',        'off')
    localStorage.setItem('nob_help_done',    'true')
    localStorage.setItem('nob_ob_help_done', 'true')
  }, { user: DEMO_USER, logs: DEMO_LOGS, bookmarks: DEMO_BOOKMARKS })
  await page.goto(BASE_URL)
  await page.waitForSelector('.splash', { timeout: 8000 })
  await page.click('.splash')
  await page.waitForTimeout(700)
  return page
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  console.log(`  ✓ ${name}.png`)
}

/** CSSセレクタ指定で赤枠を描画 */
async function highlight(page, ...selectors) {
  await page.evaluate((sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel)
      if (!el) { console.warn('highlight: not found', sel); continue }
      const r = el.getBoundingClientRect()
      const d = document.createElement('div')
      d.className = '__hl__'
      d.style.cssText = `position:fixed;left:${r.left-4}px;top:${r.top-4}px;width:${r.width+8}px;height:${r.height+8}px;border:3px solid #ff2020;border-radius:8px;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 3px rgba(255,32,32,0.25)`
      document.body.appendChild(d)
    }
  }, selectors)
}

/** Playwright Locator指定で赤枠を描画（テキスト含む複雑なセレクタ向け） */
async function highlightLocator(page, ...locators) {
  for (const loc of locators) {
    const box = await loc.boundingBox()
    if (!box) continue
    await page.evaluate(({ l, t, w, h }) => {
      const d = document.createElement('div')
      d.className = '__hl__'
      d.style.cssText = `position:fixed;left:${l-4}px;top:${t-4}px;width:${w+8}px;height:${h+8}px;border:3px solid #ff2020;border-radius:8px;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 3px rgba(255,32,32,0.25)`
      document.body.appendChild(d)
    }, { l: box.x, t: box.y, w: box.width, h: box.height })
  }
}

async function clearHighlights(page) {
  await page.evaluate(() => document.querySelectorAll('.__hl__').forEach(e => e.remove()))
}

// ─── IndexedDB injection ──────────────────────────────────────────────────────
async function injectStockerData(page) {
  await page.evaluate(async ({ articles, nouns, links, collections }) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('NobStockerV2DB', 2)
      req.onsuccess = async () => {
        const db = req.result
        const put = (s, items) => new Promise((res, rej) => {
          const tx = db.transaction(s, 'readwrite')
          items.forEach(i => tx.objectStore(s).put(i))
          tx.oncomplete = res; tx.onerror = () => rej(tx.error)
        })
        await put('nob_stk_articles',      articles)
        await put('nob_stk_nouns',         nouns)
        await put('nob_stk_article_nouns', links)
        await put('nob_stk_collections',   collections)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }, { articles: STOCKER_ARTICLES, nouns: STOCKER_NOUNS, links: STOCKER_LINKS, collections: STOCKER_COLLECTIONS })
}

async function injectEyecatchAssets(page) {
  await page.evaluate(async () => {
    const makeBg = () => {
      const c = document.createElement('canvas'); c.width = 960; c.height = 502
      const ctx = c.getContext('2d')
      const g = ctx.createLinearGradient(0, 0, 960, 502)
      g.addColorStop(0, '#ffd6e8'); g.addColorStop(0.5, '#ffe8d6'); g.addColorStop(1, '#d6e8ff')
      ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 502)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        ctx.beginPath(); ctx.arc(60 + i * 120, 60 + j * 130, 35, 0, Math.PI * 2); ctx.fill()
      }
      return c.toDataURL('image/webp', 0.85)
    }
    const makeStamp = () => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 512
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#c8a060'; ctx.beginPath(); ctx.arc(256, 270, 180, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(120, 120, 65, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(392, 120, 65, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e8c090'
      ctx.beginPath(); ctx.arc(120, 120, 38, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(392, 120, 38, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#d4b07c'; ctx.beginPath(); ctx.ellipse(256, 300, 120, 95, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#3a2a1a'
      ctx.beginPath(); ctx.arc(196, 245, 18, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(316, 245, 18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(202, 240, 6, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(322, 240, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.arc(256, 312, 13, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(256, 318, 22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke()
      return c.toDataURL('image/webp', 0.85)
    }
    const openDB = (name, store) => new Promise((res, rej) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(store, { keyPath: 'id' })
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error)
    })
    const put = (db, store, item) => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(item); tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    const bgDb    = await openDB('EcBgDB',    'ec_bg_images')
    const stampDb = await openDB('EcStampDB', 'ec_stamp_images')
    await put(bgDb,    'ec_bg_images',    { id: 'bg001',    dataUrl: makeBg(),    createdAt: new Date().toISOString() })
    await put(stampDb, 'ec_stamp_images', { id: 'stamp001', dataUrl: makeStamp(), createdAt: new Date().toISOString() })
  })
}

async function reloadToStocker(page) {
  await page.goto(BASE_URL)
  await page.waitForSelector('.splash', { timeout: 8000 })
  await page.click('.splash')
  await page.waitForTimeout(700)
  await page.click('button[aria-label="記事ストッカー"]')
  await page.waitForSelector('.as-root', { timeout: 5000 })
  await page.waitForTimeout(800)
}

async function reloadToEyecatch(page) {
  await page.goto(BASE_URL)
  await page.waitForSelector('.splash', { timeout: 8000 })
  await page.click('.splash')
  await page.waitForTimeout(700)
  await page.click('button[aria-label="アイキャッチ作成"]')
  await page.waitForSelector('.eyecatch-screen', { timeout: 5000 })
  await page.waitForTimeout(700)
}

// ─── Vite dev server ──────────────────────────────────────────────────────────
console.log('🚀 Starting vite dev server...')
const vite = spawn('npm', ['run', 'dev', '--', '--host'], { cwd: ROOT, stdio: 'pipe' })
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite timeout')), 20000)
  const check = d => { if (d.toString().includes('localhost')) { clearTimeout(timer); resolve() } }
  vite.stdout.on('data', check); vite.stderr.on('data', check)
})
await new Promise(r => setTimeout(r, 500))
console.log('  ✓ Server ready\n')

const browser = await chromium.launch({ headless: true })

try {
  console.log('📸 Capturing article images...\n')

  // ════════════════════════════════════════════════════
  //  記事ストッカー
  // ════════════════════════════════════════════════════
  console.log('── 記事ストッカー ──')

  // 01: ホーム画面 → 記事ストッカーボタンを赤枠
  {
    const page = await setupPage(browser)
    await highlight(page, 'button[aria-label="記事ストッカー"]')
    await shot(page, '01_home_stocker_btn')
    await page.close()
  }

  // 02: インポートエリア（空） — ZIPドロップゾーン + エクスポートリンクを赤枠
  {
    const page = await setupPage(browser)
    await page.click('button[aria-label="記事ストッカー"]')
    await page.waitForSelector('.as-root', { timeout: 5000 })
    await page.waitForTimeout(600)
    await page.click('#as-mobile-toggle')   // モバイルでフィルタ展開
    await page.waitForTimeout(350)
    await highlight(page, '#as-dropzone', 'a[href*="nifty_sheep"]')
    await shot(page, '02_stocker_import_area')
    await page.close()
  }

  // 03〜08 はデータあり状態で共用
  const sp = await setupPage(browser)
  await sp.click('button[aria-label="記事ストッカー"]')
  await sp.waitForSelector('.as-root', { timeout: 5000 })
  await sp.waitForFunction(
    () => { const el = document.getElementById('as-status'); return el && !el.textContent.includes('接続中') },
    { timeout: 10000 }
  ).catch(() => {})
  await injectStockerData(sp)
  await reloadToStocker(sp)

  // 03: 記事一覧（全体を見せる・ハイライトなし）
  await shot(sp, '03_stocker_article_list')

  // 04: 検索条件トグルボタンを赤枠
  await highlight(sp, '#as-search-toggle')
  await shot(sp, '04_stocker_search_toggle')
  await clearHighlights(sp)

  // 05: 名詞タブを赤枠
  await highlight(sp, '#as-tab-noun')
  await shot(sp, '05_stocker_noun_tab')
  await clearHighlights(sp)

  // 06: コレクションタブ → 新規コレクションボタンを赤枠
  await sp.click('#as-tab-collection')
  await sp.waitForTimeout(400)
  await highlight(sp, '#as-new-collection')
  await shot(sp, '06_stocker_collection_new_btn')
  await clearHighlights(sp)

  // 07: コレクション詳細 → AIプロンプトボタンを赤枠
  await sp.click('.as-collection-item')
  await sp.waitForTimeout(500)
  await highlight(sp, '#as-col-prompt-btn')
  await shot(sp, '07_stocker_ai_prompt_btn')
  await clearHighlights(sp)

  // 08: AIプロンプトモーダル → コピーボタンを赤枠
  await sp.click('#as-col-prompt-btn')
  await sp.waitForTimeout(500)
  await highlight(sp, '#as-prompt-copy')
  await shot(sp, '08_stocker_prompt_copy_btn')
  await sp.close()

  // ════════════════════════════════════════════════════
  //  アイキャッチクリエイター（背景画像・画像スタンプ）
  // ════════════════════════════════════════════════════
  console.log('\n── アイキャッチクリエイター ──')

  const ep = await setupPage(browser)
  await ep.click('button[aria-label="アイキャッチ作成"]')
  await ep.waitForSelector('.eyecatch-screen', { timeout: 5000 })
  await ep.waitForTimeout(800)
  await injectEyecatchAssets(ep)
  await reloadToEyecatch(ep)

  // 09: 背景画像ボタンを赤枠
  const bgBtn = ep.locator('.eyecatch-mode-btn:has-text("背景画像")')
  await highlightLocator(ep, bgBtn)
  await shot(ep, '09_ec_bg_btn')
  await clearHighlights(ep)

  // 10: 背景画像ピッカー → 画像サムネイルを赤枠
  await bgBtn.click()
  await ep.waitForTimeout(500)
  await highlightLocator(ep, ep.locator('.bg-picker-row .bg-picker-item').first())
  await shot(ep, '10_ec_bg_picker')
  await clearHighlights(ep)

  // 11: 背景画像適用後（ハイライトなし・キャンバス全体を見せる）
  await ep.locator('.bg-picker-row .bg-picker-item').first().click()
  await ep.waitForTimeout(400)
  await ep.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
  await ep.waitForTimeout(300)
  await shot(ep, '11_ec_bg_applied')

  // 12: スタンプ追加タブ → stamp-thumb-add（＋）を赤枠
  await ep.locator('.eyecatch-mode-tab').filter({ hasText: 'スタンプ追加' }).click()
  await ep.waitForTimeout(300)
  await highlightLocator(ep, ep.locator('.stamp-thumb-add'))
  await shot(ep, '12_ec_stamp_add_btn')
  await clearHighlights(ep)

  // 13: スタンプピッカー → スタンプアイテムを赤枠
  await ep.locator('.stamp-thumb-add').click()
  await ep.waitForTimeout(500)
  await highlightLocator(ep, ep.locator('.stamp-picker-item').first())
  await shot(ep, '13_ec_stamp_picker')
  await clearHighlights(ep)

  // 14: スタンプ配置後（ハイライトなし・キャンバス全体を見せる）
  await ep.locator('.stamp-picker-item').first().click()
  await ep.waitForTimeout(400)
  const box = await ep.locator('.eyecatch-canvas-wrap').boundingBox()
  await ep.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await ep.waitForTimeout(400)
  await ep.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
  await ep.waitForTimeout(300)
  await shot(ep, '14_ec_stamp_placed')
  await ep.close()

  console.log(`\n✅ 14枚 → ${OUT_DIR}`)

} finally {
  await browser.close()
  vite.kill()
  console.log('🧹 Dev server stopped.')
}
