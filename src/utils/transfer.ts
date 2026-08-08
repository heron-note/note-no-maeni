export function exportData(): void {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.startsWith('nob_')) {
      data[key] = localStorage.getItem(key)!
    }
  }
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `note-no-maeni-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target!.result as string) as Record<string, string>
        if (typeof data !== 'object' || Array.isArray(data)) {
          reject(new Error('invalid'))
          return
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
