import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { storage } from '../utils/storage'
import { useSlideBack } from '../hooks/useSlideBack'
import { Toast } from '../components/Toast'
import { downloadImage } from '../utils/transfer'
import type { WmKey, WmRecord } from '../types'
import {
  WM_STRENGTH, buildWmPayload, parseWmPayload, wmKeyFingerprint, sha256Hex,
  generateWmKey, embedInvisible, embedCanvasWithTemplate, drawVisibleWatermark,
  newAccumulator, addFrameToAccumulator, accumulateVideoFrames, detectWithKeys,
  type WmStrengthKey, type WmDetectKeyResult,
} from '../utils/wm'
import { wmTemplate } from '../utils/wmCore'

type Tab = 'embed' | 'detect' | 'history'
type EmbedMode = 'invisible' | 'visible' | 'both'

const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name)

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function saveBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function WatermarkStudio() {
  const goHome = useAppStore((s) => s.goHome)
  const userName = useAppStore((s) => s.user?.name ?? '')
  const { closing, handleBack } = useSlideBack(goHome)

  const [tab, setTab] = useState<Tab>('embed')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  // 鍵と台帳
  const [keys, setKeys] = useState<WmKey[]>(() => storage.loadWmKeys())
  const [currentKeyId, setCurrentKeyId] = useState<string | null>(() => storage.loadWmCurrentKeyId())
  const [records, setRecords] = useState<WmRecord[]>(() => storage.loadWmRecords())
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({})
  const currentKey = keys.find((k) => k.id === currentKeyId) ?? keys[keys.length - 1] ?? null

  const [author, setAuthor] = useState(() => storage.loadWmAuthor() || userName)

  const refreshFingerprints = async (list: WmKey[]) => {
    const map: Record<string, string> = {}
    for (const k of list) map[k.id] = await wmKeyFingerprint(k.key)
    setFingerprints(map)
  }
  useMemo(() => { void refreshFingerprints(keys) }, []) // 初回のみ

  const createKey = () => {
    const k: WmKey = { id: crypto.randomUUID(), key: generateWmKey(), createdAt: new Date().toISOString() }
    const next = [...keys, k]
    storage.saveWmKeys(next)
    storage.saveWmCurrentKeyId(k.id)
    setKeys(next); setCurrentKeyId(k.id)
    void refreshFingerprints(next)
    setToast('新しい鍵を生成しました（古い鍵も検出用に残ります）')
  }

  const selectKey = (id: string) => {
    storage.saveWmCurrentKeyId(id)
    setCurrentKeyId(id)
  }

  const addRecord = (r: WmRecord) => {
    const next = [r, ...records]
    storage.saveWmRecords(next)
    setRecords(next)
  }

  const deleteRecord = (id: string) => {
    const next = records.filter((r) => r.id !== id)
    storage.saveWmRecords(next)
    setRecords(next)
  }

  return (
    <div className={`screen-scroll${closing ? ' screen-slide-out' : ''}`}>
      <div className="subscreen-header">
        <div className="subscreen-title-row">
          <button className="back-btn" onClick={handleBack}>‹</button>
          <h2 className="subscreen-title">透かし</h2>
        </div>
      </div>

      <p className="settings-hint" style={{ margin: '8px 0 14px' }}>
        画像・動画に電子透かし（見えない信号）と、必要に応じて見える文字列を入れて保存できます。
        万一の盗用トラブルの際に「自分が先に作った」根拠を残すための機能です。ファイルは端末の中だけで処理され、外部に送信されません。
      </p>

      <div className="eyecatch-mode-row" role="tablist">
        <button className={`eyecatch-mode-tab${tab === 'embed' ? ' active' : ''}`} onClick={() => setTab('embed')}>埋め込む</button>
        <button className={`eyecatch-mode-tab${tab === 'detect' ? ' active' : ''}`} onClick={() => setTab('detect')}>読み出す</button>
        <button className={`eyecatch-mode-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>履歴</button>
      </div>

      {tab === 'embed' && (
        <EmbedTab
          author={author} setAuthor={(v) => { setAuthor(v); storage.saveWmAuthor(v) }}
          keys={keys} currentKey={currentKey} fingerprints={fingerprints}
          onCreateKey={createKey} onSelectKey={selectKey}
          busy={busy} setBusy={setBusy} progress={progress} setProgress={setProgress}
          onEmbedded={addRecord} setToast={setToast}
        />
      )}
      {tab === 'detect' && (
        <DetectTab
          keys={keys} records={records} fingerprints={fingerprints}
          busy={busy} setBusy={setBusy} progress={progress} setProgress={setProgress}
          setToast={setToast}
        />
      )}
      {tab === 'history' && (
        <HistoryTab records={records} onDelete={deleteRecord} />
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

// ================= 埋め込む =================

interface EmbedProps {
  author: string; setAuthor: (v: string) => void
  keys: WmKey[]; currentKey: WmKey | null; fingerprints: Record<string, string>
  onCreateKey: () => void; onSelectKey: (id: string) => void
  busy: boolean; setBusy: (v: boolean) => void
  progress: string; setProgress: (v: string) => void
  onEmbedded: (r: WmRecord) => void; setToast: (v: string) => void
}

function EmbedTab(p: EmbedProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [mode, setMode] = useState<EmbedMode>('invisible')
  const [strength, setStrength] = useState<WmStrengthKey>('standard')
  const [visibleText, setVisibleText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const video = file ? isVideoFile(file) : false
  const payloadPreview = p.author.trim() ? buildWmPayload(p.author) : ''

  const pick = (f: File | undefined) => {
    if (!f) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    const d = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    setVisibleText(`© ${p.author.trim()} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`)
  }

  const finishRecord = async (blob: Blob, outName: string, kind: 'image' | 'video', w: number, h: number, payload: string, key: WmKey) => {
    const [sha, fp] = await Promise.all([sha256Hex(await blob.arrayBuffer()), wmKeyFingerprint(key.key)])
    p.onEmbedded({
      id: crypto.randomUUID(), at: new Date().toISOString(), payload,
      invisible: mode !== 'visible', visible: mode !== 'invisible',
      keyId: key.id, keyFingerprint: fp, fileName: outName, kind,
      width: w, height: h, sha256: sha,
    })
  }

  const runEmbed = async () => {
    if (!file || p.busy) return
    if (mode !== 'visible' && !p.currentKey) { p.setToast('先に鍵を生成してください'); return }
    if (mode !== 'visible' && !p.author.trim()) { p.setToast('署名（著者名）を入力してください'); return }
    p.setBusy(true)
    try {
      const payload = buildWmPayload(p.author)
      const base = file.name.replace(/\.[^.]+$/, '')
      if (video) {
        await embedVideo(file, payload, mode, strength, visibleText, p, async (blob, w, h) => {
          const outName = `${base}_wm.webm`
          saveBlobDownload(blob, outName)
          if (p.currentKey) await finishRecord(blob, outName, 'video', w, h, payload, p.currentKey)
        })
      } else {
        const bmp = await createImageBitmap(file)
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width; canvas.height = bmp.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(bmp, 0, 0)
        if (mode !== 'invisible') drawVisibleWatermark(ctx, canvas.width, canvas.height, visibleText || `© ${p.author.trim()}`)
        if (mode !== 'visible' && p.currentKey) {
          p.setProgress('電子透かしを埋め込んでいます…')
          await embedInvisible(ctx, canvas.width, canvas.height, p.currentKey.key, payload, WM_STRENGTH[strength])
        }
        const isJpeg = file.type === 'image/jpeg'
        const dataUrl = isJpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png')
        const outName = `${base}_wm.${isJpeg ? 'jpg' : 'png'}`
        await downloadImage(dataUrl, outName)
        if (p.currentKey) {
          const blob = await (await fetch(dataUrl)).blob()
          await finishRecord(blob, outName, 'image', canvas.width, canvas.height, payload, p.currentKey)
        }
        p.setToast('透かし入りで保存しました')
      }
    } catch (e) {
      p.setToast(e instanceof Error ? e.message : '処理に失敗しました')
    } finally {
      p.setProgress('')
      p.setBusy(false)
    }
  }

  return (
    <div>
      <div className="settings-row" style={{ marginTop: 16 }}>
        <p className="label">署名（著者名）</p>
        <input type="text" className="text-input" value={p.author} maxLength={24}
          placeholder="例：へろん" autoComplete="off"
          onChange={(e) => p.setAuthor(e.target.value)} />
        <p className="settings-hint">
          電子透かしには「署名＋埋め込み時刻（分まで）」が自動で入ります
          {payloadPreview && <>： <b>{payloadPreview}</b></>}
        </p>
      </div>

      <div className="settings-row" style={{ marginTop: 16 }}>
        <p className="label">鍵</p>
        {p.keys.length === 0 ? (
          <>
            <p className="settings-hint">電子透かしには鍵が必要です。鍵を知っている人だけが透かしを読み出せます。</p>
            <button className="btn-primary wide" onClick={p.onCreateKey}>鍵を生成する</button>
          </>
        ) : (
          <>
            <select className="text-input" value={p.currentKey?.id ?? ''} onChange={(e) => p.onSelectKey(e.target.value)}>
              {p.keys.map((k) => (
                <option key={k.id} value={k.id}>
                  鍵 {p.fingerprints[k.id] ?? '…'}（{fmtDateTime(k.createdAt)} 作成）
                </option>
              ))}
            </select>
            <button className="btn-secondary wide" onClick={p.onCreateKey}>新しい鍵を生成する</button>
            <p className="settings-hint">古い鍵は読み出し用に残ります。鍵を変えても、昔の画像は昔の鍵で読み出せます。</p>
          </>
        )}
      </div>

      <div className="settings-row" style={{ marginTop: 16 }}>
        <p className="label">対象ファイル（画像・動画）</p>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button className="btn-secondary wide" onClick={() => fileRef.current?.click()}>
          {file ? `${file.name}（${video ? '動画' : '画像'}）` : 'ファイルを選ぶ'}
        </button>
        {previewUrl && !video && <img src={previewUrl} alt="" style={{ width: '100%', borderRadius: 8, marginTop: 4 }} />}
        {previewUrl && video && <video src={previewUrl} controls style={{ width: '100%', borderRadius: 8, marginTop: 4 }} />}
      </div>

      <div className="settings-row" style={{ marginTop: 16 }}>
        <p className="label">入れるもの</p>
        <div className="creator-btn-row" style={{ maxWidth: '100%' }}>
          <button className={`btn-secondary${mode === 'invisible' ? ' wm-selected' : ''}`} onClick={() => setMode('invisible')}>電子透かしのみ</button>
          <button className={`btn-secondary${mode === 'visible' ? ' wm-selected' : ''}`} onClick={() => setMode('visible')}>見える文字列のみ</button>
          <button className={`btn-secondary${mode === 'both' ? ' wm-selected' : ''}`} onClick={() => setMode('both')}>両方</button>
        </div>
        {mode !== 'invisible' && (
          <input type="text" className="text-input" value={visibleText} maxLength={60}
            onChange={(e) => setVisibleText(e.target.value)} placeholder="右下に入れる文字列" />
        )}
        {mode !== 'visible' && (
          <>
            <p className="label" style={{ marginTop: 8 }}>電子透かしの強さ</p>
            <select className="text-input" value={strength} onChange={(e) => setStrength(e.target.value as WmStrengthKey)}>
              <option value="weak">弱（画質優先・大きな画像向け）</option>
              <option value="standard">標準（推奨）</option>
              <option value="strong">強（縮小・再圧縮されても残したい場合）</option>
            </select>
          </>
        )}
        {video && (
          <p className="settings-hint">
            動画の埋め込みは試験的です。再生しながら変換するため、動画の長さと同じ時間がかかります。
            出力は WebM 形式で、音声は含まれません。
          </p>
        )}
      </div>

      <button className="btn-primary wide" style={{ marginTop: 20 }} disabled={!file || p.busy} onClick={runEmbed}>
        {p.busy ? '処理中…' : '透かしを入れて保存する'}
      </button>
      {p.progress && <p className="settings-hint" style={{ textAlign: 'center' }}>{p.progress}</p>}
    </div>
  )
}

async function embedVideo(
  file: File, payload: string, mode: EmbedMode, strength: WmStrengthKey, visibleText: string,
  p: EmbedProps, done: (blob: Blob, w: number, h: number) => Promise<void>,
) {
  if (typeof MediaRecorder === 'undefined') throw new Error('このブラウザは動画の書き出しに対応していません')
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.src = url
    await new Promise<void>((res, rej) => { video.onloadeddata = () => res(); video.onerror = () => rej(new Error('動画を読み込めませんでした')) })
    const scale = Math.min(1, 1280 / video.videoWidth)
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const T = mode !== 'visible' && p.currentKey ? await wmTemplate(p.currentKey.key, payload) : null
    const stream = canvas.captureStream(30)
    const rec = new MediaRecorder(stream, { videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>((res) => { rec.onstop = () => res() })
    await video.play()
    rec.start(500)
    await new Promise<void>((res) => {
      const draw = () => {
        if (video.ended || video.paused) { res(); return }
        ctx.drawImage(video, 0, 0, w, h)
        if (mode !== 'invisible') drawVisibleWatermark(ctx, w, h, visibleText)
        if (T) embedCanvasWithTemplate(ctx, w, h, T, WM_STRENGTH[strength])
        p.setProgress(`変換中… ${Math.round((video.currentTime / video.duration) * 100)}%`)
        requestAnimationFrame(draw)
      }
      draw()
    })
    rec.stop()
    await stopped
    await done(new Blob(chunks, { type: 'video/webm' }), w, h)
    p.setToast('透かし入り動画を保存しました')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ================= 読み出す =================

interface DetectProps {
  keys: WmKey[]; records: WmRecord[]; fingerprints: Record<string, string>
  busy: boolean; setBusy: (v: boolean) => void
  progress: string; setProgress: (v: string) => void
  setToast: (v: string) => void
}

function DetectTab(p: DetectProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [results, setResults] = useState<WmDetectKeyResult[] | null>(null)
  const [frames, setFrames] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const pick = (f: File | undefined) => {
    if (!f) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f); setPreviewUrl(URL.createObjectURL(f)); setResults(null)
  }

  const runDetect = async () => {
    if (!file || p.busy) return
    const tryKeys: { id: string | null; key: string }[] = p.keys.map((k) => ({ id: k.id, key: k.key }))
    if (manualKey.trim() && !tryKeys.some((k) => k.key === manualKey.trim())) {
      tryKeys.push({ id: null, key: manualKey.trim() })
    }
    if (tryKeys.length === 0) { p.setToast('鍵がありません。先に「埋め込む」で鍵を生成するか、鍵を入力してください'); return }
    p.setBusy(true)
    try {
      const acc = newAccumulator()
      let n = 1
      if (isVideoFile(file)) {
        const url = URL.createObjectURL(file)
        try {
          const video = document.createElement('video')
          video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url
          await new Promise<void>((res, rej) => { video.onloadeddata = () => res(); video.onerror = () => rej(new Error('動画を読み込めませんでした')) })
          n = await accumulateVideoFrames(acc, video, 60, (done, total) => p.setProgress(`フレームを解析中… ${done} / ${total}`))
        } finally { URL.revokeObjectURL(url) }
      } else {
        const bmp = await createImageBitmap(file)
        addFrameToAccumulator(acc, bmp, bmp.width, bmp.height)
      }
      setFrames(n)
      p.setProgress('鍵と照合中…')
      const targets = p.records.map((r) => ({ recordId: r.id, payload: r.payload, keyId: r.keyId }))
      const res = await detectWithKeys(acc, tryKeys, targets, (label) => p.setProgress(label))
      setResults(res)
    } catch (e) {
      p.setToast(e instanceof Error ? e.message : '解析に失敗しました')
    } finally {
      p.setProgress('')
      p.setBusy(false)
    }
  }

  const best = results ? results.reduce<WmDetectKeyResult | null>(
    (a, r) => (!a || r.pilotZ > a.pilotZ ? r : a), null) : null
  const keyLabel = (r: WmDetectKeyResult) =>
    r.keyId ? `鍵 ${p.fingerprints[r.keyId] ?? r.keyId.slice(0, 8)}` : '手入力の鍵'

  return (
    <div>
      <div className="settings-row" style={{ marginTop: 16 }}>
        <p className="label">調べるファイル（画像・動画）</p>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button className="btn-secondary wide" onClick={() => fileRef.current?.click()}>
          {file ? file.name : 'ファイルを選ぶ'}
        </button>
        {previewUrl && file && !isVideoFile(file) && <img src={previewUrl} alt="" style={{ width: '100%', borderRadius: 8, marginTop: 4 }} />}
        {previewUrl && file && isVideoFile(file) && <video src={previewUrl} controls style={{ width: '100%', borderRadius: 8, marginTop: 4 }} />}
        <p className="settings-hint">動画は全体から60フレームだけ抜き出して解析します（フレームは保持しません）。</p>
      </div>

      <div className="settings-row" style={{ marginTop: 16 }}>
        <p className="label">鍵（任意・手入力）</p>
        <input type="text" className="text-input" value={manualKey} autoComplete="off" spellCheck={false}
          placeholder="保存済みの鍵で足りる場合は空欄でOK" onChange={(e) => setManualKey(e.target.value)} />
        <p className="settings-hint">保存済みの鍵（{p.keys.length}件）は自動で全部試します。</p>
      </div>

      <button className="btn-primary wide" style={{ marginTop: 20 }} disabled={!file || p.busy} onClick={runDetect}>
        {p.busy ? '解析中…' : '読み出す'}
      </button>
      {p.progress && <p className="settings-hint" style={{ textAlign: 'center' }}>{p.progress}</p>}

      {results && best && (
        <div style={{ marginTop: 20 }}>
          {best.pilotZ > 6 || best.ledgerMatch ? (
            <div className="wm-verdict wm-ok">
              <b>透かしを検出しました</b>
              <span>{keyLabel(best)} で埋め込まれた透かしが入っています（解析フレーム数 {frames}）。</span>
            </div>
          ) : best.pilotZ >= 4 ? (
            <div className="wm-verdict wm-warn">
              <b>判定保留</b>
              <span>弱い反応があります。より高画質な素材か、切り抜かれていない全体像で試してください。</span>
            </div>
          ) : (
            <div className="wm-verdict wm-bad">
              <b>検出されませんでした</b>
              <span>試した鍵の透かしは見つかりませんでした（透かしが無い、鍵が違う、大きく切り抜かれている等の可能性があります）。</span>
            </div>
          )}

          {results.map((r, i) => {
            const parsed = r.decoded ? parseWmPayload(r.decoded.text) : null
            const record = r.ledgerMatch ? p.records.find((x) => x.id === r.ledgerMatch!.recordId) : null
            return (
              <div key={i} className="wm-result-card">
                <p><b>{keyLabel(r)}</b> ／ 検出スコア {r.pilotZ.toFixed(1)}（しきい値 6）</p>
                {r.decoded && (
                  <p>復元した文字列： <b>{r.decoded.text}</b>
                    {parsed && <><br />署名： {parsed.author} ／ 埋め込み時刻： {parsed.atText}</>}
                  </p>
                )}
                {r.ledgerMatch && (
                  <p>台帳と一致： {r.ledgerMatch.payload}
                    {record && <><br />記録： {fmtDateTime(record.at)} ／ {record.fileName}</>}
                  </p>
                )}
              </div>
            )
          })}
          <p className="settings-hint">
            スコアは「透かしが無い場合」を 0 とした標準偏差の倍数です。6を超えると偶然の一致はほぼあり得ません。
            切り抜き画像の照合にはまだ対応していません（全体が残っている画像・動画が対象です）。
          </p>
        </div>
      )}
    </div>
  )
}

// ================= 履歴 =================

function HistoryTab({ records, onDelete }: { records: WmRecord[]; onDelete: (id: string) => void }) {
  if (records.length === 0) {
    return <p className="settings-hint" style={{ marginTop: 16 }}>まだ記録がありません。「埋め込む」で保存すると、ここに台帳として残ります。</p>
  }
  return (
    <div style={{ marginTop: 8 }}>
      <p className="settings-hint">
        埋め込みの台帳です。他の設定と同じように端末間で同期されます。
        読み出しのとき、この台帳の記録とも自動で照合します（文字列が復元できないほど劣化したコピーでも、台帳があれば一致を判定できます）。
      </p>
      {records.map((r) => (
        <div key={r.id} className="wm-result-card">
          <p><b>{r.fileName}</b>（{r.kind === 'video' ? '動画' : '画像'} {r.width}×{r.height}）</p>
          <p>埋め込み： {fmtDateTime(r.at)}<br />
            文字列： {r.payload}<br />
            種類： {[r.invisible && '電子透かし', r.visible && '見える文字列'].filter(Boolean).join('＋')}<br />
            鍵： {r.keyFingerprint}<br />
            ファイル指紋： {r.sha256.slice(0, 16)}…</p>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => onDelete(r.id)}>この記録を削除</button>
        </div>
      ))}
    </div>
  )
}
