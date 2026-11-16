import { describe, expect, it } from 'vitest'
import { circleCircleIntersections, nearestSnap, segmentCircleIntersections, segmentIntersection } from './geometry'
import { rotateEntity, translateEntity } from './editing'
import { createDocument, parseDocument } from './document'
import { findCommand } from './commands'
import type { CadEntity } from './types'

const line = (id: string, ax: number, ay: number, bx: number, by: number): CadEntity => ({
  id, kind: 'line', layerId: '0', start: { x: ax, y: ay }, end: { x: bx, y: by },
})
describe('precise CAD intersections', () => {
  it('finds finite segment intersection at millimeter coordinates', () => {
    expect(segmentIntersection({ a: { x: 0, y: 0 }, b: { x: 3000, y: 3000 } },
      { a: { x: 0, y: 3000 }, b: { x: 3000, y: 0 } })).toEqual({ x: 1500, y: 1500 })
    expect(segmentIntersection({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 200, y: -10 }, b: { x: 200, y: 10 } })).toBe(null)
  })
  it('does not invent an isolated intersection for collinear overlapping lines', () => {
    expect(segmentIntersection({ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
      { a: { x: 50, y: 0 }, b: { x: 400, y: 0 } })).toBe(null)
  })
  it('snaps to visible intersecting entities but ignores hidden layers', () => {
    const items = [line('a', 0, 0, 2000, 2000), line('b', 0, 2000, 2000, 0)]
    expect(nearestSnap({ x: 1002, y: 998 }, items, new Set(['0']), 15))
      .toEqual({ point: { x: 1000, y: 1000 }, kind: '交點' })
    expect(nearestSnap({ x: 1000, y: 1000 }, items, new Set(), 15)).toBe(null)
  })
  it('calculates finite segment / circle intersections including tangency', () => {
    expect(segmentCircleIntersections({ a: { x: -20, y: 0 }, b: { x: 20, y: 0 } }, { x: 0, y: 0 }, 10))
      .toEqual([{ x: -10, y: 0 }, { x: 10, y: 0 }])
    expect(segmentCircleIntersections({ a: { x: -20, y: 10 }, b: { x: 20, y: 10 } }, { x: 0, y: 0 }, 10))
      .toEqual([{ x: 0, y: 10 }])
    expect(segmentCircleIntersections({ a: { x: 20, y: 0 }, b: { x: 30, y: 0 } }, { x: 0, y: 0 }, 10)).toEqual([])
  })
  it('supports circle tangency, not coincident circles', () => {
    const a = { center: { x: 0, y: 0 }, radius: 10 }
    expect(circleCircleIntersections(a, { center: { x: 20, y: 0 }, radius: 10 })).toEqual([{ x: 10, y: 0 }])
    expect(circleCircleIntersections(a, a)).toEqual([])
  })
})
describe('single-object editing', () => {
  it('translates without mutating the source', () => {
    const source = line('a', 0, 0, 3000, 0)
    expect(translateEntity(source, { x: 300, y: -50 }))
      .toMatchObject({ start: { x: 300, y: -50 }, end: { x: 3300, y: -50 } })
    expect(source).toMatchObject({ start: { x: 0, y: 0 } })
  })
  it('rotates a line counter-clockwise using an explicit pivot', () => {
    expect(rotateEntity(line('a', 2, 0, 5, 0), { x: 2, y: 0 }, 90))
      .toMatchObject({ start: { x: 2, y: 0 }, end: { x: 2, y: 3 } })
  })
  it('rotates a rectangle as a closed polyline, not an axis-aligned rectangle', () => {
    const rect: CadEntity = { id: 'rect', layerId: '0', kind: 'rectangle',
      start: { x: 0, y: 0 }, end: { x: 200, y: 100 } }
    const result = rotateEntity(rect, { x: 0, y: 0 }, 45)
    expect(result.kind).toBe('polyline')
    if (result.kind === 'polyline') {
      expect(result.points).toHaveLength(5)
      expect(result.points[0]).toEqual(result.points[4])
    }
  })
  it('round-trips ByLayer overrides and rejects invalid values', () => {
    const doc = createDocument()
    doc.layers[0].linetype = 'dashed'
    doc.entities.push({ ...line('a', 0, 0, 100, 100), color: '#eb4f70', lineweight: .35, linetype: 'ByLayer' })
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    expect(() => parseDocument({ ...doc, entities: [{ ...doc.entities[0], color: 'not-a-color' }] })).toThrow()
    expect(() => parseDocument({ ...doc, layers: [{ ...doc.layers[0], linetype: 'invalid' }, ...doc.layers.slice(1)] })).toThrow()
  })
  it('registers familiar move, copy and rotate aliases', () => {
    expect(findCommand('M')).toBe('move')
    expect(findCommand('CO')).toBe('copy')
    expect(findCommand('ROTATE')).toBe('rotate')
  })
})
