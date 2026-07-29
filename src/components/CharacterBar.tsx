import type { PracticeRecord } from '../engine/storage'

interface Props {
  list: string[]
  active: string
  records?: Array<PracticeRecord | null>
  onSelect: (char: string) => void
}

export default function CharacterBar({
  list,
  active,
  records = [],
  onSelect
}: Props) {
  const candidates = list

  return (
    <div style={{
      width: '100%',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 64px))',
      gridAutoRows: 56,
      gap: 8,
      alignContent: 'start',
      justifyContent: 'start',
      touchAction: 'pan-y'
    }}>
      {candidates.map((char, index) => {
        const isActive = char === active
        const record = records[index]
        const score = record?.score
        const isCompleted = record?.quiz?.completed

        return (
          <button
            key={`${char}-${index}`}
            onClick={() => onSelect(char)}
            style={{
              width: '100%',
              minWidth: 56,
              height: 56,
              fontSize: 22,
              borderRadius: 8,
              background: isActive ? '#287a55' : '#f2f2f2',
              color: isActive ? '#fff' : '#222',
              border: isActive
                ? '2px solid #1d5d41'
                : '1px solid #ccc',
              fontWeight: 600,
              padding: 0,
              display: 'grid',
              gridTemplateRows: '1fr 16px',
              placeItems: 'center',
              lineHeight: 1
            }}
          >
            <span>{char}</span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: isActive ? '#eef8ef' : isCompleted ? '#287a55' : '#756d61'
            }}>
              {typeof score === 'number' ? `${score}分` : isCompleted ? '完成' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
