import { useEffect, useRef } from 'react'

interface Props {
  message: string | null
  onDone: () => void
}

export function Toast({ message, onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!message) return
    const el = ref.current
    if (!el) return
    el.classList.add('show')
    const id = setTimeout(() => {
      el.classList.remove('show')
      setTimeout(onDone, 300)
    }, 2200)
    return () => clearTimeout(id)
  }, [message, onDone])

  if (!message) return null
  return <div ref={ref} className="toast">{message}</div>
}
