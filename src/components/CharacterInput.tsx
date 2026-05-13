interface Props {
  value: string
  onChange: (v: string) => void
}

export default function CharacterInput({
  value,
  onChange
}: Props) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="请输入内容，生成时只保留汉字"
      style={{
        width: 'min(320px, 48vw)',
        height: 44,
        fontSize: 20,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #ccc'
      }}
    />
  )
}
