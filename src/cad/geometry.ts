import type { Camera, CadEntity, Point, Snap } from './types'

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)
export const roundPoint = (p: Point): Point => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })

export function toScreen(p: Point, camera: Camera, width: number, height: number): Point {
  return { x: width / 2 + (p.x - camera.x) * camera.scale, y: height / 2 - (p.y - camera.y) * camera.scale }
}
export function toWorld(p: Point, camera: Camera, width: number, height: number): Point {
  return { x: camera.x + (p.x - width / 2) / camera.scale, y: camera.y - (p.y - height / 2) / camera.scale }
}

export function zoomAt(camera: Camera, factor: number, pointer: Point, width: number, height: number): Camera {
  const before = toWorld(pointer, camera, width, height)
  const scale = Math.max(0.004, Math.min(40, camera.scale * factor))
  return { scale, x: before.x - (pointer.x - width / 2) / scale, y: before.y + (pointer.y - height / 2) / scale }
}

export function orthoPoint(base: Point, next: Point): Point {
  return Math.abs(next.x - base.x) >= Math.abs(next.y - base.y)
    ? { x: next.x, y: base.y } : { x: base.x, y: next.y }
}

export function entitySnaps(entity: CadEntity): Snap[] {
  const end = (point: Point): Snap => ({ point, kind: '端點' })
  const mid = (a: Point, b: Point): Snap => ({ point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: '中點' })
  switch (entity.kind) {
    case 'line': return [end(entity.start), end(entity.end), mid(entity.start, entity.end)]
    case 'polyline': return [
      ...entity.points.map(end),
      ...entity.points.slice(1).map((p, i) => mid(entity.points[i], p)),
    ]
    case 'rectangle': {
      const { start: a, end: b } = entity
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
      return [...corners.map(end), ...corners.map((p, i) => mid(p, corners[(i + 1) % 4]))]
    }
    case 'circle': return [{ point: entity.center, kind: '圓心' }]
  }
}

export function nearestSnap(pointer: Point, entities: CadEntity[], visibleLayers: Set<string>, toleranceWorld: number): Snap | null {
  let best: Snap | null = null
  let min = toleranceWorld
  for (const entity of entities) {
    if (!visibleLayers.has(entity.layerId)) continue
    for (const snap of entitySnaps(entity)) {
      const d = distance(pointer, snap.point)
      if (d < min) { best = snap; min = d }
    }
  }
  return best
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}
export function hitTest(p: Point, entity: CadEntity): number {
  switch (entity.kind) {
    case 'line': return segmentDistance(p, entity.start, entity.end)
    case 'polyline': return Math.min(Infinity, ...entity.points.slice(1).map((end, i) => segmentDistance(p, entity.points[i], end)))
    case 'rectangle': {
      const a = entity.start, b = entity.end
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
      return Math.min(...corners.map((v, i) => segmentDistance(p, v, corners[(i + 1) % 4])))
    }
    case 'circle': return Math.abs(distance(p, entity.center) - entity.radius)
  }
}
