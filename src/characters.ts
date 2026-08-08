import type { CharDef } from './types'

// キャラクター定義ファイル
// 新キャラを追加するには：
//   1. ここにエントリを追加
//   2. public/assets/images/characters/<key>/ に
//      normal.png / write.png / rest.png を置く
// それだけで選択画面に自動で表示されます。

export const CHARS: CharDef[] = [
  { key: 'kuma', label: 'クマ' },
  { key: 'neko', label: 'ネコ' },
  { key: 'usagi', label: 'ウサギ' },
]

export function getChars(): CharDef[] {
  const hasCustom = ['normal', 'write', 'rest'].every(
    k => localStorage.getItem(`nob_custom_img_${k}`)
  )
  return hasCustom ? [...CHARS, { key: 'custom', label: 'マイキャラ' }] : CHARS
}

export function charImgPath(charKey: string, stateKey: string): string {
  if (charKey === 'custom') {
    return localStorage.getItem(`nob_custom_img_${stateKey}`) ?? ''
  }
  return `assets/images/characters/${charKey}/${stateKey}.png`
}
