import { CHARS, charImgPath } from '../characters'

interface Props {
  selected: string
  onSelect: (key: string) => void
}

export function CharGrid({ selected, onSelect }: Props) {
  return (
    <div className="char-grid">
      {CHARS.map(({ key, label }) => (
        <button
          key={key}
          className={`char-option${key === selected ? ' selected' : ''}`}
          onClick={() => onSelect(key)}
        >
          <img src={charImgPath(key, 'normal')} alt={label} className="char-thumb" />
          <span className="char-name">{label}</span>
        </button>
      ))}
    </div>
  )
}
