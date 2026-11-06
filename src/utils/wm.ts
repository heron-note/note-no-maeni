// 電子透かし 高レベル API（埋め込み／検出／台帳照合）
// コア方式は wmCore.ts（wmdetect と同一）。ここでは Canvas との接続を担当する。
//
// 実測に基づく設計値 (2026-11-02 試作検証, ~/workspace/wm_proto/FINDINGS.md):
// - 強さ alpha=5（標準）で、静止画1枚でも pilot z≈16・ペイロード復号OK、JPEG q70 でも維持。
// - ペイロードは短く保つ（著者名|yyyyMMdd-HHmm、約20バイト）。長い文字列は
//   縮小・再圧縮後に復号できなくなるため、検出は pilot＋台帳照合が本命。
import {
  WM, wmPattern, wmTemplate, wmZscore, wmTemplateScore, wmDecode,
  wmLuma, wmIntegral, wmCells, wmResidual, wmCorrelator, wmCorrAt,
  type WmDecoded,
} from './wmCore'

export const WM_STRENGTH = { weak: 3, standard: 5, strong: 8 } as const
export type WmStrengthKey = keyof typeof WM_STRENGTH

/** ペイロード: "<著者名>|<yyyyMMdd-HHmm>"（ローカル時刻・分精度）。短さが耐久性を決める。 */
export function buildWmPayload(author: string, at = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  const ts = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`
  return `${author.trim()}|${ts}`
}

export interface WmPayloadParts { author: string; atText: string }

export function parseWmPayload(text: string): WmPayloadParts | null {
  const m = text.match(/^(.*)\|(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/)
  if (!m) return null
  return { author: m[1], atText: `${m[2]}-${m[3]}-${m[4]} ${m[5]}:${m[6]}` }
}

export async function wmKeyFingerprint(key: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))
  return [...d.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function generateWmKey(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- 埋め込み ----

/**
 * キャンバス全体に不可視透かしを埋める。グリッド（160x90）はキャンバス全体に敷く。
 * 検出側は対象フレームを 1280x720 に引き伸ばしてから同じグリッドで読むため、
 * 元の縦横比が 16:9 でなくても全体検出は一致する。
 */
export async function embedInvisible(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  key: string, payload: string, alpha: number,
): Promise<void> {
  const T = await wmTemplate(key, payload)
  embedCanvasWithTemplate(ctx, w, h, T, alpha)
}

/** テンプレート（信号グリッド）を事前に作って使い回す版。動画の各フレーム処理用。 */
export function embedCanvasWithTemplate(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  T: Float64Array, alpha: number,
): void {
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data
  // 行ごとにセル行のデルタ列（160個）を用意してから画素を走査する
  for (let y = 0; y < h; y++) {
    const cy = Math.min(WM.GH - 1, Math.floor((y * WM.GH) / h))
    const rowBase = cy * WM.GW
    let x = 0
    for (let cx = 0; cx < WM.GW; cx++) {
      const d = alpha * T[rowBase + cx]
      const xEnd = Math.min(w, Math.ceil(((cx + 1) * w) / WM.GW))
      for (; x < xEnd; x++) {
        const j = (y * w + x) * 4
        data[j] += d; data[j + 1] += d; data[j + 2] += d
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 可視文字列を右下に描く（控えめな半透明＋縁取り）。 */
export function drawVisibleWatermark(
  ctx: CanvasRenderingContext2D, w: number, h: number, text: string,
): void {
  const size = Math.max(14, Math.min(44, Math.round(w * 0.024)))
  const pad = Math.round(size * 0.9)
  ctx.save()
  ctx.font = `${size}px sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = Math.max(2, size / 8)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.strokeText(text, w - pad, h - pad)
  ctx.fillText(text, w - pad, h - pad)
  ctx.restore()
}

// ---- 検出 ----

const MARGIN = 12
const CW = WM.W + 2 * MARGIN, CH = WM.H + 2 * MARGIN
const workCanvas = document.createElement('canvas')
workCanvas.width = CW; workCanvas.height = CH
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true })!

export function newAccumulator(): Float64Array {
  return new Float64Array(WM.N)
}

