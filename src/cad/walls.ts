import { distance, roundPoint } from './geometry'
import type { Point } from './types'

/** Closed outline for one non-joined wall segment, in mm. */
export function wallOutline(start: Point, end: Point, thickness: number): Point[] {
  if (!Number.isFinite(thickness) || thickness <= 0 || thickness > 2000) throw new Error('牆厚需大於 0 且不超過 2000 mm')
  const length = distance(start, end)
  if (!Number.isFinite(length) || length < .001) throw new Error('牆的起點與終點必須不同')
  const nx = -(end.y - start.y) / length * thickness / 2
  const ny = (end.x - start.x) / length * thickness / 2
  const shift = (p: Point, sign: number) => roundPoint({ x:p.x + sign * nx, y:p.y + sign * ny })
  const corners = [shift(start,1),shift(end,1),shift(end,-1),shift(start,-1)]
  return [...corners,corners[0]]
}
