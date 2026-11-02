// 電子透かし コア（wmdetect の CORE を移植）
// Port of wm_common.py / detect.py. Patterns must match numpy exactly:
// sha256("key:idx")[:8] (little-endian) -> SeedSequence -> PCG64 -> choice([-1,1]),
// where choice() takes the MSB of successive 32-bit halves (low half first).
//
// 方式: 1280x720 フレームを 160x90 グリッドに分け、各セルに鍵由来の ±1 パターンを
// 輝度信号として重ねる。検出は予測残差とパターンの相関 (z スコア) で行う。
// パイロット信号 (idx=-1) が「透かしの有無＋どの鍵か」、idx=0.. の各パターンが
// ペイロードの各ビットに対応する。

export interface WmDecoded {
  text: string
  flips: number
  bits: number
  median: number
  min: number
}

const W = 1280, H = 720, GW = 160, GH = 90, N = GW * GH
const M64 = (1n << 64n) - 1n, M128 = (1n << 128n) - 1n
const MULT = (0x2360ED051FC65DA4n << 64n) | 0x4385DF649FCCF645n

function seedState(seed: bigint): bigint[] {
  const ent: number[] = []
  if (seed === 0n) ent.push(0)
  for (let n = seed; n > 0n; n >>= 32n) ent.push(Number(n & 0xFFFFFFFFn))
  let hc = 0x43b0d7e5
  const hashmix = (v: number): number => {
    v = (v ^ hc) >>> 0
    hc = Math.imul(hc, 0x931e8875) >>> 0
    v = Math.imul(v, hc) >>> 0
    return (v ^ (v >>> 16)) >>> 0
  }
  const mix = (x: number, y: number): number => {
    const r = (Math.imul(0xca01f9dd, x) - Math.imul(0x4973f715, y)) >>> 0
    return (r ^ (r >>> 16)) >>> 0
  }
  const pool = new Uint32Array(4)
  for (let i = 0; i < 4; i++) pool[i] = hashmix(i < ent.length ? ent[i] : 0)
  for (let s = 0; s < 4; s++) for (let d = 0; d < 4; d++) if (s !== d) pool[d] = mix(pool[d], hashmix(pool[s]))
  for (let s = 4; s < ent.length; s++) for (let d = 0; d < 4; d++) pool[d] = mix(pool[d], hashmix(ent[s]))
  const out = new Uint32Array(8)
  let hb = 0x8b51f9dd
  for (let i = 0; i < 8; i++) {
    let v = (pool[i % 4] ^ hb) >>> 0
    hb = Math.imul(hb, 0x58f38ded) >>> 0
    v = Math.imul(v, hb) >>> 0
    out[i] = (v ^ (v >>> 16)) >>> 0
  }
  const u64 = (k: number): bigint => (BigInt(out[2 * k + 1]) << 32n) | BigInt(out[2 * k])
  return [u64(0), u64(1), u64(2), u64(3)]
}

function pcg64(st: bigint[]): () => bigint {
  const inc = ((((st[2] << 64n) | st[3]) << 1n) | 1n) & M128
  let s = inc & M128                                    // state = 0 * MULT + inc
  s = (s + ((st[0] << 64n) | st[1])) & M128
  s = (s * MULT + inc) & M128
  return () => {
    s = (s * MULT + inc) & M128
    const x = ((s >> 64n) ^ s) & M64
    const rot = s >> 122n
    return ((x >> rot) | (x << ((64n - rot) & 63n))) & M64
  }
}

const patternCache = new Map<string, Int8Array>()

