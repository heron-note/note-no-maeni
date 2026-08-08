import { storage } from './storage'

function makeCtx(): AudioContext | null {
  try {
    const ctx = new AudioContext()
    ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function snareHit(ctx: AudioContext, time: number, vol: number) {
  const len = Math.floor(ctx.sampleRate * 0.07)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, time)
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07)
  src.connect(g)
  g.connect(ctx.destination)
  src.start(time)
  src.stop(time + 0.07)
}

export function startDrumRoll(duration: number): () => void {
  if (!storage.loadSoundEnabled()) return () => {}
  const ctx = makeCtx()
  if (!ctx) return () => {}

  const t0 = ctx.currentTime + 0.05
  let t = 0
  let interval = 0.055
  const maxInterval = 0.22

  while (t < duration) {
    snareHit(ctx, t0 + t, 0.8 - (t / duration) * 0.55)
    interval = Math.min(maxInterval, interval * 1.075)
    t += interval
  }

  return () => ctx.close()
}

export function playDrumHit(): void {
  if (!storage.loadSoundEnabled()) return
  const ctx = makeCtx()
  if (!ctx) return

  const now = ctx.currentTime

  // キック：周波数ドロップ
  const osc = ctx.createOscillator()
  const og = ctx.createGain()
  osc.frequency.setValueAtTime(200, now)
  osc.frequency.exponentialRampToValueAtTime(25, now + 0.2)
  og.gain.setValueAtTime(1.5, now)
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
  osc.connect(og)
  og.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.35)

  // アタック：ノイズバースト
  const len = Math.floor(ctx.sampleRate * 0.03)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const ns = ctx.createBufferSource()
  ns.buffer = buf
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(1.0, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
  ns.connect(ng)
  ng.connect(ctx.destination)
  ns.start(now)
  ns.stop(now + 0.03)

  setTimeout(() => ctx.close(), 500)
}
