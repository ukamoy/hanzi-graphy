interface Props {
  onClear: () => void
  eraser: boolean
  toggleEraser: () => void
}

export default function Toolbar({
  onClear,
  eraser,
  toggleEraser
}: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        left: 20,
        display: 'flex',
        gap: 12,
        zIndex: 10
      }}
    >
      <button onClick={onClear}>清空</button>

      <button onClick={toggleEraser}>
        {eraser ? '画笔' : '橡皮'}
      </button>
    </div>
  )
}