export async function wmPattern(key: string, idx: number): Promise<Int8Array> {
  const id = key + '\u0000' + idx
  const hit = patternCache.get(id)
  if (hit) return hit
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}:${idx}`)))
  let seed = 0n
  for (let i = 7; i >= 0; i--) seed = (seed << 8n) | BigInt(d[i])
  const next = pcg64(seedState(seed))
  const p = new Int8Array(N)
  for (let i = 0; i < N; i += 2) {
    const r = next()
    p[i] = (r >> 31n) & 1n ? 1 : -1
    p[i + 1] = r >> 63n ? 1 : -1
  }
  patternCache.set(id, p)
  return p
}

// ---- image processing on the 160x90 grid ----

export function wmLuma(rgba: Uint8ClampedArray, n: number): Float32Array {
  const y = new Float32Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4)
    y[i] = 16 + (65.481 * rgba[j] + 128.553 * rgba[j + 1] + 24.966 * rgba[j + 2]) / 255
  return y
}

export function wmIntegral(y: Float32Array, w: number, h: number): Float64Array {
  const w1 = w + 1, I = new Float64Array(w1 * (h + 1))
  for (let r = 0; r < h; r++) {
    let s = 0
    for (let c = 0; c < w; c++) { s += y[r * w + c]; I[(r + 1) * w1 + c + 1] = I[r * w1 + c + 1] + s }
  }
  return I
}

// mean of each 8x8 cell, grid origin at (ox, oy) in the integral image
export function wmCells(I: Float64Array, w: number, ox: number, oy: number): Float32Array {
  const w1 = w + 1, g = new Float32Array(N)
  for (let i = 0; i < GH; i++) {
    const y0 = (oy + 8 * i) * w1, y1 = y0 + 8 * w1
    for (let j = 0; j < GW; j++) {
      const x0 = ox + 8 * j, x1 = x0 + 8
      g[i * GW + j] = (I[y1 + x1] - I[y0 + x1] - I[y1 + x0] + I[y0 + x0]) / 64
    }
  }
  return g
}

// g - mean of 4 neighbours (cv2 BORDER_REFLECT == edge duplicate for 1px)
export function wmPredResidual(g: Float32Array, gw = GW, gh = GH): Float32Array {
  const e = new Float32Array(gw * gh)
  for (let i = 0; i < gh; i++) {
    const u = Math.max(i - 1, 0), d = Math.min(i + 1, gh - 1)
    for (let j = 0; j < gw; j++) {
      const l = Math.max(j - 1, 0), r = Math.min(j + 1, gw - 1)
      e[i * gw + j] = g[i * gw + j] - 0.25 * (g[u * gw + j] + g[d * gw + j] + g[i * gw + l] + g[i * gw + r])
    }
  }
  return e
}

const KR = 12, KERN = ((): Float32Array => {
  const k = new Float32Array(2 * KR + 1); let s = 0
  for (let i = -KR; i <= KR; i++) s += (k[i + KR] = Math.exp(-(i * i) / 18))
  return k.map((v) => v / s)
})()

// cv2 BORDER_REFLECT_101, valid for any overshoot
const r101 = (i: number, n: number): number => {
  if (n === 1) return 0
  const p = 2 * n - 2; i = ((i % p) + p) % p
  return i < n ? i : p - i
}

function gauss(a: Float32Array, gw = GW, gh = GH): Float32Array {
  const t = new Float32Array(gw * gh), o = new Float32Array(gw * gh)
  for (let i = 0; i < gh; i++) for (let j = 0; j < gw; j++) {
    let s = 0; for (let k = -KR; k <= KR; k++) s += KERN[k + KR] * a[i * gw + r101(j + k, gw)]
    t[i * gw + j] = s
  }
  for (let i = 0; i < gh; i++) for (let j = 0; j < gw; j++) {
    let s = 0; for (let k = -KR; k <= KR; k++) s += KERN[k + KR] * t[r101(i + k, gh) * gw + j]
    o[i * gw + j] = s
  }
  return o
}

// == wm_common.grid_residual on precomputed cell means
export function wmResidual(g: Float32Array, gw = GW, gh = GH): Float32Array {
  const n = gw * gh, e = wmPredResidual(g, gw, gh), sq = new Float32Array(n)
  for (let i = 0; i < n; i++) sq[i] = e[i] * e[i]
  const b = gauss(sq, gw, gh)
  for (let i = 0; i < n; i++) e[i] /= Math.sqrt(Math.max(b[i], 0)) + 0.3
  return e
}

// z-score of correlation with a +/-1 pattern (acc centred, unit-normalised)
export function wmZscore(acc: Float64Array, p: Int8Array): number {
  let m = 0; for (let i = 0; i < N; i++) m += acc[i]; m /= N
  let v = 0, c = 0
  for (let i = 0; i < N; i++) { const a = acc[i] - m; v += a * a; c += a * p[i] }
  return c / Math.sqrt(v)   // == sum(a*p) / (std * sqrt(N))
}

// z-score against a real-valued template (zero mean / unit std), e.g. a ledger payload.
export function wmTemplateScore(acc: Float64Array, t: Float64Array): number {
  let m = 0; for (let i = 0; i < N; i++) m += acc[i]; m /= N
  let v = 0, c = 0
  for (let i = 0; i < N; i++) { const a = acc[i] - m; v += a * a; c += a * t[i] }
  return c / Math.sqrt(v)
}

// ---- payload: [len:8][utf8][crc16-ccitt init 0xFFFF] ----

export function wmCrc16(bytes: Uint8Array): number {
  let c = 0xFFFF
  for (const b of bytes) {
    c ^= b << 8
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF
  }
  return c
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

function tryDecode(bits: Uint8Array): string | null {
  const b = new Uint8Array(bits.length >> 3)
  for (let k = 0; k < bits.length; k++) b[k >> 3] |= bits[k] << (7 - (k & 7))
  const n = b[0]
  if (n < 1 || 1 + n + 2 !== b.length) return null
  const data = b.subarray(1, 1 + n), c = wmCrc16(data)
  if (b[1 + n] !== c >> 8 || b[2 + n] !== (c & 255)) return null
  try { return utf8Decoder.decode(data) } catch { return null }
}

function* combos(arr: number[], k: number, start = 0, cur: number[] = []): Generator<number[]> {
  if (cur.length === k) { yield cur; return }
  for (let i = start; i < arr.length; i++) yield* combos(arr, k, i + 1, [...cur, arr[i]])
}

// Chase decoding: flip up to 4 of the 12 least reliable non-header bits
function chase(corr: number[], n: number): { text: string; flips: number } | null {
  const L = 8 + 8 * n + 16, bits = new Uint8Array(L)
  for (let k = 0; k < L; k++) bits[k] = k < 8 ? (n >> (7 - k)) & 1 : corr[k] > 0 ? 1 : 0
  const weak = [...Array(L - 8).keys()].map((k) => k + 8)
    .sort((a, b) => Math.abs(corr[a]) - Math.abs(corr[b])).slice(0, 12)
  for (let k = 0; k <= 4; k++) for (const c of combos(weak, k)) {
    const b = bits.slice(); for (const i of c) b[i] ^= 1
    const text = tryDecode(b)
    if (text !== null) return { text, flips: k }
  }
  return null
}

export async function wmDecode(
  acc: Float64Array, key: string, onProgress?: (i: number, L: number) => void,
): Promise<WmDecoded | null> {
  const corr: number[] = []
  const need = async (L: number): Promise<void> => {
    for (let i = corr.length; i < L; i++) {
      corr.push(wmZscore(acc, await wmPattern(key, i)))
      if (onProgress && i % 8 === 0) { onProgress(i, L); await new Promise((r) => setTimeout(r)) }
    }
  }
  await need(8)
  const hard = corr.slice(0, 8).reduce((v, z) => (v << 1) | (z > 0 ? 1 : 0), 0)
  // header candidates: as read, then single flips, then pairs of the weakest 4
  const order = [...Array(8).keys()].sort((a, b) => Math.abs(corr[a]) - Math.abs(corr[b]))
  const cand = [hard]
  for (let i = 0; i < 8; i++) cand.push(hard ^ (1 << (7 - i)))
  for (const [a, b] of combos(order.slice(0, 4), 2)) cand.push(hard ^ (1 << (7 - a)) ^ (1 << (7 - b)))
  for (const n of [...new Set(cand)]) {
    if (n < 1 || n > 64) continue
    await need(8 + 8 * n + 16)
    const r = chase(corr, n)
    if (r) {
      const hdrFlips = [...Array(8).keys()].filter((i) => ((n ^ hard) >> (7 - i)) & 1).length
      const L = 8 + 8 * n + 16, abs = corr.slice(0, L).map(Math.abs).sort((a, b) => a - b)
      return { text: r.text, flips: r.flips + hdrFlips, bits: L, median: abs[L >> 1], min: abs[0] }
    }
  }
  return null
}

// ---- combined signal grid (embed + crop/ledger template) ----

export function wmPayloadSigns(text: string): Int8Array {
  const d = new TextEncoder().encode(text)
  if (d.length < 1 || d.length > 255) throw new Error('埋め込み文字列が長すぎます')
  const c = wmCrc16(d), blob = [d.length, ...d, c >> 8, c & 255]
  const s = new Int8Array(blob.length * 8)
  blob.forEach((b, k) => { for (let i = 0; i < 8; i++) s[k * 8 + i] = (b >> (7 - i)) & 1 ? 1 : -1 })
  return s
}

// == wm_common.build_grid (or the pilot alone when text is empty), zero mean / unit std
export async function wmTemplate(key: string, text: string): Promise<Float64Array> {
  const T = new Float64Array(N), pilot = await wmPattern(key, -1)
  if (text) {
    const signs = wmPayloadSigns(text), a = Math.sqrt(0.9 / signs.length)
    for (let k = 0; k < signs.length; k++) {
      const p = await wmPattern(key, k)
      for (let i = 0; i < N; i++) T[i] += a * signs[k] * p[i]
    }
    for (let i = 0; i < N; i++) T[i] += Math.sqrt(0.1) * pilot[i]
  } else {
    for (let i = 0; i < N; i++) T[i] = pilot[i]
  }
  let m = 0; for (const v of T) m += v; m /= N
  let v2 = 0; for (const v of T) v2 += (v - m) ** 2
  const sd = Math.sqrt(v2 / N)
  return T.map((v) => (v - m) / sd)
}

export const WM = { W, H, GW, GH, N }
