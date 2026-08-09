import { useLayoutEffect, useState } from 'react'
import { storage } from '../utils/storage'

interface HelpStep {
  key: string
  title: string
  description: string
  above?: boolean
}

const STEPS: HelpStep[] = [
  { key: 'chara', title: 'キャラクター', description: 'タップするとハートが飛び出るよ！毎日会いにきてね。' },
  { key: 'wiki-hint', title: '今日の豆知識', description: 'Wikipediaからランダムに表示されるよ。気になるキーワードをヒントに、今日書くネタを考えてみよう。↻で更新、「全文を読む」で詳しい内容も確認できるよ。', above: true },
  { key: 'wiki-choice', title: '今日の選択', description: '「書く」か「休む」かを選ぼう。選ぶとスタンプが押されて今日の記録になるよ。', above: true },
  { key: 'chat-btn', title: 'AIに相談', description: 'AIと会話してネタ出しや構成の壁打ちができるよ。設定からGroq APIキーを登録してね。', above: true },
  { key: 'template-btn', title: 'テンプレートを編集', description: 'noteの記事テンプレートを保存できるよ。「休む」を選んで「コピーしてnoteへ」を押すと、テンプレートの好きな位置に休もっ化計画の宣言とランダムな一言が自動で挿入された文章がコピーされるよ。あとはnoteに貼り付けるだけで記事が完成！無理なくフォロワーさんにお休みを伝えながら、連続投稿を続けられるよ。', above: true },
  { key: 'recommend-btn', title: 'おすすめ記事', description: '登録したnoteクリエイターの記事をランダムで提案してくれるよ。鉛筆アイコンでリストを編集できるよ。' },
  { key: 'tag-btn', title: 'お気に入りタグ', description: '登録したハッシュタグ一覧を開くよ。noteの記事一覧へすぐ飛べるよ。' },
  { key: 'settings-btn', title: '設定', description: '名前・キャラクター・AIキーなどをここで設定できるよ。' },
  { key: 'sound-btn', title: '音のON/OFF', description: 'タップすると効果音をON/OFFできるよ。静かな場所でも安心。' },
  { key: 'help-btn', title: 'ヘルプ', description: 'このボタンでいつでもヘルプを見直せるよ。わからなくなったらここから！以上でヘルプ終了だよ、楽しんでね！' },
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

      <button className="help-skip-btn" onClick={e => { e.stopPropagation(); finish() }}>
        スキップ
      </button>
    </div>
  )
}
