export default function GridLayer() {
  return (
    <svg
      width="300"
      height="300"
      style={{ position: 'absolute', inset: 0 }}
    >
      <rect x="0" y="0" width="300" height="300" fill="none" stroke="#ccc" />

      <line x1="150" y1="0" x2="150" y2="300" stroke="#ddd" />
      <line x1="0" y1="150" x2="300" y2="150" stroke="#ddd" />

      <line x1="0" y1="0" x2="300" y2="300" stroke="#eee" />
      <line x1="300" y1="0" x2="0" y2="300" stroke="#eee" />
    </svg>
  )
}