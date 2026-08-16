#!/usr/bin/env node
// make_video.mjs — Full pipeline: VOICEVOX audio → screenshots → mp4

import { spawn, spawnSync } from 'child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { chromium } from 'playwright'

const BASE_URL  = 'http://localhost:5173'
const VV_URL    = 'http://localhost:50021'
const SPEAKER   = 2  // 四国めたん ノーマル
const ROOT      = '/Volumes/Extreme SSD/note/20260808_app_colabo'
const DOCS      = `${ROOT}/docs`
const AUDIO_DIR = `${DOCS}/audio`
const SS_DIR    = `${DOCS}/screenshots`
const TMP_DIR   = `${DOCS}/tmp_clips`
const OUTPUT    = `${DOCS}/note-no-maeni-demo.mp4`

for (const d of [AUDIO_DIR, SS_DIR, TMP_DIR]) mkdirSync(d, { recursive: true })

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_USER = JSON.stringify({ name: 'たろう', character: 'kuma', onboarded: true })
const DEMO_LOGS = JSON.stringify({
  '2026-08-01': { type: 'write', timestamp: '2026-08-01T10:00:00.000Z', declarationId: null },
  '2026-08-02': { type: 'rest',  timestamp: '2026-08-02T10:00:00.000Z', declarationId: 'r01' },
  '2026-08-04': { type: 'write', timestamp: '2026-08-04T10:00:00.000Z', declarationId: null },
  '2026-08-05': { type: 'rest',  timestamp: '2026-08-05T10:00:00.000Z', declarationId: 'r02' },
  '2026-08-06': { type: 'write', timestamp: '2026-08-06T10:00:00.000Z', declarationId: null },
  '2026-08-07': { type: 'write', timestamp: '2026-08-07T10:00:00.000Z', declarationId: null },
})
const DEMO_BOOKMARKS = JSON.stringify([
  { id: 'b1', name: 'クリエイターA', url: 'https://note.com', priority: 3, lastRecommendedDate: null, recommendCount: 0 },
  { id: 'b2', name: 'クリエイターB', url: 'https://note.com', priority: 2, lastRecommendedDate: null, recommendCount: 0 },
])
const DEMO_USER_TEMPLATES = JSON.stringify([{
  id: 'ut01',
  title: '週次振り返り',
  lines: ['<p>今週もお疲れ様でした！</p>', '<p>気づいたこと、感じたことをまとめます。</p>'],
}])
const DEMO_REST_TEMPLATES = JSON.stringify([{
  id: 'rt01',
  title: 'ふつうの休み宣言',
  lines: ['<p>本日はお休みをいただきます。またお会いしましょう！</p>'],
  insertAfterIndex: -1,
}])

