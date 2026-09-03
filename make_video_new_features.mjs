#!/usr/bin/env node
// make_video_new_features.mjs
// 新機能デモ動画: 過去記事ストッカー + アイキャッチクリエイター（背景画像・画像スタンプ）
// VOICEVOX (四国めたん) + Playwright + ffmpeg

import { spawn, spawnSync } from 'child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { chromium } from 'playwright'

const BASE_URL  = 'http://localhost:5173'
const VV_URL    = 'http://localhost:50021'
const SPEAKER   = 2   // 四国めたん ノーマル
const ROOT      = '/Volumes/Extreme SSD/note/20260808_app_note_no_maeni'
const DOCS      = `${ROOT}/docs`
const AUDIO_DIR = `${DOCS}/audio_nf`
const SS_DIR    = `${DOCS}/screenshots_nf`
const TMP_DIR   = `${DOCS}/tmp_clips_nf`
const OUTPUT    = `${DOCS}/note-no-maeni-new-features.mp4`

for (const d of [AUDIO_DIR, SS_DIR, TMP_DIR]) mkdirSync(d, { recursive: true })

// ─── Demo user data (localStorage) ───────────────────────────────────────────
const DEMO_USER = JSON.stringify({ name: 'たろう', character: 'kuma', onboarded: true })
const DEMO_LOGS = JSON.stringify({
  '2026-08-01': { type: 'write', timestamp: '2026-08-01T10:00:00.000Z', declarationId: null },
  '2026-08-04': { type: 'write', timestamp: '2026-08-04T10:00:00.000Z', declarationId: null },
  '2026-08-06': { type: 'write', timestamp: '2026-08-06T10:00:00.000Z', declarationId: null },
})
const DEMO_BOOKMARKS = JSON.stringify([
  { id: 'b1', name: 'クリエイターA', url: 'https://note.com', priority: 3, lastRecommendedDate: null, recommendCount: 0 },
])

