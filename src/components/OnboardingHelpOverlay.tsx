import { useEffect, useLayoutEffect, useState } from 'react'

interface HelpStep {
  key: string
  title: string
  description: string
  above?: boolean
}

const STEPS: HelpStep[] = [
  {
    key: 'ob-name',
    title: 'お名前を入力',
    description: 'あなたの名前を入力してね。アプリ内で「○○さん」と呼ばれるよ。あとから設定でいつでも変えられるよ。',
  },
  {
    key: 'ob-char',
    title: '相棒を選ぶ',
    description: '好きなキャラクターをタップして選んでね。自分で作った画像や、AIで生成した画像も登録できるよ。下のボタンからキャラクタークリエイトへ進んでみよう！',
  },
  {
    key: 'ob-simple-creator',
    title: '相棒クリエイト',
    description: '自分で用意した画像を使いたい時はここ。通常・書く・休むの3パターンの画像を登録できるよ。',
  },
  {
    key: 'ob-ai-creator',
    title: 'AI相棒クリエイト',
    description: 'AIに相棒を生成してもらいたい時はここ。プロンプトを入力して自分だけのオリジナル相棒を作れるよ。',
  },
  {
    key: 'ob-start',
    title: 'はじめる',
    description: '名前と相棒が決まったら「はじめる」を押してスタート！設定はあとからいつでも変えられるから、気軽に始めてね。',
    above: true,
  },
  {
    key: 'ob-import',
    title: '引越しデータをインポート',
    description: '以前このアプリを使っていたデータがある場合は、ここからインポートできるよ。エクスポートしたJSONファイルを選んでね。',
    above: true,
  },
]

const PAD = 12
const TOOLTIP_W = 260
const TOOLTIP_H = 150

interface Props {
  onDone: () => void
}

export function OnboardingHelpOverlay({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 起動時: まず最下部までスクロールして全体を見せ、その後ステップ1へ
  useEffect(() => {
    const scroller = document.querySelector('.screen-scroll')
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
    }
    const t = setTimeout(() => setReady(true), 700)
    return () => clearTimeout(t)
  }, [])

  useLayoutEffect(() => {
    if (!ready) return
    const el = document.querySelector(`[data-help="${STEPS[step].key}"]`)
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      setTimeout(() => {
        setRect(el.getBoundingClientRect())
      }, 120)
    } else {
      setRect(null)
    }
  }, [step, ready])

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else onDone()
  }

  const current = STEPS[step]

  const rx = rect ? Math.max(0, rect.left - PAD) : 0
  const ry = rect ? Math.max(0, rect.top - PAD) : 0
  const rw = rect ? Math.min(vw - rx, rect.width + PAD * 2) : 0
  const rh = rect ? rect.height + PAD * 2 : 0

  const tooltipLeft = rect
    ? Math.max(16, Math.min(vw - TOOLTIP_W - 16, rect.left + rect.width / 2 - TOOLTIP_W / 2))
    : (vw - TOOLTIP_W) / 2
  const placeAbove = rect ? (current.above || vh - (rect.bottom + PAD) < TOOLTIP_H + 16) : false
  const tooltipStyle: React.CSSProperties = {
    left: tooltipLeft,
    width: TOOLTIP_W,
    ...(placeAbove && rect
      ? { bottom: vh - ry + 16 }
      : { top: rect ? rect.bottom + PAD + 8 : (vh - TOOLTIP_H) / 2 }),
  }

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
        style={tooltipStyle}
        onClick={e => e.stopPropagation()}
      >
        <p className="help-step-count">{step + 1} / {STEPS.length}</p>
        <p className="help-tooltip-title">{current.title}</p>
        <p className="help-tooltip-desc">{current.description}</p>
        <button className="help-next-btn" onClick={handleNext}>
          {step < STEPS.length - 1 ? '次へ →' : '完了'}
        </button>
      </div>

      <button className="help-skip-btn" onClick={e => { e.stopPropagation(); onDone() }}>
        スキップ
      </button>
    </div>
  )
}
