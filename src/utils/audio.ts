const audioTest = new Audio()
const EXT = audioTest.canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.mp3'

export function playStampSound(): void {
  const a = new Audio(`assets/sounds/blow4${EXT}`)
  a.play().catch(() => {})
}
