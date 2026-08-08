import { storage } from './storage'

const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'
const BASE = import.meta.env.BASE_URL

export function playStampSound(): void {
  if (!storage.loadSoundEnabled()) return
  const a = new Audio(`${BASE}assets/sounds/blow4${EXT}`)
  a.play().catch(() => {})
}
