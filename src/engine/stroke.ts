import getStroke from 'perfect-freehand'
import type { Point } from './types'
import { BRUSH_CONFIG } from './brush'

export function getSvgPathFromStroke(points: number[][]) {
  if (!points.length) return ''

  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]

      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)

      return acc
    },
    ['M', ...points[0], 'Q'] as (string | number)[]
  )

  d.push('Z')

  return d.join(' ')
}

export function buildStroke(points: Point[]) {
  return getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    {
      ...BRUSH_CONFIG,
      easing: (t) => t
    }
  )
}