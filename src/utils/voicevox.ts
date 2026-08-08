const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'
const BASE = import.meta.env.BASE_URL

function playVV(name: string): void {
  const a = new Audio(`${BASE}assets/sounds/${name}${EXT}`)
  a.play().catch(() => {})
}

export function speakVoicevox(key: VoicevoxKey): void {
  playVV(key)
}

export type VoicevoxKey =
  | 'vv_hajimemashite'
  | 'vv_okaeri'
  | 'vv_yasumu'
  | 'vv_kaite'
  | 'vv_yasumokka'
  | 'vv_tanoshiku'
