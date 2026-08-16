import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useSlideBack } from '../hooks/useSlideBack'
import { useBottomSheet } from '../hooks/useBottomSheet'

const CW = 1280
const CH = 670
const HANDLE_R = 9
const ROT_OFFSET = 40
const STAMP_MASK_URL = `${import.meta.env.BASE_URL}assets/images/stamps/stamp-mask.png`
const HISTORY_KEY = 'ec_history'
const HISTORY_MAX = 10
const DEFAULT_TEXT_COLOR = '#222222'
const DEFAULT_STAMP_COLOR = '#e85d7a'
const DEFAULT_TEXT_SIZE = 80
const STAMP_ASPECT = 474 / 512  // stamp-mask.png natural aspect ratio

const BORDER_PADS = [
  { label: '枠線なし', val: null },
  { label: '端（0px）', val: 0 },
  { label: '30px内側', val: 30 },
  { label: '50px内側', val: 50 },
] as const

const BORDER_WIDTHS = [2, 4, 8, 16, 24]

const EMOJIS = [
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💖','💘','💝','⭐','🌟','💫','✨','🔥','💯',
  '🎉','🎊','🎈','🎀','🎁','🎆','🎇','🧨','🪅','🎗️','🎑','🎏',
  '🌸','🌺','🌻','🌹','🌷','🌼','💐','🍀','☘️','🌿','🌱','🌲','🌳','🌴','🍁','🍂','🍃','🌾',
  '☀️','🌈','❄️','⛄','🌊','💧','☄️','🌙','🌞','🌤️','⛅',
  '🐶','🐱','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐔','🐧','🦆','🦉','🦋','🐝','🐞','🐢','🐙','🐬','🐳','🐘','🦒','🦓','🦔','🐿️',
  '🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🍍','🥝','🍅','🥑','🌽','🍄','🍞','🥐','🧁','🍰','🎂','🍭','🍬','🍫','🍿','🍕','🍔','🍣','🍜','🍵','☕','🧋','🥂','🍷',
  '🎨','🎵','🎶','🎤','🎧','🎸','🎹','🎺','🎷','🎻','🎬','🎭','🎮','🎲','♟️','⚽','🏀','🎾','🏓','🎱','🥊','🎿','🏊','🚵','🚴',
  '🚀','🛸','✈️','🚁','🚗','🚲','🛴','🛹','🚢','⛵','🚤','🪂','🚂','🚄','🏎️','🏍️','🛵','🚌','🚑','🚒','🚜',
  '📚','📖','📝','✏️','🖊️','🖌️','🖍️','💡','📷','📸','🎥','💻','📱','⚙️','📌','🗂️',
  '💥','💢','💦','💨',
]

interface EcItem {
  id: string
  type: 'emoji' | 'kyumouka' | 'text' | 'chara'
  emoji: string
  text: string
  x: number
  y: number
  size: number
  rotation: number
  color: string
  bold: boolean
  charaKey?: string
  pose?: 'normal' | 'write' | 'rest'
}

interface DragState {
  itemId: string
  mode: 'move' | 'resize' | 'rotate'
  startX: number
  startY: number
  origX: number
  origY: number
  origSize: number
}

interface HistoryEntry {
  ts: string
  bgColor: string
  borderPad: number | null
  borderWidth: number
  borderColor: string
  items: EcItem[]
  thumbnail?: string
}

function nid() { return Math.random().toString(36).slice(2, 8) }

function getHandles(item: EcItem, sc: number) {
  const hs = (item.size / 2) * sc
  const cx = item.x * sc, cy = item.y * sc
  const rot = item.rotation * Math.PI / 180
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const r = (lx: number, ly: number) => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos })
  return { tl: r(-hs,-hs), tr: r(hs,-hs), bl: r(-hs,hs), br: r(hs,hs), tm: r(0,-hs), rh: r(0,-(hs+ROT_OFFSET)) }
}

function drawStampWithMask(ctx: CanvasRenderingContext2D, maskImg: HTMLImageElement, color: string, size: number) {
  const nw = maskImg.naturalWidth || size
  const nh = maskImg.naturalHeight || size
  const sc = size / Math.max(nw, nh)
  const w = Math.round(nw * sc)
  const h = Math.round(nh * sc)
  const off = document.createElement('canvas')
  off.width = w; off.height = h
  const oc = off.getContext('2d')!
  oc.fillStyle = color
  oc.fillRect(0, 0, w, h)
  oc.globalCompositeOperation = 'destination-in'
  oc.drawImage(maskImg, 0, 0, w, h)
  ctx.drawImage(off, -w/2, -h/2)
}

