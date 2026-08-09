const ENC = new TextEncoder()
const DEC = new TextDecoder()

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey('raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 200_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 暗号化して base64 文字列を返す */
export async function encryptText(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await deriveKey(password, salt)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(plaintext))
  const buf = new Uint8Array(salt.length + iv.length + cipher.byteLength)
  buf.set(salt, 0)
  buf.set(iv, 16)
  buf.set(new Uint8Array(cipher), 28)
  return btoa(String.fromCharCode(...buf))
}

/** base64 文字列を復号して平文を返す。パスワード誤りは例外を投げる */
export async function decryptText(encoded: string, password: string): Promise<string> {
  const buf  = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const salt = buf.slice(0, 16)
  const iv   = buf.slice(16, 28)
  const data = buf.slice(28)
  const key  = await deriveKey(password, salt)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return DEC.decode(plain)
}
