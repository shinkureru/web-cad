import type { CadDocument, CadEntity, CadLayer, Point } from './types'

export const STORAGE_KEY = 'web-cad:v1:document'
export const uid = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function createDocument(): CadDocument {
  return {
    version: 1, name: '未命名圖面', unit: 'mm', activeLayerId: '0', entities: [],
    layers: [
      { id: '0', name: '0', color: '#e7edf3', lineweight: 0.25, visible: true, locked: false },
      { id: 'wall', name: '牆體', color: '#f19c81', lineweight: 0.5, visible: true, locked: false },
      { id: 'dimension', name: '標註', color: '#79b5e9', lineweight: 0.18, visible: true, locked: false },
      { id: 'furniture', name: '家具', color: '#e2c37d', lineweight: 0.25, visible: true, locked: false },
      { id: 'door', name: '門窗', color: '#92c7a3', lineweight: 0.25, visible: true, locked: false },
    ],
  }
}

const isPoint = (x: unknown): x is Point => !!x && typeof x === 'object'
  && Number.isFinite((x as Point).x) && Number.isFinite((x as Point).y)
function isLayer(x: unknown): x is CadLayer {
  if (!x || typeof x !== 'object') return false
  const layer = x as CadLayer
  return typeof layer.id === 'string' && typeof layer.name === 'string'
    && /^#[0-9a-fA-F]{6}$/.test(layer.color)
    && Number.isFinite(layer.lineweight) && layer.lineweight >= 0
    && typeof layer.visible === 'boolean' && typeof layer.locked === 'boolean'
}
function isEntity(x: unknown, layers: Set<string>): x is CadEntity {
  if (!x || typeof x !== 'object') return false
  const e = x as CadEntity
  if (typeof e.id !== 'string' || !layers.has(e.layerId)) return false
  switch (e.kind) {
    case 'line': case 'rectangle': return isPoint(e.start) && isPoint(e.end)
    case 'polyline': return Array.isArray(e.points) && e.points.length >= 2 && e.points.every(isPoint)
    case 'circle': return isPoint(e.center) && Number.isFinite(e.radius) && e.radius > 0
    default: return false
  }
}
/** Strict validation of the prototype's native JSON format. Never render unknown schema entities. */
export function parseDocument(input: unknown): CadDocument {
  if (!input || typeof input !== 'object') throw new Error('無效的圖面檔案')
  const d = input as Partial<CadDocument>
  if (d.version !== 1 || d.unit !== 'mm' || typeof d.name !== 'string'
    || !Array.isArray(d.layers) || !Array.isArray(d.entities)
    || !d.layers.length || !d.layers.every(isLayer)) throw new Error('檔案版本或格式不支援')
  const layerIds = new Set(d.layers.map(l => l.id))
  if (layerIds.size !== d.layers.length || typeof d.activeLayerId !== 'string'
    || !layerIds.has(d.activeLayerId) || !d.entities.every(e => isEntity(e, layerIds))) {
    throw new Error('圖面內容驗證失敗')
  }
  return d as CadDocument
}

export interface History { past: CadDocument[]; present: CadDocument; future: CadDocument[] }
export type DocAction = { type: 'replace'; document: CadDocument } | { type: 'undo' | 'redo' }
  | { type: 'edit'; update: (doc: CadDocument) => CadDocument }
export function documentReducer(state: History, action: DocAction): History {
  if (action.type === 'replace') return { past: [], present: action.document, future: [] }
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return { past: [...state.past, state.present].slice(-100), present: state.future[0], future: state.future.slice(1) }
  }
  const next = action.update(state.present)
  if (next === state.present) return state
  return { past: [...state.past, state.present].slice(-100), present: next, future: [] }
}
