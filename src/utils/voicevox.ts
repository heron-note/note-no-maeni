const VOICEVOX_URL = 'http://localhost:50021'
const SPEAKER = 1

export async function speakVoicevox(text: string): Promise<void> {
  try {
    const queryRes = await fetch(
      `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${SPEAKER}`,
      { method: 'POST' }
    )
    if (!queryRes.ok) return
    const query = await queryRes.json()

    const synthRes = await fetch(
      `${VOICEVOX_URL}/synthesis?speaker=${SPEAKER}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      }
    )
    if (!synthRes.ok) return

    const blob = await synthRes.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    await audio.play()
  } catch (err) {
    console.error('[VOICEVOX]', err)
  }
}
