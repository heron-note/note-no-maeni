import type { CharDef } from './types'

// キャラクター定義ファイル
// 新キャラを追加するには：
//   1. ここにエントリを追加
//   2. public/assets/images/characters/<key>/ に
//      normal.svg / write.svg / rest.svg / watch.svg を置く
// それだけで選択画面に自動で表示されます。

export const CHARS: CharDef[] = [
  { key: 'kuma', label: 'クマ' },
  { key: 'neko', label: 'ネコ' },
  { key: 'maru', label: 'まる' },
]

export function charImgPath(charKey: string, stateKey: string): string {
  return `assets/images/characters/${charKey}/${stateKey}.svg`
}
