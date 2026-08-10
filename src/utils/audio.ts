import { storage } from './storage'

const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'
const BASE = import.meta.env.BASE_URL

// AudioContext 経由で再生（iOS でメディア音量チャンネルを使う + gain ブースト）
function playFileWithContext(url: string, gain = 2.0): void {
  try {
    ;(navigator as any).audioSession && ((navigator as any).audioSession.type = 'ambient')
    const ctx = new AudioContext()
    const audio = new Audio(url)
    const source = ctx.createMediaElementSource(audio)
    const gainNode = ctx.createGain()
    gainNode.gain.value = gain
    source.connect(gainNode)
    gainNode.connect(ctx.destination)
    ctx.resume().then(() => audio.play().catch(() => ctx.close()))
    audio.onended = () => ctx.close()
  } catch {
    const a = new Audio(url)
    a.volume = 1
    a.play().catch(() => {})
  }
}

export function playStampSound(): void {
  if (!storage.loadSoundEnabled()) return
  playFileWithContext(`${BASE}assets/sounds/blow4${EXT}`)
}

export function playPowan(): void {
  if (!storage.loadSoundEnabled()) return
  try {
    ;(navigator as any).audioSession && ((navigator as any).audioSession.type = 'ambient')
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    const now = ctx.currentTime
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.linearRampToValueAtTime(660, now + 0.06)
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.45)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.8, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    osc.start(now)
    osc.stop(now + 0.5)
    osc.onended = () => ctx.close()
  } catch {
    // AudioContext 未対応環境は無視
  }
}
