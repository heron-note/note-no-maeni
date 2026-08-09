import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { TemplateEditor } from './screens/TemplateEditor'
import { CharacterCreator } from './screens/CharacterCreator'
import { SimpleCharacterCreator } from './screens/SimpleCharacterCreator'
import { SplashScreen } from './components/SplashScreen'
import { preloadVoicevox } from './utils/voicevox'
import type { VoicevoxKey } from './utils/voicevox'
import { storage } from './utils/storage'
import { prefetchWikiHint } from './utils/wikipedia'
import { prefetchContentConfig } from './data/declarations'
import type { ScreenName } from './types'
import type { JSX } from 'react'

const SCREENS: Record<ScreenName, JSX.Element> = {
  'onboarding':        <Onboarding />,
  'home':              <Home />,
  'settings':          <Settings />,
  'template-editor':   <TemplateEditor />,
  'character-creator':        <CharacterCreator />,
  'character-creator-simple': <SimpleCharacterCreator />,
}

export function App() {
  const screen = useAppStore(s => s.screen)
  const init = useAppStore(s => s.init)
  const [splash, setSplash] = useState(true)
  const preloadedAudio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    prefetchWikiHint()
    prefetchContentConfig()
    init()
    const state = useAppStore.getState()
    const user = state.user
    const todayLog = state.todayLog()
    if (user?.onboarded && storage.loadSoundEnabled()) {
      let key: VoicevoxKey
      if (!todayLog) key = 'vv_okaeri'
      else if (todayLog.type === 'write') key = 'vv_yasumu'
      else key = 'vv_kaite'
      preloadedAudio.current = preloadVoicevox(key)
    }
  }, [init])

  const onSplashDone = useCallback(() => {
    setSplash(false)
    const audio = preloadedAudio.current
    if (!audio) return
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaElementSource(audio)
      const gain = ctx.createGain()
      gain.gain.value = 2.0
      source.connect(gain)
      gain.connect(ctx.destination)
      ctx.resume().then(() => audio.play().catch(() => ctx.close()))
      audio.onended = () => ctx.close()
    } catch {
      audio.play().catch(() => {})
    }
  }, [])

  if (splash) return <SplashScreen onDone={onSplashDone} />

  return (
    <div id="app" key={screen}>
      {SCREENS[screen]}
    </div>
  )
}
