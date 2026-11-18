import type { Camera, CadEntity, CadPrimitive, Point, Snap } from './types'
import { arcDistance, arcPoint, arcPrimitiveIntersections, arcContainsAngle } from './arcs'
import { dimensionGeometry, getDimensionStyle } from './annotations'

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
    case 'circle': return [{ point: entity.center, kind: '圓心' },
      ...[0,90,180,270].map(a=>({point:{x:entity.center.x+entity.radius*Math.cos(a*Math.PI/180),
        y:entity.center.y+entity.radius*Math.sin(a*Math.PI/180)},kind:'象限點' as const}))]
    case 'arc': return [
      {point: arcPoint(entity,0),kind:'端點'},
      {point: arcPoint(entity,1),kind:'端點'},
      {point: arcPoint(entity,.5),kind:'中點'},
      {point: entity.center,kind:'圓心'},
      ...[0,90,180,270].filter(a=>arcContainsAngle(entity,a)).map(a=>({
        point:{x:entity.center.x+entity.radius*Math.cos(a*Math.PI/180),
          y:entity.center.y+entity.radius*Math.sin(a*Math.PI/180)},kind:'象限點' as const}))
    ]
    case 'insert': return [] // Caller expands block references using the document before snapping.
    case 'text': return [{ point: entity.position, kind: '端點' }]
    case 'dimension': return [{point:entity.start,kind:'端點'},{point:entity.end,kind:'端點'}]
  }
}

export function nearestSnap(pointer: Point, entities: CadEntity[], visibleLayers: Set<string>,
  toleranceWorld: number, base?:Point): Snap | null {
  let best: Snap | null = null
  let min = toleranceWorld
  for (const entity of entities) {
    if (!visibleLayers.has(entity.layerId)) continue
    for (const snap of entitySnaps(entity)) {
      const d = distance(pointer, snap.point)
      if (d < min) { best = snap; min = d }
    }
  }
  if(base){
    for(const entity of entities){
      if(!visibleLayers.has(entity.layerId))continue
      for(const segment of entitySegments(entity)){
        const dx=segment.b.x-segment.a.x,dy=segment.b.y-segment.a.y,denom=dx*dx+dy*dy
        if(denom<1e-10)continue
        const t=((base.x-segment.a.x)*dx+(base.y-segment.a.y)*dy)/denom
        if(t<0||t>1)continue
        const foot=roundPoint({x:segment.a.x+dx*t,y:segment.a.y+dy*t})
        if(distance(foot,base)<.001)continue
        const d=distance(pointer,foot)
        if(d<min){min=d;best={point:foot,kind:'垂足'}}
      }
    }
  }
  const intersection = nearestIntersection(pointer, entities, visibleLayers, toleranceWorld)
  // When multiple snap kinds coincide, prefer intersection over midpoint/endpoint.
  if (intersection && distance(pointer, intersection.point) <= min + 1e-6) return intersection
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
    case 'arc': return arcDistance(p,entity)
    case 'insert': return Infinity // Hit testing of inserts is on flattened primitives.
    case 'text': {
      // Approximate text hit testing in local text coordinates (font metrics depend on the browser).
      const dx = p.x - entity.position.x, dy = p.y - entity.position.y
      const a = entity.rotation * Math.PI / 180
      const localX = dx * Math.cos(a) + dy * Math.sin(a)
      const localY = -dx * Math.sin(a) + dy * Math.cos(a)
      const lines = entity.text.split(String.fromCharCode(10))
      const width = Math.max(entity.height, ...lines.map(line => [...line].length * entity.height * .7))
      const minY = -(lines.length - 1) * entity.height * 1.3 - entity.height * .5
      const maxY = entity.height * .5
      return Math.hypot(Math.max(0,-localX,localX-width),Math.max(0,minY-localY,localY-maxY))
    }
    case 'dimension': {
      const geom = dimensionGeometry(entity,getDimensionStyle())
      return Math.min(...geom.lines.map(s => segmentDistance(p,s.a,s.b)),
        distance(p,geom.label.position))
    }
  }
}

/** Bounded, finite segments, as opposed to infinite construction lines. */
export interface Segment { a: Point; b: Point }
export function entitySegments(entity: CadEntity): Segment[] {
  const segments = (points: Point[], closed = false): Segment[] => {
    const seq = closed ? [...points, points[0]] : points
    return seq.slice(1).map((p, i) => ({ a: seq[i], b: p }))
  }
  switch (entity.kind) {
    case 'line': return [{ a: entity.start, b: entity.end }]
    case 'polyline': return segments(entity.points)
    case 'rectangle': {
      const a = entity.start, b = entity.end
      return segments([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], true)
    }
    case 'circle': case 'arc': case 'insert': case 'text': return []
    case 'dimension': return [] // Dimensions do not generate drawing intersection snaps.
  }
}
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const EPS = 1e-9

