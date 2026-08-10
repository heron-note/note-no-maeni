import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { useAppStore } from '../store/useAppStore'
import { Toast } from '../components/Toast'
import { useSlideBack } from '../hooks/useSlideBack'

const CANVAS_SIZE = 320
const CROP_SIZE = 256
const CROP_OFF = (CANVAS_SIZE - CROP_SIZE) / 2  // 32

const STATES: Array<{ key: string; label: string; desc: string }> = [
  {
    key: 'normal',
    label: '通常',
    desc: 'ホーム画面に表示される通常の相棒姿です。正面向きのポーズが向いています。',
  },
  {
    key: 'write',
    label: '書く',
    desc: '「書く」を選んだ時のオーバーレイに表示されます。元気や期待感のある表情・ポーズが向いています。',
  },
  {
    key: 'rest',
    label: '休む',
    desc: '「休む」のスタンプ画面に表示されます。ゆったりくつろいだ表情・ポーズが向いています。',
  },
]

const POSE_SUFFIXES: Record<string, string> = {
  normal: 'front view, facing viewer, full body, standing, neutral expression, empty hands',
  write: 'front view, facing viewer, full body, standing, motivated and enthusiastic expression, energetically holding a pen, excited to write',
  rest: 'front view, facing viewer, full body, sitting or lying down, relaxed and drowsy expression, lazily resting, peaceful and carefree',
}

const POSE_LABELS: Record<string, string> = {
  normal: '通常',
  write: '書く',
  rest: '休む',
}

const STYLE_TAGS = 'white background, anime illustration, flat color, 2D, chibi, kawaii, yuru-chara, Japanese anime style, simple design, full body, white background'

const NEGATIVE_PROMPT = '3d,3d render,photorealistic,realistic,photo,render,cgi,profile picture,avatar,icon,badge,emblem,circle background,round background,circular frame,oval frame,colored background,green background,blue background,red background,yellow background,textured background,gradient background,scenery,landscape,frame,border,decoration,pattern,vignette,shadow,multiple characters,environment,watermark'

function hasJapanese(text: string): boolean {
  return /[\u3000-\u9fff]/.test(text)
}

async function toEnglish(text: string): Promise<string> {
  if (!hasJapanese(text)) return text
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ja|en`)
    const data = await res.json()
    return data.responseData?.translatedText ?? text
  } catch {
    return text
  }
}

function buildPrompt(description: string, poseKey: string): string {
  return `${POSE_SUFFIXES[poseKey]}, ${description} character, ${STYLE_TAGS}, white background`
}

function pollinationsUrl(prompt: string, seed: number): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true&model=turbo&negative_prompt=${encodeURIComponent(NEGATIVE_PROMPT)}`
}

interface CropRef {
  offsetX: number
  offsetY: number
  scale: number
  dragging: boolean
  lastX: number
  lastY: number
  pinchDist: number
}

// エッジからのフラッドフィルで背景色を透過
function removeBg(img: HTMLImageElement, tolerance: number): Promise<HTMLImageElement> {
  return new Promise(resolve => {
    const w = img.width, h = img.height
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, w, h)
    const d = imageData.data

    // 四隅＋各辺中央の色をシードとして収集
    const getColor = (x: number, y: number): [number, number, number] => {
      const i = (y * w + x) * 4
      return [d[i], d[i + 1], d[i + 2]]
    }
    const seeds = [
      getColor(0, 0), getColor(w - 1, 0),
      getColor(0, h - 1), getColor(w - 1, h - 1),
      getColor(Math.floor(w / 2), 0),
      getColor(0, Math.floor(h / 2)),
      getColor(w - 1, Math.floor(h / 2)),
      getColor(Math.floor(w / 2), h - 1),
    ]

    const visited = new Uint8Array(w * h)
    const stack: number[] = []

    const visit = (x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return
      const idx = y * w + x
      if (visited[idx]) return
      visited[idx] = 1
      const pi = idx * 4
      if (d[pi + 3] === 0) return
      const r = d[pi], g = d[pi + 1], b = d[pi + 2]
      const match = seeds.some(([sr, sg, sb]) =>
        Math.max(Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb)) <= tolerance
      )
      if (!match) return
      d[pi + 3] = 0
      stack.push(x, y)
    }

    for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1) }
    for (let y = 1; y < h - 1; y++) { visit(0, y); visit(w - 1, y) }

    while (stack.length > 0) {
      const y = stack.pop()!
      const x = stack.pop()!
      visit(x + 1, y); visit(x - 1, y)
      visit(x, y + 1); visit(x, y - 1)
    }

    ctx.putImageData(imageData, 0, 0)
    const out = new Image()
    out.onload = () => resolve(out)
    out.src = canvas.toDataURL('image/png')
  })
}

