import { useState } from 'react'
import { getChars, charImgPath, CUSTOM_KEY_PREFIX } from '../characters'

interface Props {
  selected: string
  onSelect: (key: string) => void
  onSelectWithPos?: (key: string, pos: { x: number; y: number }) => void
  onDelete?: (key: string) => void
}

export function CharGrid({ selected, onSelect, onSelectWithPos, onDelete }: Props) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

  return (
    <div className="char-grid">
      {getChars().map(({ key, label }) => (
        <div key={key} className="char-option-wrap">
          <button
            className={`char-option${key === selected ? ' selected' : ''}`}
            onPointerDown={e => {
              onSelect(key)
              onSelectWithPos?.(key, { x: e.clientX, y: e.clientY })
            }}
          >
            <img src={charImgPath(key, 'normal')} alt={label} className="char-thumb" />
            <span className="char-name">{label}</span>
          </button>
          {onDelete && key.startsWith(CUSTOM_KEY_PREFIX) && (
            confirmKey === key ? (
              <div className="char-delete-confirm">
                <button onClick={() => { onDelete(key); setConfirmKey(null) }}>削除</button>
                <button onClick={() => setConfirmKey(null)}>戻る</button>
              </div>
            ) : (
              <button
                className="char-delete-btn"
                aria-label="削除"
                onClick={() => setConfirmKey(key)}
              >
                ×
              </button>
            )
          )}
        </div>
      ))}
    </div>
  )
}
