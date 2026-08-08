import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { TemplateEditor } from './screens/TemplateEditor'
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

  useEffect(() => { init() }, [init])

  return (
    <div id="app" key={screen}>
      {SCREENS[screen]}
    </div>
  )
}
