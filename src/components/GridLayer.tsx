export default function GridLayer() {
  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none'
      }}
    >
      <rect
        x="10%"
        y="10%"
        width="80%"
        height="80%"
        stroke="#c44"
        strokeWidth="2"
        fill="none"
      />

      <line
        x1="10%"
        y1="50%"
        x2="90%"
        y2="50%"
        stroke="#c44"
        strokeDasharray="8 8"
      />

      <line
        x1="50%"
        y1="10%"
        x2="50%"
        y2="90%"
        stroke="#c44"
        strokeDasharray="8 8"
      />

      <line
        x1="10%"
        y1="10%"
        x2="90%"
        y2="90%"
        stroke="#c44"
        strokeDasharray="8 8"
      />

      <line
        x1="90%"
        y1="10%"
        x2="10%"
        y2="90%"
        stroke="#c44"
        strokeDasharray="8 8"
      />
    </svg>
  )
}