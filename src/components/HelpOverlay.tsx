import { useLayoutEffect, useState } from 'react'
import { storage } from '../utils/storage'

interface HelpStep {
  key: string
  title: string
  description: string
}

const STEPS: HelpStep[] = [
  { key: 'chara', title: 'キャラクター', description: 'タップするとハートが飛び出るよ！かわいがってね。' },
  { key: 'wiki-card', title: '今日の選択', description: '「書く」か「休む」かを選ぼう。スタンプが押されて今日の記録になるよ。' },
  { key: 'recommend-btn', title: 'おすすめ記事', description: '登録したnoteクリエイターの記事をランダムで提案してくれるよ。鉛筆アイコンでリストを編集できるよ。' },
  { key: 'tag-btn', title: 'お気に入りタグ', description: '登録したハッシュタグ一覧を開くよ。noteの記事一覧へすぐ飛べるよ。' },
  { key: 'chat-btn', title: 'AIに相談', description: 'AIと会話してネタ出しや構成の壁打ちができるよ。設定からGroq APIキーを登録してね。' },
  { key: 'settings-btn', title: '設定', description: '名前・キャラクター・AIキーなどをここで設定できるよ。' },
]

const PAD = 12
const TOOLTIP_W = 260
const TOOLTIP_H = 150

interface Props {
  onDone: () => void
}

export function HelpOverlay({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const vw = window.innerWidth
  const vh = window.innerHeight

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-help="${STEPS[step].key}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])

  const finish = () => {
    storage.saveHelpDone()
    onDone()
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else finish()
  }

  const current = STEPS[step]

  const rx = rect ? Math.max(0, rect.left - PAD) : 0
  const ry = rect ? Math.max(0, rect.top - PAD) : 0
  const rw = rect ? Math.min(vw - rx, rect.width + PAD * 2) : 0
  const rh = rect ? rect.height + PAD * 2 : 0

  const tooltipLeft = rect
    ? Math.max(16, Math.min(vw - TOOLTIP_W - 16, rect.left + rect.width / 2 - TOOLTIP_W / 2))
    : (vw - TOOLTIP_W) / 2
  const tooltipTop = rect
    ? (vh - (rect.bottom + PAD) >= TOOLTIP_H + 16
        ? rect.bottom + PAD + 8
        : Math.max(16, rect.top - PAD - 8 - TOOLTIP_H))
    : (vh - TOOLTIP_H) / 2

  return (
    <div className="help-overlay" onClick={handleNext}>
      <svg
        style={{ position: 'fixed', top: 0, left: 0, width: vw, height: vh, display: 'block', pointerEvents: 'none' }}
      >
        <defs>
          <mask id="help-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            {rect && <rect x={rx} y={ry} width={rw} height={rh} rx="10" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(0,0,0,0.65)" mask="url(#help-mask)" />
      </svg>

      <div
        className="help-tooltip"
        style={{ left: tooltipLeft, top: tooltipTop, width: TOOLTIP_W }}
        onClick={e => e.stopPropagation()}
      >
        <p className="help-step-count">{step + 1} / {STEPS.length}</p>
        <p className="help-tooltip-title">{current.title}</p>
        <p className="help-tooltip-desc">{current.description}</p>
        <button className="help-next-btn" onClick={handleNext}>
          {step < STEPS.length - 1 ? '次へ →' : '完了'}
        </button>
      </div>

      <button className="help-skip-btn" onClick={e => { e.stopPropagation(); finish() }}>
        スキップ
      </button>
    </div>
  )
}
