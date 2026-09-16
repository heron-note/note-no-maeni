// GitHub連携（初回接続）の実行ログをアプリ内に永続化する。
// iPhone実機ではconsole.log等を確認する手段が無く、開発者が直接デバイスを
// 触れない状況でも状況を自己解析できるようにするため、初回連携の間だけ
// ログを残す（設定画面から閲覧・コピーできる）。ふだんのバックグラウンド
// 再同期（visibilitychange等）まで含めると量が多くなりすぎるため対象外。

export interface SyncLogEntry {
  time: string // ISO8601
  level: 'info' | 'error'
  message: string
}

const LOG_KEY = 'ghsync_connect_log' // nob_ プレフィックスを付けない（GitHub同期対象から除外するため）
const MAX_ENTRIES = 200

function readLog(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? (JSON.parse(raw) as SyncLogEntry[]) : []
  } catch {
    return []
  }
}

function writeLog(entries: SyncLogEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // 容量超過等は無視する（ログはあくまで補助であり、アプリ本体の動作に影響させない）
  }
}

export function logConnect(level: SyncLogEntry['level'], message: string): void {
  const entries = readLog()
  entries.push({ time: new Date().toISOString(), level, message })
  writeLog(entries)
  if (level === 'error') console.error(`[GitHub連携] ${message}`)
  else console.info(`[GitHub連携] ${message}`)
}

/** 新しい初回連携を始める前に呼ぶ。前回分のログが混ざらないようにする。 */
export function resetConnectLog(): void {
  writeLog([])
}

export function getConnectLog(): SyncLogEntry[] {
  return readLog()
}

export function formatConnectLog(): string {
  return getConnectLog()
    .map(e => `[${e.time}] ${e.level === 'error' ? 'ERROR' : 'INFO'} ${e.message}`)
    .join('\n')
}
