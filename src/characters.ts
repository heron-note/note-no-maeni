import type { CharDef } from './types'
import { storage } from './utils/storage'

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

export const CUSTOM_KEY_PREFIX = 'custom:'

export function getChars(): CharDef[] {
  const customs = storage.loadCustomCompanions()
  return [...CHARS, ...customs.map(c => ({ key: `${CUSTOM_KEY_PREFIX}${c.id}`, label: c.label }))]
}

export function charImgPath(charKey: string, stateKey: string): string {
  if (charKey.startsWith(CUSTOM_KEY_PREFIX)) {
    const id = charKey.slice(CUSTOM_KEY_PREFIX.length)
    const companion = storage.loadCustomCompanions().find(c => c.id === id)
    if (!companion) return ''
    return (companion as unknown as Record<string, string>)[stateKey] ?? ''
  }
  return `assets/images/characters/${charKey}/${stateKey}.png`
}