/** 1フレーム（画像または動画フレーム）を 1280x720 に置いて残差を積算する。フレーム自体は保持しない。 */
export function addFrameToAccumulator(
  acc: Float64Array, source: CanvasImageSource, sw: number, sh: number,
): void {
  workCtx.fillStyle = '#000'
  workCtx.fillRect(0, 0, CW, CH)
  workCtx.imageSmoothingEnabled = true
  workCtx.imageSmoothingQuality = 'high'
  workCtx.drawImage(source, 0, 0, sw, sh, MARGIN, MARGIN, WM.W, WM.H)
  const img = workCtx.getImageData(0, 0, CW, CH)
  const y = wmLuma(img.data, CW * CH)
  const I = wmIntegral(y, CW, CH)
  const r = wmResidual(wmCells(I, CW, MARGIN, MARGIN))
  for (let i = 0; i < WM.N; i++) acc[i] += r[i]
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const done = () => { video.removeEventListener('seeked', done); res() }
    video.addEventListener('seeked', done)
    video.currentTime = t
    setTimeout(done, 4000)
  })
}

/**
 * 動画の検出用積算。wmdetect と同じ方式: 全体から等間隔に n 枚だけサンプリングし、
 * 1フレームずつ残差を積算して捨てる。メモリは動画の長さによらず一定。
 */
export async function accumulateVideoFrames(
  acc: Float64Array, video: HTMLVideoElement, nFrames: number,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const n = Math.max(1, Math.min(2000, nFrames))
  for (let i = 0; i < n; i++) {
    await seekTo(video, ((i + 0.5) * video.duration) / n)
    addFrameToAccumulator(acc, video, video.videoWidth, video.videoHeight)
    onProgress?.(i + 1, n)
    await new Promise((r) => setTimeout(r))
  }
  return n
}

export interface WmDetectKeyResult {
  keyId: string | null // 台帳鍵の場合その id、手入力鍵は null
  pilotZ: number
  decoded: WmDecoded | null
  /** 台帳の記録とテンプレート照合で一致したもの（スコア付き） */
  ledgerMatch: { recordId: string; payload: string; score: number } | null
}

export interface WmDetectTarget {
  recordId: string
  payload: string
  keyId: string
}

/**
 * 積算済みフレームに対して、鍵候補ごとに pilot 検出→復号→台帳照合を行う。
 * ledgerTargets は「この鍵で過去に埋めたペイロード」候補。復号できない劣化コピーでも
 * 台帳照合なら一致を判定できる。
 */
export async function detectWithKeys(
  acc: Float64Array,
  keys: { id: string | null; key: string }[],
  ledgerTargets: WmDetectTarget[],
  onProgress?: (label: string) => void,
): Promise<WmDetectKeyResult[]> {
  const results: WmDetectKeyResult[] = []
  for (const { id, key } of keys) {
    const pilot = await wmPattern(key, -1)
    const pilotZ = wmZscore(acc, pilot)
    let decoded: WmDecoded | null = null
    let ledgerMatch: WmDetectKeyResult['ledgerMatch'] = null
    if (pilotZ >= 4) {
      onProgress?.('埋め込み文字列を復元中…')
      decoded = await wmDecode(acc, key)
      const targets = ledgerTargets.filter((t) => (id === null ? true : t.keyId === id))
      for (const t of targets) {
        if (decoded && decoded.text === t.payload) {
          ledgerMatch = { recordId: t.recordId, payload: t.payload, score: pilotZ }
          break
        }
        onProgress?.('台帳と照合中…')
        const T = await wmTemplate(key, t.payload)
        const score = wmTemplateScore(acc, T)
        if (score >= 6 && (!ledgerMatch || score > ledgerMatch.score)) {
          ledgerMatch = { recordId: t.recordId, payload: t.payload, score }
        }
      }
    }
    results.push({ keyId: id, pilotZ, decoded, ledgerMatch })
  }
  return results
}

// ---- 切り抜き照合 ----
// wmdetect の cropSearch を移植。入力ファイル全体を「元フレーム（1280x720）の
// 切り抜き」とみなし、倍率 0.5〜3.0 を走査して、台帳テンプレート（鍵＋ペイロード）
// または pilot テンプレートとの FFT 相関が最大になる位置・倍率を探す。
// しきい値は wmdetect と同じ 7。文字列そのものは復元できない。

export interface WmCropCandidate {
  keyId: string | null
  key: string
  payload: string | null // null = pilot のみで照合
  recordId: string | null
}

export interface WmCropResult {
  z: number
  keyId: string | null
  payload: string | null
  recordId: string | null
  /** 元フレーム（1280x720）換算での切り抜き位置と大きさ */
  x: number; y: number; w: number; h: number
}

const cropCanvas = document.createElement('canvas')
const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true })!

interface LumaAtScale { y: Float32Array; w: number; h: number; s: number }

