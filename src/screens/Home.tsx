import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { Calendar } from '../components/Calendar'
import { StampOverlay } from '../components/StampOverlay'
import { WriteOverlay } from '../components/WriteOverlay'
import { BookmarkEditor } from '../components/BookmarkEditor'
import { RecommendOverlay } from '../components/RecommendOverlay'
import { pickDeclaration, pickWriteReaction } from '../data/declarations'
import { storage, todayStr } from '../utils/storage'
import { selectRecommend, recordRecommend } from '../utils/recommend'
import { speakVoicevox } from '../utils/voicevox'
import type { ChoiceType, Declaration, Bookmark } from '../types'

export function Home() {
  const user = useAppStore(s => s.user)
  const logs = useAppStore(s => s.logs)
  const goTo = useAppStore(s => s.goTo)
  const goHome = useAppStore(s => s.goHome)
  const logToday = useAppStore(s => s.logToday)

  const [stampDeclaration, setStampDeclaration] = useState<Declaration | null>(null)
  const [writeReaction, setWriteReaction] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(() => storage.loadSoundEnabled())
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => storage.loadBookmarks())
  const [showEditor, setShowEditor] = useState(false)
  const [recommended, setRecommended] = useState<Bookmark | null>(null)

  const isFirstVisit = Object.keys(logs).length === 0

  useEffect(() => {
    speakVoicevox(isFirstVisit ? 'vv_hajimemashite' : 'vv_okaeri')
  }, [])

  const toggleSound = () => {
    const next = !soundOn
    storage.saveSoundEnabled(next)
    setSoundOn(next)
  }

  const handleBookmarksChange = (next: Bookmark[]) => {
    storage.saveBookmarks(next)
    setBookmarks(next)
  }

  const handleRecommend = () => {
    const picked = selectRecommend(bookmarks)
    if (!picked) return
    const next = recordRecommend(bookmarks, picked.id)
    storage.saveBookmarks(next)
    setBookmarks(next)
    setRecommended(picked)
  }

  const ch = user?.character ?? 'kuma'
  const name = user?.name ?? ''
  const charState = useAppStore(s => s.logs[todayStr()]?.type ?? 'normal')

  const handleChoice = (type: ChoiceType) => {
    if (type === 'write') {
      logToday('write')
      setWriteReaction(pickWriteReaction(name))
    } else {
      const decl = pickDeclaration()
      logToday('rest', decl.id)
      setStampDeclaration(decl)
    }
  }

  return (
    <div className="screen-inner">
      <div className="top-bar">
        <button className="icon-btn sound-btn" onClick={toggleSound} aria-label={soundOn ? '音声オフ' : '音声オン'}>
          {soundOn ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
        <button className="icon-btn" onClick={() => goTo('settings')}>⚙</button>
      </div>
      <div className="chara-block">
        <img className="chara-img" src={charImgPath(ch, charState)} alt="相棒" />
      </div>
      <div className="greeting-block">
        <p className="greeting">{isFirstVisit ? 'はじめまして' : 'おかえり'}、{name}さん。</p>
        <p className="greeting-sub">今日のnote、どうする？</p>
      </div>
      <div className="choice-block">
        <button className="choice-btn write" onClick={() => handleChoice('write')}>
          <span className="choice-icon">🟨</span>
          <span className="choice-main">書く</span>
          <span className="choice-sub">1行でも書く</span>
        </button>
        <button className="choice-btn rest" onClick={() => handleChoice('rest')}>
          <span className="choice-icon">🟦</span>
          <span className="choice-main">休む</span>
          <span className="choice-sub">書くプレッシャーをリセット</span>
        </button>
      </div>
      <div className="recommend-bar">
        <button
          className="btn-recommend"
          onClick={handleRecommend}
          disabled={bookmarks.length === 0}
        >
          おすすめ
        </button>
        <button className="btn-recommend-edit" onClick={() => setShowEditor(true)}>
          おすすめ編集
        </button>
      </div>

      <button className="template-shortcut-btn" onClick={() => goTo('template-editor')}>
        ✏️ 休もっ化計画テンプレートを編集
      </button>
      <Calendar logs={logs} />

      {stampDeclaration && (
        <StampOverlay
          declaration={stampDeclaration}
          onClose={() => { setStampDeclaration(null); goHome() }}
        />
      )}
      {writeReaction && (
        <WriteOverlay
          reactionText={writeReaction}
          onClose={() => { setWriteReaction(null); goHome() }}
        />
      )}
      {showEditor && (
        <BookmarkEditor
          bookmarks={bookmarks}
          onChange={handleBookmarksChange}
          onClose={() => setShowEditor(false)}
        />
      )}
      {recommended && (
        <RecommendOverlay
          bookmark={recommended}
          allNames={bookmarks.map(b => b.name)}
          onOpen={() => { window.open(recommended.url, '_blank', 'noopener,noreferrer'); setRecommended(null) }}
          onClose={() => setRecommended(null)}
        />
      )}
    </div>
  )
}
