interface Props {
  list: string[]
  active: string
  onSelect: (char: string) => void
}

export default function CharacterBar({
  list,
  active,
  onSelect
}: Props) {
  const candidates = list.slice(0, 20)

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
              padding: 0
            }}
          >
            {char}
          </button>
        )
      })}
    </div>
  )
}
