import { getChars, charImgPath } from '../characters'

interface Props {
  selected: string
  onSelect: (key: string) => void
  onSelectWithPos?: (key: string, pos: { x: number; y: number }) => void
}

export function CharGrid({ selected, onSelect, onSelectWithPos }: Props) {
  return (
    <div className="char-grid">
      {getChars().map(({ key, label }) => (
        <button
          key={key}
          className={`char-option${key === selected ? ' selected' : ''}`}
          onPointerDown={e => {
            onSelect(key)
            onSelectWithPos?.(key, { x: e.clientX, y: e.clientY })
          }}
        >
          <img src={charImgPath(key, 'normal')} alt={label} className="char-thumb" />
          <span className="char-name">{label}</span>
        </button>
      ))}
    </div>
  )
}
