import { describe, expect, it } from 'vitest'
import { BUILTIN_BLOCKS, createBlockFromSelection, expandEntity, expandedDrawing, explodeInsert, installPreset } from './blocks'
import { createDocument, parseDocument } from './document'
import { hitTest, nearestSnap } from './geometry'
import { rotateEntity, translateEntity } from './editing'
import { findCommand } from './commands'
import type { CadDocument, CadEntity } from './types'

const line = (id: string, ax: number, ay: number, bx: number, by: number, layerId='0'): CadEntity =>
  ({ id, kind: 'line', layerId, start: { x: ax, y: ay }, end: { x: bx, y: by } })
const origin = {x:0,y:0}
describe('v0.3 reusable block geometry', () => {
  it('creates a shared definition in block-local mm and replaces multiple source entities with one insertion', () => {
    const doc = createDocument()
    doc.entities = [line('a',100,200,1100,200),line('b',1100,200,1100,700)]
    const next = createBlockFromSelection(doc,['a','b'],'測試圖塊',{x:100,y:200},'my-block','instance1')
    expect(next.blocks).toHaveLength(1)
    expect(next.blocks![0].entities).toMatchObject([
      { start:{x:0,y:0},end:{x:1000,y:0} },
      { start:{x:1000,y:0},end:{x:1000,y:500} },
    ])
    expect(next.entities).toMatchObject([{kind:'insert',id:'instance1',position:{x:100,y:200}}])
    expect(expandEntity(next.entities[0],next).map(e => e.kind === 'line' ? [e.start, e.end] : []))
      .toEqual(doc.entities.map(e => e.kind === 'line' ? [e.start, e.end] : []))
    expect(doc.entities).toHaveLength(2)
  })
  it('expands a rotated and translated block, including rectangle as a closed polyline', () => {
    const base = createDocument()
    base.entities = [{kind:'rectangle',id:'r',layerId:'0',start:origin,end:{x:100,y:50}}]
    const doc = createBlockFromSelection(base,['r'],'矩形',origin,'rect','insert')
    const inst = doc.entities[0]
    if (inst.kind !== 'insert') throw new Error('Expected insert')
    const rotated = { ...inst, position:{x:2000,y:3000},rotation:90 }
    const output = expandEntity(rotated,doc)
    expect(output[0].kind).toBe('polyline')
    if (output[0].kind === 'polyline') {
      expect(output[0].points[0]).toEqual({x:2000,y:3000})
      expect(output[0].points[1]).toEqual({x:2000,y:3100})
      expect(output[0].points[4]).toEqual(output[0].points[0])
    }
    expect(translateEntity(inst,{x:10,y:20})).toMatchObject({position:{x:10,y:20}})
    expect(rotateEntity(inst,origin,90)).toMatchObject({rotation:90})
  })
  it('can instance the same definition twice with unique ids and explode one copy', () => {
    let doc = createDocument()
    doc.entities = [line('a',0,0,1000,0)]
    doc = createBlockFromSelection(doc,['a'],'牆線',origin,'block','first')
    doc.entities.push({kind:'insert',id:'second',blockId:'block',position:{x:5000,y:0},rotation:0,layerId:'0'})
    expect(doc.blocks).toHaveLength(1)
    expect(expandedDrawing(doc)).toHaveLength(2)
    const exploded = explodeInsert(doc,'second',()=> 'expanded')
    expect(exploded.entities.map(e=>e.id)).toEqual(['first','expanded'])
    expect(exploded.blocks).toHaveLength(1)
    expect(exploded.entities[1]).toMatchObject({start:{x:5000,y:0},end:{x:6000,y:0}})
    expect(doc.entities[1].kind).toBe('insert')
  })
  it('supports selection and endpoint snaps against flattened block geometry', () => {
    const original = createDocument()
    original.entities=[line('a',0,0,3000,0)]
    const doc=createBlockFromSelection(original,['a'],'長線',origin,'lineblk','ref')
    const segments=expandedDrawing(doc)
    expect(hitTest({x:1500,y:0},segments[0])).toBe(0)
    expect(nearestSnap({x:2998,y:2},segments,new Set(['0']),10))
      .toEqual({point:{x:3000,y:0},kind:'端點'})
  })
  it('installs CAD presets only once and retains serializable mm geometry', () => {
    let doc=createDocument()
    for(const preset of BUILTIN_BLOCKS) {
      doc=installPreset(doc,preset)
      doc=installPreset(doc,preset)
    }
    expect(doc.blocks?.length).toBe(BUILTIN_BLOCKS.length)
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    expect(BUILTIN_BLOCKS.find(b=>b.id==='preset:bed1500')?.width).toBe(1500)
  })
  it('preserves v0.2 files without a blocks array', () => {
    const doc=createDocument()
    delete doc.blocks
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })
  it('rejects dangling references, nested definitions, duplicate definition names and malformed objects', () => {
    const doc=createDocument()
    const broken:CadDocument={...doc,entities:[{kind:'insert',id:'x',layerId:'0',blockId:'missing',position:origin,rotation:0}]}
    expect(()=>parseDocument(broken)).toThrow()
    const nested:CadDocument={...doc,blocks:[{id:'b',name:'Nested',entities:[broken.entities[0] as any]}]}
    expect(()=>parseDocument(nested)).toThrow()
    expect(()=>createBlockFromSelection(doc,[],'N',origin,'b','i')).toThrow()
    const selected={...doc,entities:[line('a',0,0,1,1)]}
    expect(()=>createBlockFromSelection(selected,['a'],' ',origin,'b','i')).toThrow()
    expect(()=>explodeInsert(selected,'a',()=> 'x')).toThrow()
  })
  it('preserves visual attributes when combining geometry from different layers', () => {
    const d=createDocument()
    d.entities=[line('a',0,0,50,0,'0'),line('b',0,10,50,10,'wall')]
    const b=createBlockFromSelection(d,['a','b'],'混合圖層',origin,'mixed','inst')
    expect(b.blocks![0].entities[1].color).toBe(d.layers.find(l=>l.id==='wall')!.color)
    expect(expandEntity(b.entities[0],b)[1].color).toBe(d.layers.find(l=>l.id==='wall')!.color)
  })
  it('registers classic CAD block aliases', () => {
    expect(findCommand('B')).toBe('block')
    expect(findCommand('INSERT')).toBe('insert')
    expect(findCommand('X')).toBe('explode')
  })
})