function charImgSrc(charKey: string, pose: string): string {
  if (charKey === 'custom') {
    return localStorage.getItem(`nob_custom_img_${pose}`) ?? ''
  }
  return `${import.meta.env.BASE_URL}assets/images/characters/${charKey}/${pose}.png`
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  bgColor: string, borderPad: number | null, borderWidth: number, borderColor: string,
  items: EcItem[], stampImg: HTMLImageElement | null,
  charaImgCache: Map<string, HTMLImageElement>,
) {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.clearRect(0, 0, CW, CH)
  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, CW, CH)
  if (borderPad !== null) {
    const p = borderPad + borderWidth / 2
    ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth
    ctx.strokeRect(p, p, CW - p*2, CH - p*2)
  }
  for (const item of items) {
    ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.rotation*Math.PI/180)
    if (item.type === 'kyumouka') {
      if (stampImg && stampImg.complete && stampImg.naturalWidth > 0)
        drawStampWithMask(ctx, stampImg, item.color, item.size)
    } else if (item.type === 'chara') {
      const k = `${item.charaKey}_${item.pose}`
      const img = charaImgCache.get(k)
      if (img && img.complete && img.naturalWidth > 0) {
        const aspect = img.naturalHeight / img.naturalWidth
        const w = item.size
        const h = w * aspect
        ctx.drawImage(img, -w/2, -h/2, w, h)
      }
    } else if (item.type === 'text') {
      if (item.text) {
        ctx.fillStyle = item.color
        ctx.font = `${item.bold?'900':'400'} ${item.size}px sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(item.text, 0, 0)
      }
    } else {
      ctx.font = `${item.size}px serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(item.emoji, 0, 0)
    }
    ctx.restore()
  }
}

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function persistHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
}

