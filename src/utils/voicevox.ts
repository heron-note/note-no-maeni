import { storage } from './storage'

const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'
const BASE = import.meta.env.BASE_URL

export function preloadVoicevox(key: VoicevoxKey): HTMLAudioElement {
  const a = new Audio(`${BASE}assets/sounds/${key}${EXT}`)
  a.preload = 'auto'
  return a
}

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

export function speakVoicevox(key: VoicevoxKey): void {
  if (!storage.loadSoundEnabled()) return
  playFileWithContext(`${BASE}assets/sounds/${key}${EXT}`)
}

export type VoicevoxKey =
  | 'vv_hajimemashite'
  | 'vv_okaeri'
  | 'vv_yasumu'
  | 'vv_kaite'
  | 'vv_yasumokka'
  | 'vv_tanoshiku'
  | 'vv_asobini'
