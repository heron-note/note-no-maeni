import { encryptText, decryptText } from './crypto'

const ENCRYPTED_MARKER = '__enc_v1__'

function collectData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.startsWith('nob_')) data[key] = localStorage.getItem(key)!
  }
  return data
}

function saveFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadImage(dataUrl: string, filename: string): Promise<void> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const file = new File([blob], filename, { type: blob.type })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch {
      // user cancelled or share failed — fall through
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportData(): Promise<void> {
  const data = collectData()
  const filename = `note-no-maeni-backup-${new Date().toISOString().slice(0, 10)}.json`
  const password = window.prompt('バックアップを暗号化するパスワードを入力してください。\n空欄にすると暗号化せずに保存します。')
  if (password === null) return // キャンセル

  if (password === '') {
    saveFile(JSON.stringify(data, null, 2), filename)
    return
  }

  const encrypted = await encryptText(JSON.stringify(data), password)
  saveFile(JSON.stringify({ [ENCRYPTED_MARKER]: encrypted }), filename)
}

export async function importData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target!.result as string) as Record<string, string>
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('invalid')); return
        }

        let data: Record<string, string>

        if (ENCRYPTED_MARKER in parsed) {
          const password = window.prompt('このファイルは暗号化されています。パスワードを入力してください。')
          if (password === null) { reject(new Error('cancelled')); return }
          try {
            data = JSON.parse(await decryptText(parsed[ENCRYPTED_MARKER], password))
          } catch {
            reject(new Error('パスワードが正しくありません')); return
          }
        } else {
          data = parsed
        }

        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('nob_') && typeof value === 'string') {
            localStorage.setItem(key, value)
          }
        }
        resolve()
      } catch {
        reject(new Error('parse error'))
      }
    }
    reader.onerror = () => reject(new Error('read error'))
    reader.readAsText(file)
  })
}
