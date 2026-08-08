import type { Declaration } from '../types'

export const REST_DECLARATIONS: Declaration[] = [
  { id: 'rest_01', text: '今日は、書かない。' },
  { id: 'rest_02', text: '本日のnote活動、終了！' },
  { id: 'rest_03', text: '「今日は休もう」と僕が決めたから、本日限定「休もっ記念日」。' },
  { id: 'rest_04', text: '「投稿しなきゃ」という邪智暴虐のプレッシャーと戦うと決意した。……しかし、疲れていたので今日は寝る。' },
  { id: 'rest_05', text: '吾輩はnoterである。原稿はまだない。' },
  { id: 'rest_06', text: '締め切りにも負けず、閲覧数にも負けぬ丈夫な体を持ちたいけれど、今日は普通に休む。' },
  { id: 'rest_07', text: 'そうだ、今日note休もう。' },
  { id: 'rest_08', text: '実に面白い。今日書かなくても、明日の世界は何一つ変わらない。' },
  { id: 'rest_09', text: '逃げちゃダメだ、逃げちゃダメだ……いや、今日は逃げていいと思う。' },
  { id: 'rest_10', text: '「私は自分が今日書けないということを知っている」——無知の知、ならぬ無執の知。' },
  { id: 'rest_11', text: 'これでいいのだ。書かなくても、これでいいのだ。' },
]

export const STAMP_COLORS = [
  '#6B8A52', // ブライトオリーブ
  '#4E7AB8', // ブライトブルー
  '#C86E38', // ブライトテラコッタ
  '#3E8E8E', // ブライトティール
  '#7A62A8', // ブライトパープル
  '#7A7A7A', // ブライトチャコール
]

export const WRITE_REACTIONS = {
  normal: [
    '{name}、書こうとしてる。それだけでもう十分偉い。',
    '1行でいい。書き出したら、続くもんだよ。',
    '{name}の言葉を待ってる人が、きっといる。',
    'うまく書けなくていい。今日の{name}の言葉を。',
    '書くって、自分の中を整理することでもあるよね。',
  ],
  rare: [
    '今日の{name}にしか書けないことがある。',
    '完璧じゃなくていい。今日の正直な気持ちを。',
    '書けない日があっても、書いた日は絶対残る。応援してる！',
  ],
  superRare: [
    'まじか、書くのか！やるじゃん{name}！！',
  ],
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function pickDeclaration(): Declaration {
  return pickRandom(REST_DECLARATIONS)
}

export function pickStampColor(): string {
  return pickRandom(STAMP_COLORS)
}

export function pickWriteReaction(name: string): string {
  const p = Math.random()
  const pool =
    p < 0.05 ? WRITE_REACTIONS.superRare :
    p < 0.20 ? WRITE_REACTIONS.rare :
               WRITE_REACTIONS.normal
  return pickRandom(pool).replace(/{name}/g, name || 'きみ')
}