// ─── Article stocker seed data (IndexedDB) ────────────────────────────────────
const STOCKER_ARTICLES = [
  { postId: 'n001', title: '毎日投稿を続けるコツ',            date: '2026-01-15 00:00:00', body: '連続投稿を3ヶ月続けて気づいたことをまとめます。まず大切なのは完璧を求めないこと。短くても毎日書き続けることが習慣化の近道です。', nounsIndexed: true, nounIds: [1, 2] },
  { postId: 'n002', title: 'noteで稼ぐ方法を考えてみた',     date: '2026-02-20 00:00:00', body: 'noteで収益化するためのアプローチを紹介します。有料記事、定期購読マガジン、サポートなどの方法があります。',                       nounsIndexed: true, nounIds: [2, 3] },
  { postId: 'n003', title: 'フォロワーが増えた記事の共通点',  date: '2026-03-05 00:00:00', body: 'フォロワーが増えた記事には共通するパターンがありました。タイトルの付け方、見出しの構成、締めの言葉が大切です。',                  nounsIndexed: true, nounIds: [1, 3, 4] },
  { postId: 'n004', title: '書けない日の乗り越え方',          date: '2026-04-10 00:00:00', body: 'スランプを乗り越えるための5つの方法を紹介します。散歩、読書、過去記事を読み直すなどが効果的です。',                                nounsIndexed: true, nounIds: [1, 4] },
  { postId: 'n005', title: 'AIを使ってnoteネタを出す',        date: '2026-05-01 00:00:00', body: 'AIツールを使ってネタ出しをする方法について解説します。ChatGPTやGroqを活用したアイデア発想法です。',                              nounsIndexed: true, nounIds: [2, 5] },
  { postId: 'n006', title: 'Kindle出版に向けて記事を整理する', date: '2026-06-15 00:00:00', body: '過去に書いた記事をKindleの一冊にまとめる方法を考えます。テーマ別に分類し、加筆修正する流れを紹介します。',                       nounsIndexed: true, nounIds: [3, 5, 6] },
]
const STOCKER_NOUNS = [
  { id: 1, word: '投稿',       articleCount: 3 },
  { id: 2, word: 'note',      articleCount: 3 },
  { id: 3, word: 'フォロワー', articleCount: 3 },
  { id: 4, word: 'スランプ',   articleCount: 2 },
  { id: 5, word: 'AI',        articleCount: 2 },
  { id: 6, word: 'Kindle',    articleCount: 1 },
]
const STOCKER_LINKS = STOCKER_ARTICLES.flatMap(art =>
  art.nounIds.map(nounId => ({ postId: art.postId, nounId }))
)
const STOCKER_COLLECTIONS = [
  {
    id: 'col001',
    title: 'Kindle出版候補',
    articlePostIds: ['n002', 'n003', 'n006'],
    memo: 'まとめて一冊にしたい記事',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
]

// ─── Scenes ───────────────────────────────────────────────────────────────────
const SCENES = [
  {
    key: 'nf01',
    text: 'ノートのまえに、あたらしいきのうをごしょうかいします。ひとつめは「かこきじストッカー」。ホームがめんのほんのアイコンをタップするとひらきます。noteのせっていから「コンテンツのかんり」でエクスポートしたzipファイルをよみこめます。エクスポートのてじゅんがわからないときは、インポートがめんのリンクをタップしてかくにんしてください。',
    imgs: ['nf01a_home.png', 'nf01b_stocker_empty.png'],
  },
  {
    key: 'nf02',
    text: 'zipをとりこむと、きじのいちらんがひょうじされます。フリーワードで本文もタイトルも、ぜんぶんけんさくできます。きじをタップすると、本文をかくにんしてコピーもできます。',
    imgs: ['nf02a_stocker_articles.png', 'nf02b_stocker_article_view.png'],
  },
  {
    key: 'nf03',
    text: '名詞タブには、きじからじどうちゅうしゅつしたキーワードのいちらんがひょうじされます。タップするだけで名詞でしぼりこみができます。こうひんどのじゅんにならぶので、よくかいているテーマがひとめでわかります。',
    imgs: ['nf03a_stocker_nouns.png', 'nf03b_stocker_noun_filtered.png'],
  },
  {
    key: 'nf04',
    text: 'きにいったきじはコレクションにまとめましょう。コレクションタブからしんきさくせいして、きじの「＋コレクションにつかか」からついかするだけ。ならびかえやマージしてエクスポートもできます。Kindle出版などをかんがえているなら、「外部AI向けプロンプトせいせい」がとてもべんりです。しょうりつて・じゅうふくけんしゅつ・ふそくていあん・タイトルこうほの4しゅるいのプロンプトを、コレクションのきじをもとにじどうせいせい。コピーしていつもつかっているAIにはりつけるだけでつかえます。',
    imgs: ['nf04a_stocker_collection.png', 'nf04b_stocker_col_detail.png', 'nf04c_stocker_prompt_modal.png'],
  },
  {
    key: 'nf05',
    text: 'つぎは、アイキャッチクリエイターのしんきのう「はいけいがぞう」。スタンプ追加タブの「はいけいがぞう」ボタンをタップすると、ほぞんずみの画像からはいけいをえらべます。はいちいちやサイズはトリミングかめんでちょうせいできます。はいけいいろとくみあわせて、よりオリジナリティのあるデザインにしあがります。',
    imgs: ['nf05a_ec_bg_btn.png', 'nf05b_ec_bg_picker.png', 'nf05c_ec_bg_applied.png'],
  },
  {
    key: 'nf06',
    text: 'もうひとつのしんきのう「がぞうスタンプ」では、すきながぞうをキャンバスにはいちできます。スタンプ追加タブから「がぞうスタンプをついか」ボタンでとうろく。ペットのしゃしんやてがきのイラストなど、マイキャラとはちがうすきな画像をスタンプとしてつかえます。はいちしたあとはドラッグ・かいてん・かくだいしゅくしょうもじゆうです。ぜひためしてみてください。',
    imgs: ['nf06a_ec_stamp_btn.png', 'nf06b_ec_stamp_picker.png', 'nf06c_ec_stamp_placed.png'],
  },
]

// ─── VOICEVOX ─────────────────────────────────────────────────────────────────
async function generateAudio(key, text) {
  process.stdout.write(`  🎙 ${key}.wav ... `)
  const qRes = await fetch(
    `${VV_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${SPEAKER}`,
    { method: 'POST' }
  )
  if (!qRes.ok) throw new Error(`audio_query failed: ${qRes.status}`)
  const query = await qRes.json()
  const sRes = await fetch(`${VV_URL}/synthesis?speaker=${SPEAKER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!sRes.ok) throw new Error(`synthesis failed: ${sRes.status}`)
  writeFileSync(`${AUDIO_DIR}/${key}.wav`, Buffer.from(await sRes.arrayBuffer()))
  console.log('done')
}

// ─── Playwright helpers ───────────────────────────────────────────────────────
const VIEWPORT = { width: 390, height: 844 }

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
  await page.screenshot({ path: `${SS_DIR}/${name}` })
  console.log(`  ✓ ${name}`)
}

// ─── IndexedDB injection helpers ──────────────────────────────────────────────

/** 記事ストッカーのIndexedDBにサンプルデータを注入する */
async function injectArticleStockerData(page) {
  await page.evaluate(async ({ articles, nouns, links, collections }) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('NobStockerV2DB', 2)
      req.onsuccess = async () => {
        const db = req.result
        const put = (storeName, items) => new Promise((res, rej) => {
          const tx = db.transaction(storeName, 'readwrite')
          items.forEach(item => tx.objectStore(storeName).put(item))
          tx.oncomplete = res
          tx.onerror   = () => rej(tx.error)
        })
        await put('nob_stk_articles',      articles)
        await put('nob_stk_nouns',         nouns)
        await put('nob_stk_article_nouns', links)
        await put('nob_stk_collections',   collections)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }, {
    articles:    STOCKER_ARTICLES,
    nouns:       STOCKER_NOUNS,
    links:       STOCKER_LINKS,
    collections: STOCKER_COLLECTIONS,
  })
}

/** アイキャッチ用の背景画像と画像スタンプをIndexedDBに注入する */
async function injectEyecatchAssets(page) {
  await page.evaluate(async () => {
    // グラデーション背景画像を生成
    const makeBgDataUrl = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 960; canvas.height = 502
      const ctx = canvas.getContext('2d')
      const grad = ctx.createLinearGradient(0, 0, 960, 502)
      grad.addColorStop(0, '#ffd6e8')
      grad.addColorStop(0.5, '#ffe8d6')
      grad.addColorStop(1, '#d6e8ff')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 960, 502)
      // 水玉模様
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 4; j++) {
          ctx.beginPath()
          ctx.arc(60 + i * 120, 60 + j * 130, 35, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      return canvas.toDataURL('image/webp', 0.85)
    }

    // くまのイラスト風スタンプを生成
    const makeStampDataUrl = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 512; canvas.height = 512
      const ctx = canvas.getContext('2d')
      // 体
      ctx.fillStyle = '#c8a060'
      ctx.beginPath(); ctx.arc(256, 270, 180, 0, Math.PI * 2); ctx.fill()
      // 耳
      ctx.beginPath(); ctx.arc(120, 120, 65, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(392, 120, 65, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e8c090'
      ctx.beginPath(); ctx.arc(120, 120, 38, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(392, 120, 38, 0, Math.PI * 2); ctx.fill()
      // 顔
      ctx.fillStyle = '#d4b07c'
      ctx.beginPath(); ctx.ellipse(256, 300, 120, 95, 0, 0, Math.PI * 2); ctx.fill()
      // 目
      ctx.fillStyle = '#3a2a1a'
      ctx.beginPath(); ctx.arc(196, 245, 18, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(316, 245, 18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(202, 240, 6, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(322, 240, 6, 0, Math.PI * 2); ctx.fill()
      // 鼻
      ctx.fillStyle = '#5a3a2a'
      ctx.beginPath(); ctx.arc(256, 312, 13, 0, Math.PI * 2); ctx.fill()
      // 口
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(256, 318, 22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke()
      return canvas.toDataURL('image/webp', 0.85)
    }

    const openDB = (name, storeName) => new Promise((res, rej) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(storeName, { keyPath: 'id' })
      req.onsuccess = () => res(req.result)
      req.onerror   = () => rej(req.error)
    })

    const putItem = (db, storeName, item) => new Promise((res, rej) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(item)
      tx.oncomplete = res
      tx.onerror    = () => rej(tx.error)
    })

    const bgDb    = await openDB('EcBgDB',    'ec_bg_images')
    const stampDb = await openDB('EcStampDB', 'ec_stamp_images')

    await putItem(bgDb,    'ec_bg_images',    { id: 'bg001',    dataUrl: makeBgDataUrl(),    createdAt: new Date().toISOString() })
    await putItem(stampDb, 'ec_stamp_images', { id: 'stamp001', dataUrl: makeStampDataUrl(), createdAt: new Date().toISOString() })
  })
}

/** ページをリロードしてホームに戻り、スプラッシュを経由して記事ストッカーへ */
async function reloadAndGoToStocker(page) {
  await page.goto(BASE_URL)
  await page.waitForSelector('.splash', { timeout: 8000 })
  await page.click('.splash')
  await page.waitForTimeout(700)
  await page.click('button[aria-label="記事ストッカー"]')
  await page.waitForSelector('.as-root', { timeout: 5000 })
  await page.waitForTimeout(800)
}

/** ページをリロードしてホームに戻り、スプラッシュを経由してアイキャッチクリエイターへ */
async function reloadAndGoToEyecatch(page) {
  await page.goto(BASE_URL)
  await page.waitForSelector('.splash', { timeout: 8000 })
  await page.click('.splash')
  await page.waitForTimeout(700)
  await page.click('button[aria-label="アイキャッチ作成"]')
  await page.waitForSelector('.eyecatch-screen', { timeout: 5000 })
  await page.waitForTimeout(700)
}

// ─── Screenshot capture ───────────────────────────────────────────────────────
async function captureScreenshots() {
  console.log('\n📸 Capturing screenshots...')
  const browser = await chromium.launch({ headless: true })

  // ── nf01: ホーム + 空の記事ストッカー ────────────────────────────────────
  {
    const page = await setupPage(browser)

    // nf01a: ホーム画面
    await shot(page, 'nf01a_home.png')

    // nf01b: 記事ストッカー（空の状態）
    await page.click('button[aria-label="記事ストッカー"]')
    await page.waitForSelector('.as-root', { timeout: 5000 })
    await page.waitForTimeout(600)
    // モバイルではフィルターセクションを開いてインポートエリアを表示
    await page.click('#as-mobile-toggle')
    await page.waitForTimeout(300)
    await shot(page, 'nf01b_stocker_empty.png')
    await page.close()
  }

  // ── nf02: 記事一覧 + 記事本文 ─────────────────────────────────────────────
  {
    const page = await setupPage(browser)
    // ストッカー画面を開いてDBが初期化されるのを待つ
    await page.click('button[aria-label="記事ストッカー"]')
    await page.waitForSelector('.as-root', { timeout: 5000 })
    await page.waitForFunction(
      () => { const el = document.getElementById('as-status'); return el && !el.textContent.includes('接続中') },
      { timeout: 10000 }
    ).catch(() => {})

    // サンプルデータを注入
    await injectArticleStockerData(page)

    // リロードしてデータ反映
    await reloadAndGoToStocker(page)

    // nf02a: 記事一覧
    await shot(page, 'nf02a_stocker_articles.png')

    // nf02b: 記事本文モーダル（モバイル）
    await page.click('.as-article-item')
    await page.waitForTimeout(500)
    await shot(page, 'nf02b_stocker_article_view.png')
    await page.close()
  }

  // ── nf03: 名詞一覧 + 名詞絞り込み ────────────────────────────────────────
  {
    const page = await setupPage(browser)
    await page.click('button[aria-label="記事ストッカー"]')
    await page.waitForSelector('.as-root', { timeout: 5000 })
    await page.waitForFunction(
      () => { const el = document.getElementById('as-status'); return el && !el.textContent.includes('接続中') },
      { timeout: 10000 }
    ).catch(() => {})
    await injectArticleStockerData(page)
    await reloadAndGoToStocker(page)

    // nf03a: 名詞タブ
    await page.click('#as-tab-noun')
    await page.waitForTimeout(400)
    await shot(page, 'nf03a_stocker_nouns.png')

    // nf03b: 名詞をタップして記事絞り込み
    await page.click('.as-noun-browse-item')
    await page.waitForTimeout(400)
    await shot(page, 'nf03b_stocker_noun_filtered.png')
    await page.close()
  }

  // ── nf04: コレクション + コレクション詳細 + AIプロンプトモーダル ─────────
  {
    const page = await setupPage(browser)
    await page.click('button[aria-label="記事ストッカー"]')
    await page.waitForSelector('.as-root', { timeout: 5000 })
    await page.waitForFunction(
      () => { const el = document.getElementById('as-status'); return el && !el.textContent.includes('接続中') },
      { timeout: 10000 }
    ).catch(() => {})
    await injectArticleStockerData(page)
    await reloadAndGoToStocker(page)

    // nf04a: コレクションタブ
    await page.click('#as-tab-collection')
    await page.waitForTimeout(400)
    await shot(page, 'nf04a_stocker_collection.png')

    // nf04b: コレクション詳細（PCレイアウトで表示）
    // モバイルではコレクション選択後メインパネルが表示される
    await page.click('.as-collection-item')
    await page.waitForTimeout(500)
    await shot(page, 'nf04b_stocker_col_detail.png')

    // nf04c: AIプロンプトモーダル
    await page.click('#as-col-prompt-btn')
    await page.waitForTimeout(500)
    await shot(page, 'nf04c_stocker_prompt_modal.png')
    await page.close()
  }

  // ── nf05: アイキャッチ 背景画像 ──────────────────────────────────────────
  {
    const page = await setupPage(browser)

    // アイキャッチを開いてコンポーネントがDBを初期化するまで待つ
    await page.click('button[aria-label="アイキャッチ作成"]')
    await page.waitForSelector('.eyecatch-screen', { timeout: 5000 })
    await page.waitForTimeout(800)

    // 背景画像と画像スタンプをIndexedDBに注入
    await injectEyecatchAssets(page)

    // リロードしてアイキャッチへ（コンポーネントが注入済みデータを読み込む）
    await reloadAndGoToEyecatch(page)

    // nf05a: スタンプ追加タブの「背景画像」ボタンが見える状態
    await shot(page, 'nf05a_ec_bg_btn.png')

    // nf05b: 背景画像ピッカーを開く（注入した画像が表示される）
    await page.locator('.eyecatch-mode-btn:has-text("背景画像")').click()
    await page.waitForTimeout(500)
    await shot(page, 'nf05b_ec_bg_picker.png')

    // nf05c: 背景画像を選択 → ピッカーが閉じてキャンバスに反映
    await page.locator('.bg-picker-row .bg-picker-item').first().click()
    await page.waitForTimeout(500)
    // 編集タブに切り替えてキャンバスを確認
    await page.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
    await page.waitForTimeout(300)
    await shot(page, 'nf05c_ec_bg_applied.png')
    await page.close()
  }

  // ── nf06: アイキャッチ 画像スタンプ ─────────────────────────────────────
  {
    const page = await setupPage(browser)

    await page.click('button[aria-label="アイキャッチ作成"]')
    await page.waitForSelector('.eyecatch-screen', { timeout: 5000 })
    await page.waitForTimeout(800)
    await injectEyecatchAssets(page)
    await reloadAndGoToEyecatch(page)

    // nf06a: スタンプ追加タブにサムネイルが表示された状態
    // （スタンプ登録済みの場合、「＋ 画像スタンプを追加」大ボタンは非表示になり
    //   サムネイル行＋小「＋」ボタンに変わる）
    await shot(page, 'nf06a_ec_stamp_btn.png')

    // nf06b: サムネイル行の「＋」からスタンプピッカーを開く
    await page.locator('.stamp-thumb-add').click()
    await page.waitForTimeout(500)
    await shot(page, 'nf06b_ec_stamp_picker.png')

    // nf06c: ピッカーからスタンプを選択 → キャンバスをタップして配置
    await page.locator('.stamp-picker-item').first().click()
    await page.waitForTimeout(400)
    // ピッカーが閉じ pendingCustom が設定される → キャンバス中央をクリックして配置
    const canvasWrap = page.locator('.eyecatch-canvas-wrap')
    const box = await canvasWrap.boundingBox()
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.waitForTimeout(400)
    // 編集タブでスタンプ配置を確認
    await page.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
    await page.waitForTimeout(300)
    await shot(page, 'nf06c_ec_stamp_placed.png')
    await page.close()
  }

  await browser.close()
}

// ─── WAV duration ─────────────────────────────────────────────────────────────
function getWavDuration(filepath) {
  const buf = readFileSync(filepath)
  const sampleRate    = buf.readUInt32LE(24)
  const numChannels   = buf.readUInt16LE(22)
  const bitsPerSample = buf.readUInt16LE(34)
  const dataSize      = buf.readUInt32LE(40)
  return dataSize / (sampleRate * numChannels * (bitsPerSample / 8))
}

// ─── ffmpeg helpers ───────────────────────────────────────────────────────────
function ffmpeg(...args) {
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  if (r.status !== 0) {
    console.error(r.stderr?.toString())
    throw new Error(`ffmpeg failed: ${args.slice(0, 4).join(' ')} ...`)
  }
}

function makeClip(outPath, imgPath, audioPath, audioDur, audioStart = 0) {
  const pad = 0.25
  ffmpeg(
    '-y',
    '-loop', '1', '-t', String(audioDur + pad), '-i', imgPath,
    '-ss', String(audioStart), '-t', String(audioDur), '-i', audioPath,
    '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=390:844:flags=lanczos',
    '-shortest',
    outPath,
  )
}

// ─── Video assembly ───────────────────────────────────────────────────────────
function assembleVideo() {
  console.log('\n🎬 Assembling video...')
  const allClips = []
  let idx = 0

  for (const scene of SCENES) {
    const audioPath = `${AUDIO_DIR}/${scene.key}.wav`
    if (!existsSync(audioPath)) { console.warn(`  ⚠ Missing audio: ${scene.key}.wav`); continue }

    const totalDur = getWavDuration(audioPath)
    const imgs = scene.imgs
    const perDur = totalDur / imgs.length

    process.stdout.write(`  ${scene.key} (${totalDur.toFixed(1)}s / ${imgs.length} imgs) ... `)

    for (let i = 0; i < imgs.length; i++) {
      const imgPath  = `${SS_DIR}/${imgs[i]}`
      const clipPath = `${TMP_DIR}/clip_${String(idx).padStart(3, '0')}.mp4`
      if (!existsSync(imgPath)) {
        console.warn(`\n  ⚠ Missing image: ${imgs[i]} — skipping`)
        idx++; continue
      }
      makeClip(clipPath, imgPath, audioPath, perDur, i * perDur)
      allClips.push(clipPath)
      idx++
    }
    console.log('done')
  }

  const concatPath = `${TMP_DIR}/concat.txt`
  writeFileSync(concatPath, allClips.map(c => `file '${c}'`).join('\n'))

  process.stdout.write('\n  Concatenating all clips... ')
  ffmpeg('-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', OUTPUT)
  console.log('done')
  console.log(`\n✅ Output: ${OUTPUT}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('🚀 Starting vite dev server...')
const vite = spawn('npm', ['run', 'dev', '--', '--host'], { cwd: ROOT, stdio: 'pipe' })
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite timeout')), 20000)
  const check = d => { if (d.toString().includes('localhost')) { clearTimeout(timer); resolve() } }
  vite.stdout.on('data', check)
  vite.stderr.on('data', check)
})
await new Promise(r => setTimeout(r, 500))
console.log('  ✓ Server ready\n')

try {
  console.log('【Step 1/3】Generating audio (VOICEVOX)...')
  for (const scene of SCENES) await generateAudio(scene.key, scene.text)

  console.log('\n【Step 2/3】Capturing screenshots (Playwright)...')
  await captureScreenshots()

  console.log('\n【Step 3/3】Assembling video (ffmpeg)...')
  assembleVideo()

} finally {
  vite.kill()
  console.log('\n🧹 Dev server stopped.')
}
