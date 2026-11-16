import { rotateEntity, translateEntity } from './editing'
import { roundPoint } from './geometry'
import type { BlockDefinition, CadDocument, CadEntity, CadPrimitive, InsertEntity, Point } from './types'

/** A v0.3 block is a reusable set of primitive geometry; nested INSERT is not supported. */
export function expandInsert(insert: InsertEntity, blocks: BlockDefinition[]): CadPrimitive[] {
  const def = blocks.find(b => b.id === insert.blockId)
  if (!def) return []
  return def.entities.map(source => {
    const rotated = rotateEntity(source, { x: 0, y: 0 }, insert.rotation) as CadPrimitive
    const entity = translateEntity(rotated, insert.position) as CadPrimitive
    // The INSERT is one atomic selectable object. Unoverridden content inherits INSERT properties.
    return { ...entity, id: insert.id, layerId: insert.layerId,
      color: source.color && source.color !== 'ByLayer' ? source.color : insert.color,
      lineweight: typeof source.lineweight === 'number' ? source.lineweight : insert.lineweight,
      linetype: source.linetype && source.linetype !== 'ByLayer' ? source.linetype : insert.linetype }
  })
}
export function expandEntity(entity: CadEntity, doc: CadDocument): CadPrimitive[] {
  return entity.kind === 'insert' ? expandInsert(entity, doc.blocks ?? []) : [entity]
}
export function expandedDrawing(doc: CadDocument): CadPrimitive[] {
  return doc.entities.flatMap(e => expandEntity(e, doc))
}
/** A block's local origin is the chosen base point; source ByLayer styles survive regrouping across layers. */
export function createBlockFromSelection(doc: CadDocument, ids: string[], name: string, base: Point,
  blockId: string, insertId: string): CadDocument {
  const idSet = new Set(ids)
  const selected = doc.entities.filter(e => idSet.has(e.id))
  if (!selected.length || selected.length !== idSet.size || selected.some(e => e.kind === 'insert')) throw new Error('請選取至少一個基本圖元（不支援巢狀圖塊）')
  if (!name.trim() || (doc.blocks ?? []).some(b => b.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('圖塊名稱不可空白或重複')
  for (const entity of selected) {
    const layer = doc.layers.find(l => l.id === entity.layerId)
    if (!layer?.visible || layer.locked) throw new Error('包含不可編輯的圖層')
  }
  const insertLayer = selected[0].layerId
  const entities: CadPrimitive[] = selected.map(entity => {
    const translated = translateEntity(entity, { x: -base.x, y: -base.y }) as CadPrimitive
    if (entity.layerId === insertLayer) return translated
    const layer = doc.layers.find(l => l.id === entity.layerId)!
    return { ...translated, color: entity.color && entity.color !== 'ByLayer' ? entity.color : layer.color,
      lineweight: typeof entity.lineweight === 'number' ? entity.lineweight : layer.lineweight,
      linetype: entity.linetype && entity.linetype !== 'ByLayer' ? entity.linetype : layer.linetype ?? 'continuous' }
  })
  const def: BlockDefinition = { id: blockId, name: name.trim(), entities }
  const insert: InsertEntity = { id: insertId, kind: 'insert', blockId, position: roundPoint(base), rotation: 0, layerId: insertLayer }
  return { ...doc, blocks: [...(doc.blocks ?? []), def],
    entities: [...doc.entities.filter(e => !idSet.has(e.id)), insert] }
}
export function explodeInsert(doc: CadDocument, insertId: string, newId: () => string): CadDocument {
  const entity = doc.entities.find(e => e.id === insertId)
  if (!entity || entity.kind !== 'insert') throw new Error('請先選取一個圖塊參照')
  const layer = doc.layers.find(l => l.id === entity.layerId)
  if (!layer?.visible || layer.locked) throw new Error('圖層不可編輯')
  const expanded = expandInsert(entity, doc.blocks ?? []).map(e => ({ ...e, id: newId() }))
  if (!expanded.length) throw new Error('找不到圖塊定義')
  return { ...doc, entities: doc.entities.flatMap(e => e.id === insertId ? expanded : [e]) }
}

const P = (x: number, y: number): Point => ({ x, y })
function ln(id: string, ax: number, ay: number, bx: number, by: number): CadPrimitive {
  return { id, kind: 'line', layerId: '0', start: P(ax, ay), end: P(bx, by) }
}
function rect(id: string, ax: number, ay: number, bx: number, by: number): CadPrimitive {
  return { id, kind: 'rectangle', layerId: '0', start: P(ax, ay), end: P(bx, by) }
}
export interface LibraryPreset { id: string; name: string; category: string; width: number; depth: number; entities: CadPrimitive[] }
/** Schematic mm references — review dimensions for actual manufacturers and door types. */
export const BUILTIN_BLOCKS: LibraryPreset[] = [
  { id: 'preset:bed1500', name: '雙人床 1500×2000', category: '家具', width: 1500, depth: 2000, entities: [
    rect('bed-outline',0,0,1500,2000), ln('bed-head',0,350,1500,350),
    rect('bed-pillow-a',100,100,690,310), rect('bed-pillow-b',810,100,1400,310)] },
  { id: 'preset:sofa2100', name: '三人沙發 2100×850', category: '家具', width: 2100, depth: 850, entities: [
    rect('sofa-outline',0,0,2100,850), rect('sofa-left',0,0,180,850), rect('sofa-right',1920,0,2100,850),
    ln('sofa-back',180,220,1920,220), ln('sofa-seat-1',760,220,760,850), ln('sofa-seat-2',1340,220,1340,850)] },
  { id: 'preset:table1600', name: '四人餐桌 1600×900', category: '家具', width: 1600, depth: 900, entities: [
    rect('table-top',0,0,1600,900), rect('chair-a',220,-440,650,-80), rect('chair-b',950,-440,1380,-80),
    rect('chair-c',220,980,650,1340), rect('chair-d',950,980,1380,1340)] },
  { id: 'preset:door900', name: '單開門 900', category: '門窗', width: 900, depth: 900, entities: [
    ln('door-leaf',0,0,900,0),
    { id:'door-swing', kind:'polyline', layerId:'0', points:Array.from({length:13},(_,i)=>P(
      Math.round(900*Math.cos(Math.PI*i/24)*1000)/1000, Math.round(900*Math.sin(Math.PI*i/24)*1000)/1000)) }] },
  { id: 'preset:window1200', name: '平面窗 1200', category: '門窗', width: 1200, depth: 150, entities: [
    rect('window-frame',0,0,1200,150), ln('window-middle',0,75,1200,75)] },
]
export function installPreset(doc: CadDocument, preset: LibraryPreset): CadDocument {
  if ((doc.blocks ?? []).some(b => b.id === preset.id)) return doc
  return { ...doc, blocks: [...(doc.blocks ?? []), {
    id: preset.id, name: preset.name, entities: preset.entities
  }] }
}
