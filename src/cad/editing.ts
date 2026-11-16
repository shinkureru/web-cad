import { roundPoint } from './geometry'
import type { CadEntity, Point } from './types'

export function translateEntity(entity: CadEntity, offset: Point): CadEntity {
  const move = (p: Point): Point => roundPoint({ x: p.x + offset.x, y: p.y + offset.y })
  switch (entity.kind) {
    case 'line': case 'rectangle': return { ...entity, start: move(entity.start), end: move(entity.end) }
    case 'polyline': return { ...entity, points: entity.points.map(move) }
    case 'circle': return { ...entity, center: move(entity.center) }
  }
}
/** Positive angles are counter-clockwise. A rotated rectangle becomes a closed polyline. */
export function rotateEntity(entity: CadEntity, pivot: Point, degrees: number): CadEntity {
  const radians = degrees * Math.PI / 180
  const sin = Math.sin(radians), cos = Math.cos(radians)
  const spin = (p: Point): Point => roundPoint({
    x: pivot.x + (p.x - pivot.x) * cos - (p.y - pivot.y) * sin,
    y: pivot.y + (p.x - pivot.x) * sin + (p.y - pivot.y) * cos,
  })
  switch (entity.kind) {
    case 'line': return { ...entity, start: spin(entity.start), end: spin(entity.end) }
    case 'rectangle': {
      const { start: a, end: b, ...rest } = entity
      return { ...rest, kind: 'polyline', points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a].map(spin) }
    }
    case 'polyline': return { ...entity, points: entity.points.map(spin) }
    case 'circle': return { ...entity, center: spin(entity.center) }
  }
}