// Stamp layer — draws to a <canvas> element directly (most reliable cross-browser)
function KyumoukaLayer({ item, scale, stampImg, baseStyle, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  item: EcItem; scale: number; stampImg: HTMLImageElement | null
  baseStyle: React.CSSProperties
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void; onPointerCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!stampImg) return
    const draw = () => {
      const canvas = canvasRef.current; if (!canvas) return
      if (stampImg.naturalWidth === 0) return
      const sz = item.size * scale
      const W = Math.round(sz)
      const H = Math.round(sz * STAMP_ASPECT)
      canvas.width = W
      canvas.height = H
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      const ctx = canvas.getContext('2d'); if (!ctx) return
      ctx.fillStyle = item.color
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(stampImg, 0, 0, W, H)
    }
    if (!stampImg.complete) {
      stampImg.addEventListener('load', draw, { once: true })
      return () => stampImg.removeEventListener('load', draw)
    }
    draw()
  }, [item.size, item.color, scale, stampImg])

  return (
    <canvas
      ref={canvasRef}
      style={{ ...baseStyle, display: 'block', cursor: 'move' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
    />
  )
}

// Separate component so useBottomSheet resets each time the panel is opened
function HistoryPanel({ history, onLoad, onClose }: {
  history: HistoryEntry[]
  onLoad: (entry: HistoryEntry) => void
  onClose: () => void
}) {
  const { closing, handleClose, sheetRef, dragHandleProps } = useBottomSheet(onClose)
  return (
    <div className={`eyecatch-history-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div
        ref={sheetRef}
        className={`eyecatch-history-panel${closing ? ' sheet-leaving' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sheet-drag-handle-area" {...dragHandleProps}>
          <div className="sheet-drag-handle"/>
        </div>
        <div className="eyecatch-history-header">
          <span className="eyecatch-section-title" style={{margin:0}}>履歴</span>
          <button className="icon-btn" onClick={handleClose} aria-label="閉じる">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {history.length === 0 ? (
          <p className="eyecatch-history-empty">まだ履歴がありません。ダウンロード時に自動保存されます。</p>
        ) : history.map((entry, i) => (
          <button key={i} className="eyecatch-history-item" onClick={() => { onLoad(entry); handleClose() }}>
            {entry.thumbnail
              ? <img src={entry.thumbnail} className="eyecatch-history-thumb" alt=""/>
              : <span className="eyecatch-history-swatch" style={{background:entry.bgColor}}/>
            }
            <span className="eyecatch-history-ts">{entry.ts}</span>
            <span className="eyecatch-history-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function EyecatchCreator() {
  const goTo = useAppStore(s => s.goTo)
  const user = useAppStore(s => s.user)
  const { closing, handleBack } = useSlideBack(() => goTo('home'))

  const charKey = user?.character ?? 'kuma'

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const scaleRef = useRef(1)
  const itemsRef = useRef<EcItem[]>([])
  const selectedIdRef = useRef<string | null>(null)
  const pendingEmojiRef = useRef<string | null>(null)
  const pendingCharaRef = useRef<'normal' | 'write' | 'rest' | null>(null)
  const charKeyRef = useRef(charKey)
  const textModeRef = useRef(false)
  const modeRef = useRef<'stamp' | 'edit'>('stamp')
  const editingIdRef = useRef<string | null>(null)
  const editingIdRef2 = useRef<string | null>(null)
  const stampImgRef = useRef<HTMLImageElement | null>(null)
  const charaImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const editInputRef = useRef<HTMLInputElement>(null)
  const editTextRef = useRef('')
  const lastTapRef = useRef<{ id: string; time: number } | null>(null)

  const [scale, setScale] = useState(1)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [borderPad, setBorderPad] = useState<number | null>(null)
  const [borderWidth, setBorderWidth] = useState(4)
  const [borderColor, setBorderColor] = useState('#000000')
  const [items, setItems] = useState<EcItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingEmoji, setPendingEmoji] = useState<string | null>(null)
  const [pendingChara, setPendingChara] = useState<'normal' | 'write' | 'rest' | null>(null)
  const [showPosePicker, setShowPosePicker] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [mode, setMode] = useState<'stamp' | 'edit'>('stamp')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saveImageUrl, setSaveImageUrl] = useState<string | null>(null)

  scaleRef.current = scale
  itemsRef.current = items
  selectedIdRef.current = selectedId
  pendingEmojiRef.current = pendingEmoji
  pendingCharaRef.current = pendingChara
  charKeyRef.current = charKey
  textModeRef.current = textMode
  modeRef.current = mode
  editingIdRef.current = editingId
  editingIdRef2.current = editingId
  editTextRef.current = editText

  const ensureCharaImg = (key: string, pose: string): HTMLImageElement => {
    const k = `${key}_${pose}`
    const cache = charaImgCacheRef.current
    if (!cache.has(k)) {
      const img = new Image()
      img.src = charImgSrc(key, pose)
      cache.set(k, img)
    }
    return cache.get(k)!
  }

  useEffect(() => {
    const img = new Image()
    img.src = STAMP_MASK_URL
    stampImgRef.current = img
  }, [])

  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const update = () => { const s = el.offsetWidth / CW; setScale(s); scaleRef.current = s }
    update()
    const ro = new ResizeObserver(update); ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Canvas shows bg + border only; items are rendered as DOM layers
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, CW, CH)
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, CW, CH)
    if (borderPad !== null) {
      const p = borderPad + borderWidth / 2
      ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth
      ctx.strokeRect(p, p, CW - p*2, CH - p*2)
    }
  }, [bgColor, borderPad, borderWidth, borderColor])

  // Live-sync editText into the item while editing
  useEffect(() => {
    if (!editingId) return
    setItems(prev => prev.map(it => it.id === editingId ? { ...it, text: editText } : it))
  }, [editText, editingId])

  useEffect(() => {
    if (editingId) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [editingId])

  const confirmEditStable = () => {
    const id = editingIdRef2.current; if (!id) return
    const trimmed = editTextRef.current.trim()
    setItems(prev =>
      trimmed
        ? prev.map(it => it.id === id ? { ...it, text: trimmed } : it)
        : prev.filter(it => it.id !== id)
    )
    setEditingId(null); editingIdRef.current = null; editingIdRef2.current = null
    setEditText(''); editTextRef.current = ''
  }
  const confirmEdit = confirmEditStable

  const switchMode = (m: 'stamp' | 'edit') => {
    confirmEditStable()
    if (m === 'stamp') { setSelectedId(null); selectedIdRef.current = null }
    else {
      setPendingEmoji(null); setTextMode(false)
      setPendingChara(null); pendingCharaRef.current = null
      setShowPosePicker(false)
    }
    setMode(m); modeRef.current = m
  }

  const startDrag = (e: React.PointerEvent, item: EcItem, dragMode: DragState['mode']) => {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = {
      itemId: item.id, mode: dragMode,
      startX: e.clientX, startY: e.clientY,
      origX: item.x, origY: item.y, origSize: item.size,
    }
  }

  const onDragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag) return
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return
    const sc = scaleRef.current
    setItems(prev => prev.map(it => {
      if (it.id !== drag.itemId) return it
      if (drag.mode === 'move') return {
        ...it,
        x: drag.origX + (e.clientX - drag.startX) / sc,
        y: drag.origY + (e.clientY - drag.startY) / sc,
      }
      if (drag.mode === 'resize') {
        const cx = drag.origX * sc + rect.left
        const cy = drag.origY * sc + rect.top
        return { ...it, size: Math.max(20, Math.hypot(e.clientX - cx, e.clientY - cy) * Math.SQRT2 / sc) }
      }
      if (drag.mode === 'rotate') {
        const cx = drag.origX * sc + rect.left
        const cy = drag.origY * sc + rect.top
        return { ...it, rotation: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90 }
      }
      return it
    }))
  }
  const onDragUp = () => { dragRef.current = null }

  const bringToFront = (id: string) => {
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === id)
      if (idx < 0 || idx === prev.length - 1) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      return [...next, item]
    })
  }

  const onItemDown = (e: React.PointerEvent, item: EcItem) => {
    e.stopPropagation()
    if (modeRef.current !== 'edit') return

    // Double-tap to bring to front
    const now = Date.now()
    const last = lastTapRef.current
    if (last && last.id === item.id && now - last.time < 300) {
      lastTapRef.current = null
      bringToFront(item.id)
      return
    }
    lastTapRef.current = { id: item.id, time: now }

    if (editingIdRef.current && editingIdRef.current !== item.id) confirmEditStable()
    setSelectedId(item.id); selectedIdRef.current = item.id
    if (item.type === 'text') {
      setEditingId(item.id); editingIdRef.current = item.id; editingIdRef2.current = item.id
      setEditText(item.text); editTextRef.current = item.text
      setTimeout(() => editInputRef.current?.focus(), 50)
      return
    }
    startDrag(e, item, 'move')
  }

  const onHandleDown = (e: React.PointerEvent, item: EcItem, hMode: 'resize' | 'rotate') => {
    e.stopPropagation()
    startDrag(e, item, hMode)
  }

  const onWrapDown = (e: React.PointerEvent) => {
    if (editingIdRef.current) confirmEditStable()
    if (modeRef.current === 'edit') { setSelectedId(null); selectedIdRef.current = null; return }
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return
    const sc = scaleRef.current
    const cx = (e.clientX - rect.left) / sc
    const cy = (e.clientY - rect.top) / sc
    if (pendingEmojiRef.current !== null) {
      setItems(prev => [...prev, { id:nid(), type:'emoji', emoji:pendingEmojiRef.current!, text:'', x:cx, y:cy, size:120, rotation:0, color:'#000', bold:false }])
    } else if (pendingCharaRef.current !== null) {
      const pose = pendingCharaRef.current
      const key = charKeyRef.current
      ensureCharaImg(key, pose)
      setItems(prev => [...prev, { id:nid(), type:'chara', emoji:'', text:'', x:cx, y:cy, size:300, rotation:0, color:'#000', bold:false, charaKey:key, pose }])
    } else if (textModeRef.current) {
      const id = nid()
      setItems(prev => [...prev, { id, type:'text', emoji:'', text:'', x:cx, y:cy, size:DEFAULT_TEXT_SIZE, rotation:0, color:DEFAULT_TEXT_COLOR, bold:false }])
      setSelectedId(id); selectedIdRef.current = id
      setEditingId(id); editingIdRef.current = id; editingIdRef2.current = id
      setEditText(''); editTextRef.current = ''
      setTextMode(false); textModeRef.current = false
      setMode('edit'); modeRef.current = 'edit'
      setTimeout(() => editInputRef.current?.focus(), 50)
    }
  }

  function placeKyumouka() {
    const id = nid()
    const item: EcItem = { id, type:'kyumouka', emoji:'', text:'', x:CW/2, y:CH/2, size:600, rotation:0, color:DEFAULT_STAMP_COLOR, bold:false }
    setItems(prev => [...prev.filter(it => it.type!=='kyumouka'), item])
    setSelectedId(id); selectedIdRef.current = id
    setPendingEmoji(null); setTextMode(false)
    setMode('edit'); modeRef.current = 'edit'
  }

  const clear = () => {
    setItems([]); setSelectedId(null); selectedIdRef.current = null
    setPendingEmoji(null); setTextMode(false)
    setPendingChara(null); pendingCharaRef.current = null
    setShowPosePicker(false)
    setEditingId(null); editingIdRef.current = null; editingIdRef2.current = null
    setEditText(''); editTextRef.current = ''
  }

  const download = () => {
    const canvas = canvasRef.current; if (!canvas) return
    if (editingId) confirmEdit()
    const snapshot = itemsRef.current
    const ts = new Date().toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    setSelectedId(null)
    setTimeout(() => {
      // Composite all layers to canvas for download
      renderCanvas(canvas, bgColor, borderPad, borderWidth, borderColor, snapshot, stampImgRef.current, charaImgCacheRef.current)
      const dataUrl = canvas.toDataURL('image/png')
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIOS) {
        setSaveImageUrl(dataUrl)
      } else {
        const a = document.createElement('a'); a.href = dataUrl; a.download = 'eyecatch.png'; a.click()
      }
      // Thumbnail at 1/4 scale for history preview
      const tw = Math.round(CW / 4), th = Math.round(CH / 4)
      const tc = document.createElement('canvas'); tc.width = tw; tc.height = th
      tc.getContext('2d')?.drawImage(canvas, 0, 0, tw, th)
      const thumbnail = tc.toDataURL('image/jpeg', 0.72)
      // Restore canvas to bg+border only
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, CW, CH)
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, CW, CH)
        if (borderPad !== null) {
          const p = borderPad + borderWidth / 2
          ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth
          ctx.strokeRect(p, p, CW - p*2, CH - p*2)
        }
      }
      setHistory(prev => {
        const entry: HistoryEntry = { ts, bgColor, borderPad, borderWidth, borderColor, items: snapshot, thumbnail }
        const next = [entry, ...prev].slice(0, HISTORY_MAX)
        persistHistory(next); return next
      })
    }, 50)
  }

  const loadFromHistory = (entry: HistoryEntry) => {
    setBgColor(entry.bgColor); setBorderPad(entry.borderPad)
    setBorderWidth(entry.borderWidth ?? 4); setBorderColor(entry.borderColor)
    setItems(entry.items)
    setSelectedId(null); selectedIdRef.current = null
    setEditingId(null); editingIdRef.current = null; editingIdRef2.current = null
    setEditText(''); editTextRef.current = ''
  }

  const updateSelItem = (patch: Partial<EcItem>) =>
    setItems(prev => prev.map(it => it.id === selectedId ? {...it, ...patch} : it))

  const selItem = items.find(it => it.id === selectedId)
  const isPlacing = mode === 'stamp' && (pendingEmoji !== null || textMode || pendingChara !== null)

  // SVG handles for the selected item — shown whenever selected in edit mode
  let svgHandles: React.ReactNode = null
  if (selItem && mode === 'edit') {
    const h = getHandles(selItem, scale)
    const hs = (selItem.size / 2) * scale
    const cx = selItem.x * scale, cy = selItem.y * scale
    const rot = selItem.rotation * Math.PI / 180
    const cos = Math.cos(rot), sin = Math.sin(rot)
    const rp = (lx: number, ly: number) => `${cx+lx*cos-ly*sin},${cy+lx*sin+ly*cos}`
    const box = `${rp(-hs,-hs)} ${rp(hs,-hs)} ${rp(hs,hs)} ${rp(-hs,hs)}`
    svgHandles = (
      <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',pointerEvents:'none',zIndex:10}}>
        <polygon points={box} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 4"/>
        <line x1={h.tm.x} y1={h.tm.y} x2={h.rh.x} y2={h.rh.y} stroke="#3b82f6" strokeWidth={1.5}/>
        {[h.tl,h.tr,h.bl,h.br].map((p,i) => (
          <circle key={i} cx={p.x} cy={p.y} r={HANDLE_R} fill="white" stroke="#3b82f6" strokeWidth={2}
            style={{pointerEvents:'all', cursor:'nwse-resize'} as React.CSSProperties}
            onPointerDown={(e: React.PointerEvent<SVGCircleElement>) => onHandleDown(e as unknown as React.PointerEvent, selItem, 'resize')}
            onPointerMove={(e: React.PointerEvent<SVGCircleElement>) => onDragMove(e as unknown as React.PointerEvent)}
            onPointerUp={onDragUp} onPointerCancel={onDragUp}
          />
        ))}
        <circle cx={h.rh.x} cy={h.rh.y} r={HANDLE_R} fill="#3b82f6"
          style={{pointerEvents:'all', cursor:'grab'} as React.CSSProperties}
          onPointerDown={(e: React.PointerEvent<SVGCircleElement>) => onHandleDown(e as unknown as React.PointerEvent, selItem, 'rotate')}
          onPointerMove={(e: React.PointerEvent<SVGCircleElement>) => onDragMove(e as unknown as React.PointerEvent)}
          onPointerUp={onDragUp} onPointerCancel={onDragUp}
        />
      </svg>
    )
  }

  return (
    <div className={`screen-scroll eyecatch-screen${closing ? ' screen-slide-out' : ''}`}>
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
          <h2 className="subscreen-title">アイキャッチ作成</h2>
        </div>
        <div className="eyecatch-header-actions">
          <button className="icon-btn" onClick={clear} aria-label="クリア">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
          <button className="icon-btn" onClick={() => setShowHistory(true)} aria-label="履歴">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button className="btn-primary eyecatch-dl-btn" onClick={download}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            DL
          </button>
        </div>
      </div>

      {/* Canvas area — canvas shows bg+border; items are DOM layers on top */}
      <div
        className="eyecatch-canvas-wrap"
        ref={wrapRef}
        style={{ cursor: isPlacing ? 'crosshair' : 'default' }}
        onPointerDown={onWrapDown}
      >
        <canvas
          ref={canvasRef}
          width={CW} height={CH}
          style={{ width:'100%', height:'auto', display:'block', pointerEvents:'none' }}
        />

        {/* DOM item layers */}
        {items.map(item => {
          const isEditing = editingId === item.id
          const baseStyle: React.CSSProperties = {
            position: 'absolute',
            left: item.x * scale,
            top: item.y * scale,
            transform: `translate(-50%,-50%) rotate(${item.rotation}deg)`,
            userSelect: 'none',
            touchAction: 'none',
            pointerEvents: mode === 'edit' ? 'auto' : 'none',
            zIndex: isEditing ? 8 : 3,
          }

          if (item.type === 'emoji') {
            return (
              <div key={item.id}
                style={{...baseStyle, fontSize:item.size*scale, lineHeight:1, cursor:'move'}}
                onPointerDown={e=>onItemDown(e,item)} onPointerMove={onDragMove}
                onPointerUp={onDragUp} onPointerCancel={onDragUp}>
                {item.emoji}
              </div>
            )
          }

          if (item.type === 'kyumouka') {
            return (
              <KyumoukaLayer
                key={item.id}
                item={item} scale={scale} stampImg={stampImgRef.current}
                baseStyle={baseStyle}
                onPointerDown={e=>onItemDown(e,item)} onPointerMove={onDragMove}
                onPointerUp={onDragUp} onPointerCancel={onDragUp}
              />
            )
          }

          if (item.type === 'chara') {
            const src = charImgSrc(item.charaKey ?? 'kuma', item.pose ?? 'normal')
            return (
              <img key={item.id}
                src={src}
                style={{ ...baseStyle, width: item.size * scale, height: 'auto', cursor: 'move', display: 'block' }}
                draggable={false}
                onPointerDown={e=>onItemDown(e,item)} onPointerMove={onDragMove}
                onPointerUp={onDragUp} onPointerCancel={onDragUp}
              />
            )
          }

          if (item.type === 'text') {
            if (isEditing) {
              return (
                <div key={item.id} style={{...baseStyle, display:'flex', flexDirection:'column', alignItems:'center'}}>
                  {/* Drag grip — drag this to move the text item */}
                  <div
                    style={{width:48,height:10,background:'#3b82f6',borderRadius:5,cursor:'grab',touchAction:'none',marginBottom:6,flexShrink:0}}
                    onPointerDown={e=>{e.stopPropagation();startDrag(e,item,'move')}}
                    onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
                  />
                  <input
                    ref={editInputRef}
                    className="eyecatch-text-inline-input"
                    style={{
                      fontSize: Math.max(12, item.size*scale),
                      fontWeight: item.bold?900:400,
                      color: item.color,
                      minWidth: Math.max(80, (editText.length||4)*item.size*scale*0.55+32),
                    }}
                    value={editText}
                    onChange={e=>{setEditText(e.target.value);editTextRef.current=e.target.value}}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();confirmEdit()}}}
                    onPointerDown={e=>e.stopPropagation()}
                    placeholder="テキスト"
                  />
                </div>
              )
            }
            return (
              <div key={item.id} style={{
                ...baseStyle,
                fontSize: item.size*scale,
                fontWeight: item.bold?900:400,
                color: item.color,
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
                cursor: 'pointer',
              }}
                onPointerDown={e=>onItemDown(e,item)} onPointerMove={onDragMove}
                onPointerUp={onDragUp} onPointerCancel={onDragUp}>
                {item.text || (mode==='edit' ? '▎' : '')}
              </div>
            )
          }
          return null
        })}

        {/* SVG handles — resize corners + rotate */}
        {svgHandles}
      </div>

      {/* Mode toggle */}
      <div className="eyecatch-mode-row">
        <button className={`eyecatch-mode-tab${mode==='stamp'?' active':''}`} onClick={()=>switchMode('stamp')}>スタンプ追加</button>
        <button className={`eyecatch-mode-tab${mode==='edit'?' active':''}`} onClick={()=>switchMode('edit')}>編集</button>
      </div>

      {/* Selected item float bar */}
      {selItem && mode === 'edit' && (
        <div className="eyecatch-sel-bar">
          <span className="eyecatch-sel-label">選択中</span>
          {(selItem.type==='kyumouka'||selItem.type==='text') && (
            <label className="eyecatch-color-lbl">
              <span className="eyecatch-color-dot" style={{background:selItem.color}}/>
              <span>色</span>
              <input type="color" value={selItem.color} onChange={e=>updateSelItem({color:e.target.value})}/>
            </label>
          )}
          {selItem.type==='text' && (
            <button
              className={`eyecatch-mode-btn${selItem.bold?' active':''}`}
              style={{fontWeight:900, padding:'4px 10px'}}
              onClick={()=>updateSelItem({bold:!selItem.bold})}
            >B</button>
          )}
          {editingId && (
            <button className="btn-primary" style={{fontSize:13,padding:'4px 12px'}} onClick={confirmEdit}>確定</button>
          )}
          <button className="btn-secondary eyecatch-del-btn"
            onClick={()=>{setItems(prev=>prev.filter(it=>it.id!==selectedId));setSelectedId(null);selectedIdRef.current=null}}>
            削除
          </button>
          <button className="icon-btn" onClick={()=>{confirmEditStable();setSelectedId(null);selectedIdRef.current=null}} aria-label="選択解除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Canvas settings */}
      <div className="eyecatch-section">
        <p className="eyecatch-section-title">
          キャンバス設定
          {pendingChara && <span className="eyecatch-placing-hint"> — 相棒スタンプ選択中・キャンバスをタップして配置</span>}
        </p>
        <div className="eyecatch-row" style={{flexWrap:'wrap',gap:10}}>
          <label className="eyecatch-color-lbl">
            <span className="eyecatch-color-dot" style={{background:bgColor}}/>
            <span>背景色</span>
            <input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)}/>
          </label>
          <label className="eyecatch-inline-label">
            <span>枠線</span>
            <select className="eyecatch-select" value={borderPad??'none'}
              onChange={e=>setBorderPad(e.target.value==='none'?null:Number(e.target.value))}>
              {BORDER_PADS.map(opt=>(
                <option key={opt.label} value={opt.val??'none'}>{opt.label}</option>
              ))}
            </select>
          </label>
          {borderPad !== null && (
            <>
              <label className="eyecatch-inline-label">
                <span>太さ</span>
                <select className="eyecatch-select" value={borderWidth} onChange={e=>setBorderWidth(Number(e.target.value))}>
                  {BORDER_WIDTHS.map(w=><option key={w} value={w}>{w}px</option>)}
                </select>
              </label>
              <label className="eyecatch-color-lbl">
                <span className="eyecatch-color-dot" style={{background:borderColor}}/>
                <span>枠線色</span>
                <input type="color" value={borderColor} onChange={e=>setBorderColor(e.target.value)}/>
              </label>
            </>
          )}
          <button className="eyecatch-stamp-icon-btn" onClick={placeKyumouka} title="休もっかスタンプを配置" aria-label="休もっかスタンプを配置">
            <span className="eyecatch-stamp-mini" style={{backgroundColor:DEFAULT_STAMP_COLOR}}/>
          </button>
          <button
            className={`eyecatch-mode-btn${textMode?' active':''}`}
            onClick={()=>{
              const next=!textMode; setTextMode(next); setPendingEmoji(null)
              setPendingChara(null); pendingCharaRef.current=null; setShowPosePicker(false)
              if(next&&mode==='edit')switchMode('stamp')
            }}
            title="テキストを配置"
          >T</button>
          <button
            className={`eyecatch-stamp-icon-btn${pendingChara!==null||showPosePicker?' active':''}`}
            onClick={()=>{
              setShowPosePicker(prev=>!prev)
              setPendingEmoji(null); setTextMode(false)
              if(mode==='edit')switchMode('stamp')
            }}
            title="相棒スタンプを配置"
            aria-label="相棒スタンプを配置"
          >
            <img src={charImgSrc(charKey,'normal')} style={{width:26,height:26,objectFit:'contain'}} alt=""/>
          </button>
        </div>
        {showPosePicker && (
          <div className="eyecatch-pose-picker">
            {(['normal','write','rest'] as const).map(pose=>{
              const labels={normal:'ふつう',write:'かく',rest:'やすむ'}
              return (
                <button
                  key={pose}
                  className={`eyecatch-pose-btn${pendingChara===pose?' active':''}`}
                  onClick={()=>{
                    const wasActive=pendingChara===pose
                    setPendingChara(wasActive?null:pose)
                    pendingCharaRef.current=wasActive?null:pose
                    setShowPosePicker(false)
                    if(!wasActive){
                      setPendingEmoji(null); setTextMode(false)
                      if(mode==='edit')switchMode('stamp')
                    }
                  }}
                >
                  <img src={charImgSrc(charKey,pose)} className="eyecatch-pose-img" alt={pose}/>
                  <span>{labels[pose]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Emoji picker */}
      <div className="eyecatch-section">
        <p className="eyecatch-section-title">
          絵文字
          {pendingEmoji && <span className="eyecatch-placing-hint"> — {pendingEmoji} 選択中・キャンバスをタップして配置</span>}
        </p>
        <div className="eyecatch-emoji-grid">
          {EMOJIS.map(em=>(
            <button key={em} className={`eyecatch-emoji-btn${pendingEmoji===em?' active':''}`}
              onClick={()=>{
                setPendingEmoji(prev=>prev===em?null:em)
                setTextMode(false)
                setPendingChara(null); pendingCharaRef.current=null; setShowPosePicker(false)
                if(mode==='edit')switchMode('stamp')
              }}>
              {em}
            </button>
          ))}
        </div>
      </div>

      {saveImageUrl && (
        <div className="eyecatch-save-overlay" onClick={() => setSaveImageUrl(null)}>
          <div className="eyecatch-save-panel" onClick={e => e.stopPropagation()}>
            <p className="eyecatch-save-hint">画像を長押しして「写真に保存」してください</p>
            <img src={saveImageUrl} className="eyecatch-save-img" alt="アイキャッチ"/>
            <button className="btn-secondary wide" onClick={() => setSaveImageUrl(null)}>閉じる</button>
          </div>
        </div>
      )}

      {showHistory && (
        <HistoryPanel
          history={history}
          onLoad={loadFromHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}
