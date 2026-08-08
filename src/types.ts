export type ScreenName =
  | 'onboarding'
  | 'home'
  | 'reaction'
  | 'rest'
  | 'rest-template'
  | 'settings'
  | 'template-editor'

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
