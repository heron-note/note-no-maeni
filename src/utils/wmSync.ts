// 透かしの鍵の同期仕様（A案, 2026-11-06 決定）
//
// - 鍵の平文は端末の localStorage（nob_wm_keys）の中だけに置く。
// - GitHub 同期・バックアップなど、端末の外へ出るデータでは平文の鍵を必ず除き、
//   代わりにパスフレーズで暗号化した鍵束（nob_wm_keys_enc）だけを含める。
//   暗号化は既存の crypto.ts（PBKDF2 200k + AES-GCM）を使う。
// - パスフレーズ自体は nob_ プレフィックスを付けず端末内にだけ保存し、
//   同期・バックアップの対象にしない（GitHub トークンと同じ扱い）。
//   別端末ではパスフレーズを入れ直せば鍵を復元できる。忘れた場合は復元不可で、
//   台帳（ペイロード・鍵指紋・ファイル指紋）は鍵そのものではないため従来どおり同期する。
import { encryptText, decryptText } from './crypto'
import type { WmKey } from '../types'

const KEYS = 'nob_wm_keys'
const KEYS_ENC = 'nob_wm_keys_enc'
const PASS = 'wm_sync_pass' // 端末内のみ（同期対象外）

export function getWmSyncPass(): string {
  return localStorage.getItem(PASS) ?? ''
}

export function setWmSyncPass(v: string): void {
  if (v) localStorage.setItem(PASS, v)
  else localStorage.removeItem(PASS)
}

export function loadPlainWmKeys(): WmKey[] {
  try {
    const v = localStorage.getItem(KEYS)
    return v ? (JSON.parse(v) as WmKey[]) : []
  } catch { return [] }
}

export function hasWmKeysEnc(): boolean {
  return !!localStorage.getItem(KEYS_ENC)
}

/** 現在の平文鍵を暗号化して nob_wm_keys_enc を更新する（パスフレーズ未設定なら何もしない）。 */
export async function refreshWmKeysEnc(): Promise<boolean> {
  const pass = getWmSyncPass()
  if (!pass) return false
  const keys = loadPlainWmKeys()
  if (keys.length === 0) return false
  const enc = await encryptText(JSON.stringify(keys), pass)
  localStorage.setItem(KEYS_ENC, enc)
  return true
}

/**
 * 端末外へ出すデータ（GitHub 同期・バックアップ）を作る。
 * 平文の鍵は必ず取り除き、暗号化した鍵束だけを含める。
 * パスフレーズ未設定の場合も平文は出さない（既存の暗号化鍵束があればそれだけ残す）。
 */
export async function makeExternalData(data: Record<string, string>): Promise<Record<string, string>> {
  const out = { ...data }
  delete out[KEYS]
  const pass = getWmSyncPass()
  if (pass) {
    const keys = loadPlainWmKeys()
    if (keys.length > 0) {
      const enc = await encryptText(JSON.stringify(keys), pass)
      out[KEYS_ENC] = enc
      localStorage.setItem(KEYS_ENC, enc) // ローカル側の暗号化鍵束も最新に保つ
    }
  }
  return out
}

/**
 * 暗号化された鍵束をパスフレーズで復号し、ローカルの平文鍵へ合流させる（id 単位の和集合）。
 * 復元できた件数を返す。パスフレーズ違いは例外。
 */
export async function restoreWmKeysFromEnc(pass: string): Promise<number> {
  const enc = localStorage.getItem(KEYS_ENC)
  if (!enc || !pass) return 0
  const plain = await decryptText(enc, pass)
  const remote = JSON.parse(plain) as WmKey[]
  const local = loadPlainWmKeys()
  const ids = new Set(local.map((k) => k.id))
  const added = remote.filter((k) => k && typeof k.key === 'string' && !ids.has(k.id))
  if (added.length > 0) {
    localStorage.setItem(KEYS, JSON.stringify([...local, ...added]))
  }
  return added.length
}
