interface Props {
  onClear: () => void
}

export default function Toolbar({
  onClear
}: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 20
      }}
    >
      <button onClick={onClear}>
        清空
      </button>
    </div>
  )
}