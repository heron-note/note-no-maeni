import { storage } from './storage'

const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'
const BASE = import.meta.env.BASE_URL

export function playStampSound(): void {
  if (!storage.loadSoundEnabled()) return
  const a = new Audio(`${BASE}assets/sounds/blow4${EXT}`)
  a.play().catch(() => {})
}

export function playPowan(): void {
  if (!storage.loadSoundEnabled()) return
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    const now = ctx.currentTime
    // ぽわん：低→高→低 の周波数カーブ
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.linearRampToValueAtTime(660, now + 0.06)
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.45)

    // 音量：ふわっと立ち上がって消える
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.35, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    osc.start(now)
    osc.stop(now + 0.5)
    osc.onended = () => ctx.close()
  } catch {
    // AudioContext 未対応環境は無視
  }
}
