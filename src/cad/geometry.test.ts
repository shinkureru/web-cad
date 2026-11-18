import { describe, expect, it } from 'vitest'
import { distance, nearestSnap, orthoPoint, toScreen, toWorld, zoomAt } from './geometry'
import { findCommand, parsePointInput } from './commands'
import { createDocument, documentReducer, parseDocument } from './document'
import type { History } from './document'

describe('CAD geometry in mm', () => {
  it('preserves world coordinates through viewport transforms', () => {
    const camera = { x: 2750, y: 1900, scale: .33 }
    const p = { x: 3000.123, y: 1050.5 }
    const result = toWorld(toScreen(p, camera, 1100, 700), camera, 1100, 700)
    expect(result.x).toBeCloseTo(p.x, 9); expect(result.y).toBeCloseTo(p.y, 9)
  })
  it('zooms about the pointer without moving its world coordinate', () => {
    const a = { x: 2000, y: 1500, scale: .2 }, pointer = { x: 290, y: 530 }
    const b = zoomAt(a, 1.5, pointer, 1200, 800)
    expect(toWorld(pointer, b, 1200, 800)).toEqual(toWorld(pointer, a, 1200, 800))
  })
  it('uses the dominant axis in ortho mode', () => {
    expect(orthoPoint({ x: 5, y: 5 }, { x: 100, y: 20 })).toEqual({ x: 100, y: 5 })
    expect(orthoPoint({ x: 5, y: 5 }, { x: 9, y: 100 })).toEqual({ x: 5, y: 100 })
  })
  it('provides endpoint/midpoint snapping', () => {
    const doc = createDocument()
    doc.entities.push({ id: 'a', layerId: '0', kind: 'line', start: { x: 0, y: 0 }, end: { x: 3000, y: 0 } })
    const found = nearestSnap({ x: 1498, y: 2 }, doc.entities, new Set(['0']), 10)
    expect(found).toEqual({ point: { x: 1500, y: 0 }, kind: '中點' })
  })
  it('measures real distances independently of zoom', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000)
  })
})

describe('command interpreter', () => {
  it('registers PL, L, REC and aliases', () => {
    expect(findCommand('pl')).toBe('polyline')
    expect(findCommand('LINE')).toBe('line')
    expect(findCommand('rec')).toBe('rectangle')
    expect(findCommand('tr')).toBe('trim')
  })
  it('reads absolute, relative and polar coordinates', () => {
    expect(parsePointInput('3000,1200', null, { x: 0, y: 0 })).toEqual({ x: 3000, y: 1200 })
    expect(parsePointInput('@3000,-1200', { x: 20, y: 20 }, { x: 0, y: 0 })).toEqual({ x: 3020, y: -1180 })
    expect(parsePointInput('@500<90', { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 500 })
    expect(parsePointInput('1500', { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 1500, y: 0 })
    expect(parsePointInput('@1,1', null, { x: 0, y: 0 })).toBe(null)
  })
})

describe('document integrity', () => {
  it('round-trips and rejects unknown / invalid drawing files', () => {
    const doc = createDocument()
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    expect(() => parseDocument({ ...doc, version: 42 })).toThrow()
    expect(() => parseDocument({ ...doc, entities: [{ id: 'test', kind: 'virus', layerId: '0' }] })).toThrow()
  })
  it('undoes and redoes an edit', () => {
    const original = createDocument()
    let state: History = { past: [], present: original, future: [] }
    state = documentReducer(state, { type: 'edit', update: d => ({ ...d, name: 'New' }) })
    state = documentReducer(state, { type: 'undo' }); expect(state.present.name).toBe(original.name)
    state = documentReducer(state, { type: 'redo' }); expect(state.present.name).toBe('New')
  })
})
