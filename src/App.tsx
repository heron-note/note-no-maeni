import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { TemplateEditor } from './screens/TemplateEditor'
import { SplashScreen } from './components/SplashScreen'
import { speakVoicevox } from './utils/voicevox'
import type { ScreenName } from './types'
import type { JSX } from 'react'

const SCREENS: Record<ScreenName, JSX.Element> = {
  'onboarding':      <Onboarding />,
  'home':            <Home />,
  'settings':        <Settings />,
  'template-editor': <TemplateEditor />,
}

export function App() {
  const screen = useAppStore(s => s.screen)
  const init = useAppStore(s => s.init)
  const [splash, setSplash] = useState(true)

  useEffect(() => { init() }, [init])
  const onSplashDone = useCallback(() => {
    setSplash(false)
    const state = useAppStore.getState()
    const user = state.user
    const todayLog = state.todayLog()
    if (!user?.onboarded) {
      speakVoicevox('vv_hajimemashite')
    } else if (!todayLog) {
      speakVoicevox('vv_okaeri')
    } else if (todayLog.type === 'write') {
      speakVoicevox('vv_yasumu')
    } else {
      speakVoicevox('vv_kaite')
    }
  }, [])

  if (splash) return <SplashScreen onDone={onSplashDone} />

  return (
    <div id="app" key={screen}>
      {SCREENS[screen]}
    </div>
  )
}
