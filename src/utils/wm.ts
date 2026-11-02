// 電子透かし 高レベル API（埋め込み／検出／台帳照合）
// コア方式は wmCore.ts（wmdetect と同一）。ここでは Canvas との接続を担当する。
//
// 実測に基づく設計値 (2026-11-02 試作検証, ~/workspace/wm_proto/FINDINGS.md):
// - 強さ alpha=5（標準）で、静止画1枚でも pilot z≈16・ペイロード復号OK、JPEG q70 でも維持。
// - ペイロードは短く保つ（著者名|yyyyMMdd-HHmm、約20バイト）。長い文字列は
//   縮小・再圧縮後に復号できなくなるため、検出は pilot＋台帳照合が本命。
import {
  WM, wmPattern, wmTemplate, wmZscore, wmTemplateScore, wmDecode,
  wmLuma, wmIntegral, wmCells, wmResidual,
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