/** An overlap without one unique intersection is deliberately excluded. */
export function segmentIntersection(p: Segment, q: Segment): Point | null {
  const r = sub(p.b, p.a), s = sub(q.b, q.a)
  const denom = cross(r, s)
  if (Math.abs(denom) <= EPS * Math.max(1, Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) return null
  const difference = sub(q.a, p.a)
  const t = cross(difference, s) / denom, u = cross(difference, r) / denom
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return roundPoint({ x: p.a.x + t * r.x, y: p.a.y + t * r.y })
}
export function segmentCircleIntersections(segment: Segment, center: Point, radius: number): Point[] {
  const v = sub(segment.b, segment.a), start = sub(segment.a, center)
  const a = dot(v, v)
  if (a < EPS) return []
  const b = 2 * dot(start, v), c = dot(start, start) - radius * radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < -EPS) return []
  const root = Math.sqrt(Math.max(0, discriminant))
  const tValues = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
  const points: Point[] = []
  for (const t of tValues) {
    if (t < -EPS || t > 1 + EPS) continue
    const p = roundPoint({ x: segment.a.x + v.x * t, y: segment.a.y + v.y * t })
    if (!points.some(old => distance(old, p) < .001)) points.push(p)
  }
  return points
}
export function circleCircleIntersections(a: { center: Point; radius: number }, b: { center: Point; radius: number }): Point[] {
  const d = distance(a.center, b.center)
  if (d < EPS || d > a.radius + b.radius + EPS || d < Math.abs(a.radius - b.radius) - EPS) return []
  const along = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d)
  const height = Math.sqrt(Math.max(0, a.radius ** 2 - along ** 2))
  const ux = (b.center.x - a.center.x) / d, uy = (b.center.y - a.center.y) / d
  const middle = { x: a.center.x + along * ux, y: a.center.y + along * uy }
  const first = roundPoint({ x: middle.x - uy * height, y: middle.y + ux * height })
  const second = roundPoint({ x: middle.x + uy * height, y: middle.y - ux * height })
  return distance(first, second) < .001 ? [first] : [first, second]
}
/** Only pairs near the cursor are examined; large drawings avoid global all-pairs work. */
export function nearestIntersection(pointer: Point, entities: CadEntity[], visibleLayers: Set<string>, tolerance: number): Snap | null {
  const boundsNear = (entity: CadEntity): boolean => {
    if (entity.kind === 'circle') return Math.abs(distance(pointer, entity.center) - entity.radius) <= tolerance
    if (entity.kind === 'arc') return arcDistance(pointer,entity) <= tolerance
    return entitySegments(entity).some(({ a, b }) => {
      const minX = Math.min(a.x, b.x) - tolerance, maxX = Math.max(a.x, b.x) + tolerance
      const minY = Math.min(a.y, b.y) - tolerance, maxY = Math.max(a.y, b.y) + tolerance
      return pointer.x >= minX && pointer.x <= maxX && pointer.y >= minY && pointer.y <= maxY
    })
  }
  const candidates = entities.filter(e => visibleLayers.has(e.layerId) && boundsNear(e))
  let closest = tolerance
  let nearest: Snap | null = null
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i], aSegments = entitySegments(a)
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j], bSegments = entitySegments(b)
      const points: Point[] = []
      const primitive=(e:CadEntity):e is CadPrimitive =>
        e.kind==='line'||e.kind==='rectangle'||e.kind==='polyline'||e.kind==='circle'||e.kind==='arc'
      if(a.kind==='arc'&&primitive(b)) points.push(...arcPrimitiveIntersections(a,b))
      else if(b.kind==='arc'&&primitive(a)) points.push(...arcPrimitiveIntersections(b,a))
      else if (a.kind === 'circle' && b.kind === 'circle') points.push(...circleCircleIntersections(a, b))
      else if (a.kind === 'circle') for (const seg of bSegments) points.push(...segmentCircleIntersections(seg, a.center, a.radius))
      else if (b.kind === 'circle') for (const seg of aSegments) points.push(...segmentCircleIntersections(seg, b.center, b.radius))
      else for (const sa of aSegments) for (const sb of bSegments) {
        const hit = segmentIntersection(sa, sb)
        if (hit) points.push(hit)
      }
      for (const p of points) {
        const d = distance(pointer, p)
        if (d < closest) { closest = d; nearest = { point: p, kind: '交點' } }
      }
    }
  }
  return nearest
}
