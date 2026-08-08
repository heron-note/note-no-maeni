import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { useAppStore } from '../store/useAppStore'
import { Toast } from '../components/Toast'

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
    desc: '「書く」を選んだ時に表示されます。元気や期待感のある表情・ポーズが向いています。',
  },
  {
    key: 'rest',
    label: '休む',
    desc: '「休む」のスタンプ画面に表示されます。ゆったりくつろいだ表情・ポーズが向いています。',
  },
]

interface CropRef {
  offsetX: number
  offsetY: number
  scale: number
  dragging: boolean
  lastX: number
  lastY: number
  pinchDist: number
}

function CropPanel({ label, desc, onExport }: {
  stateKey: string
  label: string
  desc: string
  onExport: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const cropRef = useRef<CropRef>({
    offsetX: 0, offsetY: 0, scale: 1,
    dragging: false, lastX: 0, lastY: 0, pinchDist: 0,
  })
  const [hasImage, setHasImage] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
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

  // Initial draw after canvas mounts
  useEffect(() => {
    if (hasImage) redraw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage])

  // Prevent passive scroll on canvas touch
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasImage) return
    const prevent = (e: Event) => e.preventDefault()
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => canvas.removeEventListener('touchmove', prevent)
  }, [hasImage])

  const getScaledDelta = (dx: number, dy: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { dx, dy }
    const rect = canvas.getBoundingClientRect()
    return {
      dx: dx * (CANVAS_SIZE / rect.width),
      dy: dy * (CANVAS_SIZE / rect.height),
    }
  }

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const fitScale = Math.min(CROP_SIZE / img.width, CROP_SIZE / img.height)
      cropRef.current = {
        offsetX: CROP_OFF + (CROP_SIZE - img.width * fitScale) / 2,
        offsetY: CROP_OFF + (CROP_SIZE - img.height * fitScale) / 2,
        scale: fitScale,
        dragging: false, lastX: 0, lastY: 0, pinchDist: 0,
      }
      setConfirmed(false)
      setPreviewUrl(null)
      onExport(null)
      setHasImage(true)
    }
    img.src = url
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

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const cx = CANVAS_SIZE / 2
    const cy = CANVAS_SIZE / 2
    const { offsetX, offsetY, scale } = cropRef.current
    const newScale = Math.max(0.05, Math.min(20, scale * factor))
    const f = newScale / scale
    cropRef.current.scale = newScale
    cropRef.current.offsetX = cx + (offsetX - cx) * f
    cropRef.current.offsetY = cy + (offsetY - cy) * f
    redraw()
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
      const cx = CANVAS_SIZE / 2
      const cy = CANVAS_SIZE / 2
      const { offsetX, offsetY, scale } = cropRef.current
      const newScale = Math.max(0.05, Math.min(20, scale * factor))
      const f = newScale / scale
      cropRef.current.scale = newScale
      cropRef.current.offsetX = cx + (offsetX - cx) * f
      cropRef.current.offsetY = cy + (offsetY - cy) * f
      redraw()
    }
  }

  const handleConfirm = () => {
    const img = imgRef.current
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
      <label className="crop-upload-label">
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {hasImage ? '画像を変更' : '画像をアップロード'}
      </label>
      {hasImage && (
        <>
          <p className="hint crop-hint-move">ドラッグで移動・ピンチ/ホイールで拡縮。白枠内に収めてください。</p>
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

export function CharacterCreator() {
  const goTo = useAppStore(s => s.goTo)
  const user = useAppStore(s => s.user)
  const saveUser = useAppStore(s => s.saveUser)
  const [exports, setExports] = useState<Record<string, string | null>>({
    normal: null, write: null, rest: null,
  })
  const [toast, setToast] = useState<string | null>(null)

  const setExport = useCallback((key: string, url: string | null) => {
    setExports(prev => ({ ...prev, [key]: url }))
  }, [])

  const allReady = STATES.every(s => exports[s.key])

  const handleApply = () => {
    if (!allReady) return
    STATES.forEach(s => {
      localStorage.setItem(`nob_custom_img_${s.key}`, exports[s.key]!)
    })
    saveUser({ ...(user ?? { name: '', onboarded: true }), character: 'custom' })
    setToast('設定しました！')
    setTimeout(() => goTo('home'), 900)
  }

  const handleDownloadZip = async () => {
    if (!allReady) return
    const zip = new JSZip()
    const folder = zip.folder('mychar')!
    STATES.forEach(s => {
      const base64 = exports[s.key]!.split(',')[1]
      folder.file(`${s.key}.png`, base64, { base64: true })
    })
    folder.file('char_def.json', JSON.stringify(
      {
        key: 'mychar',
        label: 'マイキャラ',
        comment: 'CHARSに { key: \'mychar\', label: \'マイキャラ\' } を追加し、png3枚を public/assets/images/characters/mychar/ に配置してください',
      },
      null, 2,
    ))
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mychar.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="screen-scroll">
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={() => goTo('settings')}>‹</button>
          <h2 className="subscreen-title">相棒クリエイト</h2>
        </div>
        <p className="hint">3枚の画像をアップロードしてクロップすると、直接設定またはZIPダウンロードができます。</p>
      </div>

      {STATES.map(s => (
        <CropPanel
          key={s.key}
          stateKey={s.key}
          label={s.label}
          desc={s.desc}
          onExport={url => setExport(s.key, url)}
        />
      ))}

      {allReady && (
        <div className="char-creator-actions">
          <button className="btn-primary wide" onClick={handleApply}>
            直接設定する
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
