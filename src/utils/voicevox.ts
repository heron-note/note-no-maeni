import { storage } from './storage'

const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'
const BASE = import.meta.env.BASE_URL

export function preloadVoicevox(key: VoicevoxKey): HTMLAudioElement {
  const a = new Audio(`${BASE}assets/sounds/${key}${EXT}`)
  a.preload = 'auto'
  return a
}

export function speakVoicevox(key: VoicevoxKey): void {
  if (!storage.loadSoundEnabled()) return
  const a = new Audio(`${BASE}assets/sounds/${key}${EXT}`)
  a.play().catch(() => {})
}

export type VoicevoxKey =
  | 'vv_hajimemashite'
  | 'vv_okaeri'
  | 'vv_yasumu'
  | 'vv_kaite'
  | 'vv_yasumokka'
  | 'vv_tanoshiku'
  | 'vv_asobini'