// ─── Scenes ───────────────────────────────────────────────────────────────────
// imgs: array of screenshot filenames — audio is split evenly across images
const SCENES = [
  {
    key: 'scene01',
    text: 'ノートをつづけたいけど、なかなかかけない。そんなあなたにそりそう、かくしゅうかんサポートアプリ「ノートのまえに」。',
    imgs: ['scene01a_splash.png', 'scene01b_home.png'],
  },
  {
    key: 'scene02',
    text: 'きょうはかくぞ！ときめたら「かく」ボタン。あいぼうがいっしょによろこんでくれます。テンプレートをとうろくしていなくても、ノートをひらくことができます。テンプレートをえらんでボタンをおすと、ノートのしんきしたがきがひらいて、テンプレートがすぐつかえます。はりつけたあとは、ほぞんをわすれずに。',
    imgs: ['scene02a_write_notpl.png', 'scene02b_write_withtpl.png'],
  },
  {
    key: 'scene03',
    text: 'きょうはやすむひもあります。「やすむ」ボタンをおすと、やすもっかけいかくのはつどうせんげんがひょうじされます。テンプレートをとうろくしておけば、ドロップダウンでえらんで「コピーしてnoteへ」をおすと、しんきしたがきにはりつけるだけで「やすみます」のきじをすぐにとうこうできます。テンプレートはさいだい5けんとうろくでき、つかいわけられます。',
    imgs: ['scene03a_rest_notpl.png', 'scene03b_rest_withtpl.png'],
  },
  {
    key: 'scene04',
    text: 'テンプレートは、かんりがめんからついかできます。「あたらしいテンプレートをついか」をおすと、へんしゅうがめんへ。ノートのきじをそのままはりつけてつかえるほか、テキストをにゅうりょくしてせんたくすると、ツールバーがひょうじされます。みだしのせっていや、だいじの強調など、ゼロからてがるにテンプレートをつくることもできます。せんげんをうめこむいちをしていしておけば、まいかいてなおしなしでとうこうできます。',
    imgs: ['scene04a_tpl_list.png', 'scene04b_tpl_new.png', 'scene04c_tpl_typing.png', 'scene04d_tpl_toolbar.png'],
  },
  {
    key: 'scene05',
    text: 'かいたひはきいろ、やすんだひはあおのスタンプが、カレンダーにつみかさなっていきます。つきビューで、かこのきろくもまとめてかくにんできます。',
    imgs: ['scene05a_calendar_week.png', 'scene05b_calendar_month.png'],
  },
  {
    key: 'scene06',
    text: 'アイキャッチがぞうも、アプリないでつくれます。まず、はいけいしょくをこのみのいろにへんこう。やすもっかスタンプをすきないろでおきます。テキストボタンをおしてキャンバスをタップすれば、タイトルをそのばでにゅうりょくできます。あいぼうスタンプボタンでキャラをえらべば、3ポーズをキャンバスにはいち。はいちしたスタンプはドラッグでいどう、すみのハンドルでかくだいしゅくしょう、あおいハンドルでかいてんも。できあがったらDLボタンでダウンロード。ノートのサムネイルにそのままつかえます。',
    imgs: ['scene06a_ec_blank.png', 'scene06b_ec_bgcolor.png', 'scene06c_ec_stamp.png', 'scene06d_ec_text.png', 'scene06e_ec_chara.png'],
  },
  {
    key: 'scene07',
    text: 'なにをかけばいいかわからないひは、AIにそうだんできます。せっていがめんでGroqのAPIキーをとうろくするだけで、むりょうでつかえます。あいぼうがいっしょにかんがえてくれます。',
    imgs: ['scene07_home.png'],
  },
  {
    key: 'scene08',
    text: 'だれのきじからよもうかまよったときは、「おすすめ」きのうをつかいましょう。きになるクリエイターをブックマークとうろくしておくと、ランダムにえらんでくれます。',
    imgs: ['scene08a_bookmark.png', 'scene08b_recommend.png'],
  },
  {
    key: 'scene09',
    text: 'せっていでは、なまえやあいぼうキャラクターをへんこうできます。すきながぞうをあいぼうにする、クリエイトきのうもあります。データのエクスポート・インポートにもたいおうしているので、きしゅへんこうのときもあんしんです。',
    imgs: ['scene09_settings.png'],
  },
  {
    key: 'scene10',
    text: 'かくひも、よむひも、やすむひも。ノートのまえに、そっとそばにいます。ブラウザでいますぐつかえます。ホームがめんについかして、アプリとしてつかうのがおすすめです。',
    imgs: ['scene10_ending.png'],
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

async function setupPage(browser, extraStorage = {}) {
  const page = await browser.newPage()
  await page.setViewportSize(VIEWPORT)
  await page.addInitScript(({ user, logs, bookmarks, extra }) => {
    localStorage.setItem('nob_user',      user)
    localStorage.setItem('nob_logs',      logs)
    localStorage.setItem('nob_bookmarks', bookmarks)
    localStorage.setItem('nob_sound',     'off')
    localStorage.setItem('nob_help_done',    'true')
    localStorage.setItem('nob_ob_help_done', 'true')
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v)
  }, { user: DEMO_USER, logs: DEMO_LOGS, bookmarks: DEMO_BOOKMARKS, extra: extraStorage })
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

// ─── Screenshot capture ───────────────────────────────────────────────────────
async function captureScreenshots() {
  console.log('\n📸 Capturing screenshots...')
  const browser = await chromium.launch({ headless: true })

  // scene01: Splash + Home
  {
    const page = await browser.newPage()
    await page.setViewportSize(VIEWPORT)
    await page.goto(BASE_URL)
    await page.waitForTimeout(800)
    await shot(page, 'scene01a_splash.png')
    await page.addInitScript(({ user, logs }) => {
      localStorage.setItem('nob_user', user)
      localStorage.setItem('nob_logs', logs)
      localStorage.setItem('nob_sound', 'off')
      localStorage.setItem('nob_help_done', 'true')
      localStorage.setItem('nob_ob_help_done', 'true')
    }, { user: DEMO_USER, logs: DEMO_LOGS })
    await page.reload()
    await page.waitForSelector('.splash', { timeout: 8000 })
    await page.click('.splash')
    await page.waitForTimeout(700)
    await shot(page, 'scene01b_home.png')
    await page.close()
  }

  // scene02: 書くオーバーレイ（テンプレートなし / あり）
  {
    // テンプレートなし
    const page1 = await setupPage(browser)
    await page1.click('button.choice-btn.write')
    await page1.waitForTimeout(900)
    await shot(page1, 'scene02a_write_notpl.png')
    await page1.close()

    // テンプレートあり
    const page2 = await setupPage(browser, {
      nob_user_templates: DEMO_USER_TEMPLATES,
      nob_last_user_tpl: 'ut01',
    })
    await page2.click('button.choice-btn.write')
    await page2.waitForTimeout(900)
    await shot(page2, 'scene02b_write_withtpl.png')
    await page2.close()
  }

  // scene03: 休むオーバーレイ（テンプレートなし / あり）
  {
    // テンプレートなし
    const page1 = await setupPage(browser)
    await page1.click('button.choice-btn.rest')
    await page1.waitForTimeout(1000)
    await shot(page1, 'scene03a_rest_notpl.png')
    await page1.close()

    // テンプレートあり
    const page2 = await setupPage(browser, {
      nob_rest_templates: DEMO_REST_TEMPLATES,
      nob_last_rest_tpl: 'rt01',
    })
    await page2.click('button.choice-btn.rest')
    await page2.waitForTimeout(1000)
    await shot(page2, 'scene03b_rest_withtpl.png')
    await page2.close()
  }

  // scene04: テンプレート管理 → 新規 → 入力 → ツールバー
  {
    // テンプレート管理一覧（既存テンプレートあり）
    const page1 = await setupPage(browser, { nob_user_templates: DEMO_USER_TEMPLATES })
    await page1.click('button:has-text("記事テンプレートを管理")')
    await page1.waitForTimeout(600)
    await shot(page1, 'scene04a_tpl_list.png')

    // 「新しいテンプレートを追加」をクリック
    await page1.click('button:has-text("新しいテンプレートを追加")')
    await page1.waitForTimeout(600)
    await shot(page1, 'scene04b_tpl_new.png')

    // テキストを入力
    const richtext = page1.locator('.template-richtext')
    await richtext.click()
    await page1.waitForTimeout(200)
    await page1.keyboard.type('今週もお疲れ様でした！')
    await page1.keyboard.press('Enter')
    await page1.keyboard.type('気づいたこと、感じたことをまとめていきます。')
    await page1.waitForTimeout(300)
    await shot(page1, 'scene04c_tpl_typing.png')

    // テキスト全選択 → ツールバー表示
    await page1.keyboard.press('Meta+a')
    await page1.waitForTimeout(500)
    await shot(page1, 'scene04d_tpl_toolbar.png')
    await page1.close()
  }

  // scene05: カレンダー
  {
    const page = await setupPage(browser)
    await shot(page, 'scene05a_calendar_week.png')
    await page.click('.calendar-month-btn')
    await page.waitForTimeout(500)
    await shot(page, 'scene05b_calendar_month.png')
    await page.close()
  }

  // scene06: アイキャッチ（5段階）
  {
    const page = await setupPage(browser)
    await page.click('button[aria-label="アイキャッチ作成"]')
    await page.waitForSelector('.eyecatch-screen', { timeout: 5000 })
    await page.waitForTimeout(600)

    // 06a: 初期状態
    await shot(page, 'scene06a_ec_blank.png')

    // 06b: 背景色を変更（ピンク系）
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('.eyecatch-section input[type="color"]')
      const bgInput = inputs[0]
      if (!bgInput) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(bgInput, '#ffeef4')
      bgInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(300)
    await shot(page, 'scene06b_ec_bgcolor.png')

    // 06c: 休もっかスタンプを配置
    await page.click('.eyecatch-stamp-icon-btn:has(.eyecatch-stamp-mini)')
    await page.waitForTimeout(400)
    // 編集モードに切り替えて表示
    await page.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
    await page.waitForTimeout(200)
    await shot(page, 'scene06c_ec_stamp.png')

    // 06d: テキスト（タイトル）を追加
    await page.locator('.eyecatch-mode-tab').filter({ hasText: 'スタンプ追加' }).click()
    await page.waitForTimeout(200)
    await page.locator('.eyecatch-mode-btn').filter({ hasText: 'T' }).click()
    await page.waitForTimeout(200)
    const canvasWrap = page.locator('.eyecatch-canvas-wrap')
    const box = await canvasWrap.boundingBox()
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.28)
    await page.waitForTimeout(400)
    await page.keyboard.type('noteのまえに')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    // 編集モードで確認
    await page.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
    await page.waitForTimeout(200)
    await shot(page, 'scene06d_ec_text.png')

    // 06e: 相棒スタンプを配置
    await page.locator('.eyecatch-mode-tab').filter({ hasText: 'スタンプ追加' }).click()
    await page.waitForTimeout(200)
    await page.locator('.eyecatch-stamp-icon-btn:has(img)').click()
    await page.waitForTimeout(300)
    // ポーズピッカーから「ふつう」を選択
    await page.locator('.eyecatch-pose-btn').first().click()
    await page.waitForTimeout(200)
    // キャンバス右側をクリックして配置
    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.6)
    await page.waitForTimeout(300)
    // 編集モードで表示
    await page.locator('.eyecatch-mode-tab').filter({ hasText: '編集' }).click()
    await page.waitForTimeout(300)
    await shot(page, 'scene06e_ec_chara.png')
    await page.close()
  }

  // scene07: ホーム（AI機能の説明に使う）
  {
    const page = await setupPage(browser)
    await shot(page, 'scene07_home.png')
    await page.close()
  }

  // scene08: おすすめ
  {
    const page = await setupPage(browser)
    await page.click('button[aria-label="おすすめ編集"]')
    await page.waitForTimeout(600)
    await shot(page, 'scene08a_bookmark.png')
    await page.click('button:has-text("✕"), button[aria-label="閉じる"]')
    await page.waitForTimeout(300)
    await page.click('button[aria-label="おすすめ"]')
    await page.waitForTimeout(500)
    await shot(page, 'scene08b_recommend.png')
    await page.close()
  }

  // scene09: 設定
  {
    const page = await setupPage(browser)
    await page.click('button[aria-label="設定"]')
    await page.waitForSelector('.subscreen-title', { timeout: 5000 })
    await page.waitForTimeout(600)
    await shot(page, 'scene09_settings.png')
    await page.close()
  }

  // scene10: エンディング（ホーム）
  {
    const page = await setupPage(browser)
    await shot(page, 'scene10_ending.png')
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
    throw new Error(`ffmpeg failed: ${args.slice(0,4).join(' ')} ...`)
  }
}

// Make a clip: image + audio segment (audioStart/audioDur for slicing)
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
      const clipPath = `${TMP_DIR}/clip_${String(idx).padStart(3,'0')}.mp4`
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
  console.log(`\n✅ Video: ${OUTPUT}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('🚀 Starting vite dev server...')
const vite = spawn('npm', ['run', 'dev', '--', '--host'], { cwd: ROOT, stdio: 'pipe' })
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite timeout')), 15000)
  const check = d => { if (d.toString().includes('localhost')) { clearTimeout(timer); resolve() } }
  vite.stdout.on('data', check)
  vite.stderr.on('data', check)
})
await new Promise(r => setTimeout(r, 500))
console.log('  ✓ Server ready\n')

try {
  console.log('【Step 1/3】Generating audio...')
  for (const scene of SCENES) await generateAudio(scene.key, scene.text)

  console.log('\n【Step 2/3】Capturing screenshots...')
  await captureScreenshots()

  console.log('\n【Step 3/3】Assembling video...')
  assembleVideo()

} finally {
  vite.kill()
  console.log('\n🧹 Dev server stopped.')
}
