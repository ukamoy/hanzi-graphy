import { useEffect, useRef, useState } from 'react'
import GridLayer from './GridLayer'
import Toolbar from './Toolbar'
import { buildStroke, getSvgPathFromStroke } from '../engine/stroke'
import type { Point } from '../engine/types'

interface StrokeItem {
  path: string
  erase?: boolean
}

export default function PracticeCanvas() {
  const svgRef = useRef<SVGSVGElement>(null)

  const pointsRef = useRef<Point[]>([])
  const drawingRef = useRef(false)

  const [strokes, setStrokes] = useState<StrokeItem[]>([])
  const [previewPath, setPreviewPath] = useState('')
  const [eraser, setEraser] = useState(false)

  useEffect(() => {
    const svg = svgRef.current

    if (!svg) return

    const getPoint = (e: PointerEvent): Point => {
      const rect = svg.getBoundingClientRect()

      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure || 0.5
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault()

      drawingRef.current = true

      pointsRef.current = [getPoint(e)]
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!drawingRef.current) return

      e.preventDefault()

      pointsRef.current.push(getPoint(e))

      const stroke = buildStroke(pointsRef.current)

      const path = getSvgPathFromStroke(
        stroke as number[][]
      )

      setPreviewPath(path)
    }

    const handlePointerUp = () => {
      if (!drawingRef.current) return

      drawingRef.current = false

      if (pointsRef.current.length < 2) return

      const stroke = buildStroke(pointsRef.current)

      const path = getSvgPathFromStroke(
        stroke as number[][]
      )

      setStrokes((prev) => [
        ...prev,
        {
          path,
          erase: eraser
        }
      ])

      setPreviewPath('')

      pointsRef.current = []
    }

    svg.addEventListener(
      'pointerdown',
      handlePointerDown
    )

    svg.addEventListener(
      'pointermove',
      handlePointerMove
    )

    window.addEventListener(
      'pointerup',
      handlePointerUp
    )

    return () => {
      svg.removeEventListener(
        'pointerdown',
        handlePointerDown
      )

      svg.removeEventListener(
        'pointermove',
        handlePointerMove
      )

      window.removeEventListener(
        'pointerup',
        handlePointerUp
      )
    }
  }, [eraser])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none'
      }}
    >
      <Toolbar
        onClear={() => setStrokes([])}
        eraser={eraser}
        toggleEraser={() => setEraser((v) => !v)}
      />

      <GridLayer />

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none'
        }}
      >
        {strokes.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill={s.erase ? '#f5ecd7' : '#111'}
          />
        ))}

        {previewPath && (
          <path
            d={previewPath}
            fill={eraser ? '#f5ecd7' : '#111'}
          />
        )}
      </svg>
    </div>
  )
}