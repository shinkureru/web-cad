import { roundPoint } from './geometry'
import { normalizeAngle } from './arcs'
import type { CadEntity, Point } from './types'

export function translateEntity(entity: CadEntity, offset: Point): CadEntity {
  const move = (p: Point): Point => roundPoint({ x: p.x + offset.x, y: p.y + offset.y })
  switch (entity.kind) {
    case 'line': case 'rectangle': return { ...entity, start: move(entity.start), end: move(entity.end) }
    case 'polyline': return { ...entity, points: entity.points.map(move) }
    case 'circle': case 'arc': return { ...entity, center: move(entity.center) }
    case 'insert': return { ...entity, position: move(entity.position) }
    case 'text': return { ...entity, position: move(entity.position) }
    case 'dimension': return { ...entity, start: move(entity.start), end: move(entity.end), placement: move(entity.placement) }
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
    case 'arc': return { ...entity, center: spin(entity.center),
      startAngle: normalizeAngle(entity.startAngle + degrees),
      endAngle: normalizeAngle(entity.endAngle + degrees) }
    case 'insert': return { ...entity, position: spin(entity.position), rotation: entity.rotation + degrees }
    case 'text': return { ...entity, position: spin(entity.position), rotation: entity.rotation + degrees }
    case 'dimension': {
      // A linear horizontal/vertical dimension cannot remain axis-aligned after arbitrary rotation.
      // Convert rotated non-quarter-turn dimensions into aligned dimensions.
      const turn = ((degrees % 360) + 360) % 360
      const quarterTurn = Math.abs(turn / 90 - Math.round(turn / 90)) < 1e-9
      const swap = Math.round(turn / 90) % 2 !== 0
      return { ...entity, start: spin(entity.start), end: spin(entity.end), placement: spin(entity.placement),
        mode: entity.mode === 'linear' && !quarterTurn ? 'aligned' : entity.mode,
        axis: entity.mode === 'linear' && quarterTurn && swap
          ? (entity.axis === 'horizontal' ? 'vertical' : 'horizontal') : entity.axis }
    }
  }
}
