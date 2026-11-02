export type ScreenName =
  | 'onboarding'
  | 'home'
  | 'settings'
  | 'watermark-studio'
  | 'template-editor'
  | 'character-creator'
  | 'character-creator-simple'
  | 'user-template-list'
  | 'user-template-editor'
  | 'rest-template-list'
  | 'rest-template-editor'
  | 'eyecatch-creator'
  | 'article-stocker'
  | 'lp-editor'

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

export interface RestTemplate {
  id: string
  title: string
  lines: string[]
  insertAfterIndex: number
}

export const REST_TEMPLATE_MAX = 5

/** 透かし用鍵。古い鍵も検出に必要なので、履歴として残す。 */
export interface WmKey {
  id: string
  key: string
  createdAt: string // ISO
}

/** 透かしの埋め込み台帳。切り抜き照合や復号できない場合の照合に使う。 */
export interface WmRecord {
  id: string
  at: string // ISO (埋め込み実行時刻)
  payload: string // 埋めた文字列（著者名|yyyyMMdd-HHmm）
  invisible: boolean
  visible: boolean
  keyId: string
  keyFingerprint: string // 鍵の SHA-256 先頭12桁
  fileName: string // 出力ファイル名
  kind: 'image' | 'video'
  width: number
  height: number
  sha256: string // 出力ファイルの SHA-256
}

export interface CustomCompanion {
  id: string
  label: string
  normal: string  // dataURL (PNG)
  write: string
  rest: string
  createdAt: number
}

export const CUSTOM_COMPANION_MAX = 5

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