function CropPanel({ label, desc, onExport, aiUrl, aiMode }: {
  stateKey: string
  label: string
  desc: string
  onExport: (dataUrl: string | null) => void
  aiUrl?: string
  aiMode?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const origImgRef = useRef<HTMLImageElement | null>(null)   // オリジナル
  const drawImgRef = useRef<HTMLImageElement | null>(null)   // 描画用（BG除去後）
  const cropRef = useRef<CropRef>({
    offsetX: 0, offsetY: 0, scale: 1,
    dragging: false, lastX: 0, lastY: 0, pinchDist: 0,
  })
  const [hasImage, setHasImage] = useState(false)
  const [imageVersion, setImageVersion] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [bgTolerance, setBgTolerance] = useState(25)
  const [bgApplied, setBgApplied] = useState(false)
  const [bgProcessing, setBgProcessing] = useState(false)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = drawImgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    const { offsetX, offsetY, scale } = cropRef.current
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    ctx.drawImage(img, offsetX, offsetY, img.width * scale, img.height * scale)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, CANVAS_SIZE, CROP_OFF)
    ctx.fillRect(0, CROP_OFF + CROP_SIZE, CANVAS_SIZE, CROP_OFF)
    ctx.fillRect(0, CROP_OFF, CROP_OFF, CROP_SIZE)
    ctx.fillRect(CROP_OFF + CROP_SIZE, CROP_OFF, CROP_OFF, CROP_SIZE)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(CROP_OFF + 1, CROP_OFF + 1, CROP_SIZE - 2, CROP_SIZE - 2)
  }, [])

  useEffect(() => {
    if (hasImage) redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, imageVersion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasImage) return
    const handleTouchMove = (e: TouchEvent) => {
      // ドラッグ中またはピンチ中のみスクロールをブロック
      if (cropRef.current.dragging || e.touches.length >= 2) {
        e.preventDefault()
      }
    }
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => canvas.removeEventListener('touchmove', handleTouchMove)
  }, [hasImage])

  useEffect(() => {
    if (!aiUrl) return
    const load = (el: HTMLImageElement) => {
      origImgRef.current = el
      initCrop(el)
      setConfirmed(false)
      setPreviewUrl(null)
      setBgApplied(false)
      onExport(null)
      setHasImage(true)
      setImageVersion(v => v + 1)
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => load(img)
    img.onerror = () => { const img2 = new Image(); img2.onload = () => load(img2); img2.src = aiUrl }
    img.src = aiUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiUrl])

  const getScaledDelta = (dx: number, dy: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { dx, dy }
    const rect = canvas.getBoundingClientRect()
    return {
      dx: dx * (CANVAS_SIZE / rect.width),
      dy: dy * (CANVAS_SIZE / rect.height),
    }
  }

  const initCrop = (img: HTMLImageElement) => {
    drawImgRef.current = img
    const fitScale = Math.min(CROP_SIZE / img.width, CROP_SIZE / img.height)
    cropRef.current = {
      offsetX: CROP_OFF + (CROP_SIZE - img.width * fitScale) / 2,
      offsetY: CROP_OFF + (CROP_SIZE - img.height * fitScale) / 2,
      scale: fitScale,
      dragging: false, lastX: 0, lastY: 0, pinchDist: 0,
    }
  }

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      origImgRef.current = img
      initCrop(img)
      setConfirmed(false)
      setPreviewUrl(null)
      setBgApplied(false)
      onExport(null)
      setHasImage(true)
      setImageVersion(v => v + 1)
    }
    img.src = url
  }

  const handleRemoveBg = async () => {
    const src = origImgRef.current
    if (!src) return
    setBgProcessing(true)
    const processed = await removeBg(src, bgTolerance)
    initCrop(processed)
    setBgApplied(true)
    setBgProcessing(false)
    setConfirmed(false)
    setPreviewUrl(null)
    onExport(null)
    redraw()
  }

  const handleResetBg = () => {
    const orig = origImgRef.current
    if (!orig) return
    initCrop(orig)
    setBgApplied(false)
    setConfirmed(false)
    setPreviewUrl(null)
    onExport(null)
    redraw()
  }

  const onMouseDown = (e: React.MouseEvent) => {
    cropRef.current.dragging = true
    cropRef.current.lastX = e.clientX
    cropRef.current.lastY = e.clientY
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!cropRef.current.dragging) return
    const { dx, dy } = getScaledDelta(
      e.clientX - cropRef.current.lastX,
      e.clientY - cropRef.current.lastY,
    )
    cropRef.current.offsetX += dx
    cropRef.current.offsetY += dy
    cropRef.current.lastX = e.clientX
    cropRef.current.lastY = e.clientY
    redraw()
  }
  const stopDrag = () => { cropRef.current.dragging = false }

  const applyZoom = (newScale: number) => {
    const cx = CANVAS_SIZE / 2, cy = CANVAS_SIZE / 2
    const { offsetX, offsetY, scale } = cropRef.current
    const clamped = Math.max(0.05, Math.min(20, newScale))
    const f = clamped / scale
    cropRef.current.scale = clamped
    cropRef.current.offsetX = cx + (offsetX - cx) * f
    cropRef.current.offsetY = cy + (offsetY - cy) * f
    redraw()
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    applyZoom(cropRef.current.scale * (e.deltaY > 0 ? 0.9 : 1.1))
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      cropRef.current.dragging = true
      cropRef.current.lastX = e.touches[0].clientX
      cropRef.current.lastY = e.touches[0].clientY
    } else if (e.touches.length === 2) {
      cropRef.current.dragging = false
      cropRef.current.pinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && cropRef.current.dragging) {
      const { dx, dy } = getScaledDelta(
        e.touches[0].clientX - cropRef.current.lastX,
        e.touches[0].clientY - cropRef.current.lastY,
      )
      cropRef.current.offsetX += dx
      cropRef.current.offsetY += dy
      cropRef.current.lastX = e.touches[0].clientX
      cropRef.current.lastY = e.touches[0].clientY
      redraw()
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const pinchDist = cropRef.current.pinchDist || dist
      const factor = dist / pinchDist
      cropRef.current.pinchDist = dist
      applyZoom(cropRef.current.scale * factor)
    }
  }

  const handleConfirm = () => {
    const img = drawImgRef.current
    if (!img) return
    const offscreen = document.createElement('canvas')
    offscreen.width = CROP_SIZE
    offscreen.height = CROP_SIZE
    const ctx = offscreen.getContext('2d')!
    const { offsetX, offsetY, scale } = cropRef.current
    ctx.drawImage(
      img,
      (CROP_OFF - offsetX) / scale,
      (CROP_OFF - offsetY) / scale,
      CROP_SIZE / scale,
      CROP_SIZE / scale,
      0, 0, CROP_SIZE, CROP_SIZE,
    )
    const dataUrl = offscreen.toDataURL('image/png')
    setPreviewUrl(dataUrl)
    setConfirmed(true)
    onExport(dataUrl)
  }

  return (
    <div className="crop-panel">
      <div className="crop-panel-header">
        <span className="crop-state-badge">{label}</span>
        <p className="hint">{desc}</p>
      </div>
      {!aiMode && (
        <label className="crop-upload-label">
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {hasImage ? '画像を変更' : '画像をアップロード'}
        </label>
      )}
      {hasImage && (
        <>
          <div className="bg-remove-row">
            <div className="bg-remove-controls">
              <label className="bg-tolerance-label">
                許容範囲 <strong>{bgTolerance}</strong>
                <input
                  type="range" min={5} max={80} value={bgTolerance}
                  onChange={e => setBgTolerance(Number(e.target.value))}
                  className="bg-tolerance-slider"
                />
              </label>
            </div>
            <div className="bg-remove-btns">
              <button
                className="btn-secondary"
                onClick={handleRemoveBg}
                disabled={bgProcessing}
              >
                {bgProcessing ? '処理中…' : '背景除去'}
              </button>
              {bgApplied && (
                <button className="btn-secondary" onClick={handleResetBg}>
                  元に戻す
                </button>
              )}
            </div>
          </div>
          <p className="hint crop-hint-move">ドラッグで移動、ピンチまたはホイールで拡縮。白枠内に収めてください。</p>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="crop-canvas"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={stopDrag}
          />
          <button
            className={`btn-secondary wide${confirmed ? ' crop-confirmed' : ''}`}
            onClick={handleConfirm}
          >
            {confirmed ? '✓ この位置で確定（再調整可）' : 'この位置で確定'}
          </button>
          {previewUrl && (
            <div className="crop-preview-wrap">
              <img src={previewUrl} className="crop-preview-img" alt="プレビュー" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AIGenPanel({ onLoadToNormal, onCopied }: { onLoadToNormal: (url: string) => void; onCopied: () => void }) {
  const [desc, setDesc] = useState('')
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null)
  const [seed, setSeed] = useState<number | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [translating, setTranslating] = useState(false)

  const normalPrompt = translatedDesc ? buildPrompt(translatedDesc, 'normal') : null
  const url = normalPrompt && seed != null ? pollinationsUrl(normalPrompt, seed) : null

  const handleGenerate = async () => {
    if (!desc.trim()) return
    setTranslating(true)
    setImgLoaded(false)
    const en = await toEnglish(desc)
    setTranslating(false)
    setTranslatedDesc(en)
    setSeed(Math.floor(Math.random() * 1000000))
  }

  const reroll = () => {
    setImgLoaded(false)
    setSeed(Math.floor(Math.random() * 1000000))
  }

  return (
    <div className="ai-gen-panel">
      <p className="hint">どんな画像を作りたい？キャラクターの特徴を入力してください。</p>
      <textarea
        className="ai-gen-input"
        rows={2}
        placeholder="例：黒スーツを着た銀髪の男性、きりっとした目つき"
        value={desc}
        onChange={e => setDesc(e.target.value)}
      />
      <button className="btn-primary wide" onClick={handleGenerate} disabled={translating || !desc.trim()}>
        {translating ? '翻訳中…' : '生成する'}
      </button>
      {url && (
        <>
          <div className="ai-gen-img-wrap" style={{ width: 140, margin: '0 auto' }}>
            {!imgLoaded && <span className="ai-gen-loading">生成中</span>}
            <img
              key={url}
              src={url}
              alt="通常"
              className={`ai-gen-img${imgLoaded ? ' loaded' : ''}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          </div>
          <div className="ai-gen-actions">
            <button className="btn-secondary" onClick={reroll} disabled={!imgLoaded}>↻ 別パターン</button>
            <button className="btn-primary" onClick={() => url && onLoadToNormal(url)} disabled={!imgLoaded}>
              {imgLoaded ? 'この画像を使う ↓' : '生成中…'}
            </button>
          </div>
        </>
      )}
      {translatedDesc && (
        <details className="ai-prompt-details">
          <summary className="ai-prompt-summary">生成プロンプトを見る（3ポーズ）</summary>
          <div className="ai-prompt-body">
            {(['normal', 'write', 'rest'] as const).map(pose => {
              const p = buildPrompt(translatedDesc, pose)
              return (
                <div key={pose} className="ai-prompt-pose-block">
                  <p className="ai-prompt-pose-label">{POSE_LABELS[pose]}</p>
                  <p className="ai-prompt-text">{p}</p>
                  <button
                    className="btn-secondary"
                    onClick={() => navigator.clipboard.writeText(p).then(onCopied)}
                  >
                    コピー
                  </button>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}

export function CharacterCreator() {
  const goTo = useAppStore(s => s.goTo)
  const user = useAppStore(s => s.user)
  const saveUser = useAppStore(s => s.saveUser)
  const [exports, setExports] = useState<Record<string, string | null>>({
    normal: null, write: null, rest: null,
  })
  const [aiUrl, setAiUrl] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const { closing, handleBack } = useSlideBack(() => goTo('settings'))

  const setExport = useCallback((key: string, url: string | null) => {
    setExports(prev => ({ ...prev, [key]: url }))
  }, [])

  const allReady = !!exports.normal

  const loadImg = (src: string): Promise<HTMLImageElement> =>
    new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(img)
      img.src = src
    })

  const createComposite = async (charDataUrl: string, leftUrl: string, rightUrl: string): Promise<string> => {
    const canvas = document.createElement('canvas')
    canvas.width = CROP_SIZE; canvas.height = CROP_SIZE
    const ctx = canvas.getContext('2d')!
    const [charImg, leftImg, rightImg] = await Promise.all([
      loadImg(charDataUrl), loadImg(leftUrl), loadImg(rightUrl),
    ])
    ctx.drawImage(charImg, 0, 0, CROP_SIZE, CROP_SIZE)
    const maxW = CROP_SIZE * 0.42
    const maxH = CROP_SIZE * 0.58
    const lScale = Math.min(maxW / leftImg.width, maxH / leftImg.height)
    const lw = leftImg.width * lScale, lh = leftImg.height * lScale
    ctx.drawImage(leftImg, 0, CROP_SIZE - lh, lw, lh)
    const rScale = Math.min(maxW / rightImg.width, maxH / rightImg.height)
    const rw = rightImg.width * rScale, rh = rightImg.height * rScale
    ctx.drawImage(rightImg, CROP_SIZE - rw, CROP_SIZE - rh, rw, rh)
    return canvas.toDataURL('image/png')
  }

  const handleApply = async () => {
    const normalDataUrl = exports.normal
    if (!normalDataUrl) return
    const base = import.meta.env.BASE_URL
    const writeDataUrl = await createComposite(
      normalDataUrl,
      `${base}assets/images/overlays/write_left.png`,
      `${base}assets/images/overlays/write_right.png`,
    )
    const restDataUrl = await createComposite(
      normalDataUrl,
      `${base}assets/images/overlays/rest_left.png`,
      `${base}assets/images/overlays/rest_right.png`,
    ).catch(() => normalDataUrl)
    localStorage.setItem('nob_custom_img_normal', normalDataUrl)
    localStorage.setItem('nob_custom_img_write', writeDataUrl)
    localStorage.setItem('nob_custom_img_rest', restDataUrl)
    if (user) saveUser({ ...user, character: 'custom' })
    setToast('保存しました！')
    setTimeout(() => goTo(user?.onboarded ? 'settings' : 'onboarding'), 1200)
  }

  const handleDownloadZip = async () => {
    if (!allReady) return
    const normalDataUrl = exports.normal!
    const base = import.meta.env.BASE_URL
    const writeDataUrl = await createComposite(
      normalDataUrl,
      `${base}assets/images/overlays/write_left.png`,
      `${base}assets/images/overlays/write_right.png`,
    )
    const restDataUrl = await createComposite(
      normalDataUrl,
      `${base}assets/images/overlays/rest_left.png`,
      `${base}assets/images/overlays/rest_right.png`,
    ).catch(() => normalDataUrl)
    const zip = new JSZip()
    const folder = zip.folder('mychar')!
    for (const [key, dataUrl] of [['normal', normalDataUrl], ['write', writeDataUrl], ['rest', restDataUrl]]) {
      folder.file(`${key}.png`, dataUrl.split(',')[1], { base64: true })
    }
    folder.file('char_def.json', JSON.stringify({ key: 'mychar', label: 'マイキャラ' }, null, 2))
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'mychar.zip'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`screen-scroll${closing ? ' screen-slide-out' : ''}`} ref={screenRef}>
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
          <h2 className="subscreen-title">AI相棒クリエイト</h2>
        </div>
        <p className="hint">AIで画像を生成するか、自分で用意した画像をアップロードして相棒をつくろう。書く・休むの画像は自動合成されます。</p>
      </div>

      <AIGenPanel
        onLoadToNormal={url => {
          setAiUrl(url)
          setExports({ normal: null, write: null, rest: null })
          setTimeout(() => {
            screenRef.current?.scrollTo({ top: screenRef.current.scrollHeight, behavior: 'smooth' })
          }, 100)
        }}
        onCopied={() => setToast('コピーしました')}
      />

      <div className="ai-gen-divider"><span>位置を調整する</span></div>

      <CropPanel
        stateKey="normal"
        label={STATES[0].label}
        desc={STATES[0].desc}
        onExport={url => setExport('normal', url)}
        aiUrl={aiUrl}
        aiMode={!!aiUrl}
      />

      {allReady && (
        <div className="char-creator-actions">
          <button className="btn-primary wide" onClick={handleApply}>
            保存して戻る
          </button>
          <button className="btn-secondary wide" onClick={handleDownloadZip}>
            ZIPダウンロード
          </button>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
