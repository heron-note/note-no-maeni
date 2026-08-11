export type ScreenName =
  | 'onboarding'
  | 'home'
  | 'settings'
  | 'template-editor'
  | 'character-creator'
  | 'character-creator-simple'
  | 'user-template-list'
  | 'user-template-editor'
  | 'eyecatch-creator'

export type ChoiceType = 'write' | 'rest'

export interface CharDef {
  key: string
  label: string
}

export interface User {
  name: string
  character: string
  onboarded: boolean
}

export interface LogEntry {
  type: ChoiceType
  timestamp: string
  declarationId: string | null
}

export interface Declaration {
  id: string
  text: string
}

export interface Template {
  lines: string[]        // 各行のHTML文字列
  insertAfterIndex: number  // -1=先頭, 0..N-1=行後, N=末尾
}

export interface UserTemplate {
  id: string
  title: string
  lines: string[]  // 各行のHTML文字列（Template.lines と同形式）
}

export const USER_TEMPLATE_MAX = 5

export interface NoteTag {
  id: string
  text: string  // # なし
}

export interface Bookmark {
  id: string
  name: string
  url: string
  priority: number               // 0〜3
  recommendCount: number
  lastRecommendedDate: string | null  // YYYY-MM-DD
}