function lumaAtScale(source: CanvasImageSource, sw: number, sh: number, s: number): LumaAtScale | null {
  const w = Math.round(sw / s), h = Math.round(sh / s)
  if (w < 96 || h < 96 || w > WM.W + 8 || h > WM.H + 8) return null
  cropCanvas.width = w; cropCanvas.height = h
  cropCtx.imageSmoothingEnabled = true
  cropCtx.imageSmoothingQuality = 'high'
  cropCtx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h)
  const img = cropCtx.getImageData(0, 0, w, h)
  return { y: wmLuma(img.data, w * h), w, h, s }
}

function gridAt(L: LumaAtScale, px: number, py: number): { G: Float32Array; gw: number; gh: number } | null {
  const gw = Math.min(Math.floor((L.w - px) / 8), WM.GW), gh = Math.min(Math.floor((L.h - py) / 8), WM.GH)
  if (gw < 12 || gh < 12) return null
  const g = new Float32Array(gw * gh)
  for (let i = 0; i < gh; i++) for (let j = 0; j < gw; j++) {
    let sum = 0
    for (let y = 0; y < 8; y++) {
      const row = (py + 8 * i + y) * L.w + px + 8 * j
      for (let x = 0; x < 8; x++) sum += L.y[row + x]
    }
    g[i * gw + j] = sum / 64
  }
  return { G: wmResidual(g, gw, gh), gw, gh }
}

interface CropBest { z: number; ox: number; oy: number; s: number; px: number; py: number; gw: number; gh: number }

async function cropSearchOne(
  source: CanvasImageSource, sw: number, sh: number, T: Float64Array,
  onProgress?: (label: string) => void,
): Promise<CropBest | null> {
  const corr = wmCorrelator(T)
  const scales: number[] = []
  for (let l = Math.log(0.5); l <= Math.log(3.0); l += 0.025) scales.push(Math.exp(l))
  let best: CropBest = { z: -Infinity, ox: 0, oy: 0, s: 1, px: 0, py: 0, gw: 0, gh: 0 }
  for (let k = 0; k < scales.length; k++) {
    const L = lumaAtScale(source, sw, sh, scales[k])
    if (L) for (const py of [0, 4]) for (const px of [0, 4]) {
      const g = gridAt(L, px, py); if (!g) continue
      const r = corr(g.G, g.gw, g.gh)
      if (r.z > best.z) best = { ...r, s: L.s, px, py, gw: g.gw, gh: g.gh }
    }
    if (k % 4 === 0) {
      onProgress?.(`切り抜き位置を探索中… 倍率 ${scales[k].toFixed(2)}`)
      await new Promise((r) => setTimeout(r))
    }
  }
  if (!isFinite(best.z)) return null
  const base = { ...best }
  for (let k = -3; k <= 3; k++) {
    const L = lumaAtScale(source, sw, sh, base.s * (1 + 0.004 * k)); if (!L) continue
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
      const g = gridAt(L, px, py); if (!g) continue
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const z = wmCorrAt(g.G, g.gw, g.gh, T, base.ox + dx, base.oy + dy)
        if (z > best.z) best = { z, ox: base.ox + dx, oy: base.oy + dy, s: L.s, px, py, gw: g.gw, gh: g.gh }
      }
    }
    onProgress?.('切り抜き位置を微調整中…')
    await new Promise((r) => setTimeout(r))
  }
  return best
}

/**
 * 候補（台帳テンプレート優先）ごとに切り抜き照合を行い、最良の結果を返す。
 * 候補が複数ある場合は z が高い候補で打ち切る（10 以上は偶然では出ない）。
 */
export async function detectCrop(
  source: CanvasImageSource, sw: number, sh: number,
  candidates: WmCropCandidate[],
  onProgress?: (label: string) => void,
): Promise<WmCropResult | null> {
  let best: WmCropResult | null = null
  for (const cand of candidates) {
    onProgress?.('照合用テンプレートを生成中…')
    const T = await wmTemplate(cand.key, cand.payload ?? '')
    const r = await cropSearchOne(source, sw, sh, T, onProgress)
    if (!r) continue
    const result: WmCropResult = {
      z: r.z, keyId: cand.keyId, payload: cand.payload, recordId: cand.recordId,
      x: r.ox * 8 - r.px, y: r.oy * 8 - r.py, w: Math.round(sw / r.s), h: Math.round(sh / r.s),
    }
    if (!best || result.z > best.z) best = result
    if (best.z >= 10) break
  }
  return best
}
