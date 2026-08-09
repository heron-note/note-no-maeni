import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { charImgPath } from '../characters'
import { Calendar } from '../components/Calendar'
import { StampOverlay } from '../components/StampOverlay'
import { WriteOverlay } from '../components/WriteOverlay'
import { BookmarkEditor } from '../components/BookmarkEditor'
import { RecommendOverlay } from '../components/RecommendOverlay'
import { TagEditor } from '../components/TagEditor'
import { ChatOverlay } from '../components/ChatOverlay'
import { HelpOverlay } from '../components/HelpOverlay'
import { WikiHintCard } from '../components/WikiHintCard'
import { pickDeclaration, pickWriteReaction } from '../data/declarations'
import { storage, todayStr } from '../utils/storage'
import { selectRecommend, recordRecommend } from '../utils/recommend'
import type { ChoiceType, Declaration, Bookmark, NoteTag } from '../types'

export function Home() {
  const user = useAppStore(s => s.user)
  const logs = useAppStore(s => s.logs)
  const goTo = useAppStore(s => s.goTo)
  const goHome = useAppStore(s => s.goHome)
  const logToday = useAppStore(s => s.logToday)

  type HeartBurst = { id: number; x: number; y: number; particles: { dx: number; dy: number }[] }
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([])

  const triggerBurst = (x: number, y: number) => {
    setHeartBursts(prev => {
      if (prev.length > 0) return prev
      const particles = Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2
        const dist = 48 + Math.random() * 32
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist }
      })
      const id = Date.now()
      setTimeout(() => setHeartBursts([]), 750)
      return [{ id, x, y, particles }]
    })
  }

  const handleCharaTap = (e: React.PointerEvent) => {
    e.preventDefault()
    triggerBurst(e.clientX, e.clientY)
  }

  const [stampDeclaration, setStampDeclaration] = useState<Declaration | null>(null)
  const [writeReaction, setWriteReaction] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(() => storage.loadSoundEnabled())
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => storage.loadBookmarks())
  const [tags, setTags] = useState<NoteTag[]>(() => storage.loadTags())
  const [showEditor, setShowEditor] = useState(false)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [recommended, setRecommended] = useState<Bookmark | null>(null)
  const [showChat, setShowChat] = useState(false)

  const [isFirstVisit] = useState(() => storage.loadLastLogin() === null)
  const [showHelp, setShowHelp] = useState(() => !storage.loadHelpDone())

  useEffect(() => {
    storage.saveLastLogin(todayStr())
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

  const handleTagsChange = (next: NoteTag[]) => {
    storage.saveTags(next)
    setTags(next)
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

  const handleChoice = async (type: ChoiceType) => {
    if (type === 'write') {
      logToday('write')
      setWriteReaction(await pickWriteReaction(name))
    } else {
      const decl = await pickDeclaration()
      logToday('rest', decl.id)
      setStampDeclaration(decl)
    }
  }

  return (
    <div className="screen-inner">
      <div className="top-bar">
        <button data-help="sound-btn" className="icon-btn sound-btn" onClick={toggleSound} aria-label={soundOn ? '音声オフ' : '音声オン'}>
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
        <div className="top-bar-right">
          <button data-help="help-btn" className="icon-btn" onClick={() => setShowHelp(true)} aria-label="ヘルプ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
          <button data-help="settings-btn" className="icon-btn" onClick={() => goTo('settings')} aria-label="設定">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="chara-bubble-row">
        {/* 左: 吹き出しパネル */}
        <div className="bubble-panel">
          {/* 上: おすすめ */}
          <div className="speech-bubble">
            <div className="bubble-action-row">
              <button data-help="recommend-btn" className="bubble-icon-btn" onClick={handleRecommend} disabled={bookmarks.length === 0} aria-label="おすすめ">
                {/* music note */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/>
                  <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </button>
              <button className="bubble-icon-btn bubble-icon-sub" onClick={() => setShowEditor(true)} aria-label="おすすめ編集">
                {/* pencil */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* 下: タグ */}
          <div className="speech-bubble">
            <div className="bubble-action-row">
              <button data-help="tag-btn" className="bubble-icon-btn" onClick={() => setShowTagEditor(true)} aria-label="タグ編集">
                {/* hashtag */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
                  <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
                </svg>
              </button>
              <span className="bubble-icon-placeholder" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* 中央: キャラクター */}
        <div className="chara-block">
          <img
            data-help="chara"
            className="chara-img"
            src={charImgPath(ch, charState)}
            alt="相棒"
            onPointerDown={handleCharaTap}
            style={{ cursor: 'pointer' }}
          />
        </div>

      </div>

      <div className="heart-burst-wrap">
        {heartBursts.flatMap(({ id, x, y, particles }) =>
          particles.map(({ dx, dy }, i) => (
            <span
              key={`${id}-${i}`}
              className="heart-particle"
              style={{ left: x, top: y, '--dx': `${dx}px`, '--dy': `${dy}px` } as React.CSSProperties}
            >
              ❤️
            </span>
          ))
        )}
      </div>

      <div className="greeting-block">
        <p className="greeting">{isFirstVisit ? 'はじめまして' : 'おかえり'}、{name}さん。</p>
        <p className="greeting-sub">今日のnote、どうする？</p>
      </div>

      <WikiHintCard
        onWrite={() => handleChoice('write')}
        onRest={() => handleChoice('rest')}
        onEditTemplate={() => goTo('template-editor')}
        onChat={() => setShowChat(true)}
      />

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
      {showTagEditor && (
        <TagEditor
          tags={tags}
          onChange={handleTagsChange}
          onClose={() => setShowTagEditor(false)}
        />
      )}
      {showChat && (
        <ChatOverlay
          userName={name}
          onClose={() => setShowChat(false)}
        />
      )}
      {showHelp && (
        <HelpOverlay onDone={() => setShowHelp(false)} />
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
