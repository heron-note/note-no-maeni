const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'

function playVV(name: string): void {
  const a = new Audio(`assets/sounds/${name}${EXT}`)
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
