export interface Point { x: number; y: number }
export interface Camera extends Point { scale: number }
export type Tool = 'select' | 'line' | 'polyline' | 'rectangle' | 'circle'

export interface EntityBase { id: string; layerId: string }
export interface LineEntity extends EntityBase { kind: 'line'; start: Point; end: Point }
export interface PolylineEntity extends EntityBase { kind: 'polyline'; points: Point[] }
export interface RectangleEntity extends EntityBase { kind: 'rectangle'; start: Point; end: Point }
export interface CircleEntity extends EntityBase { kind: 'circle'; center: Point; radius: number }
export type CadEntity = LineEntity | PolylineEntity | RectangleEntity | CircleEntity

export interface CadLayer {
  id: string
  name: string
  color: string
  lineweight: number
  visible: boolean
  locked: boolean
}
export interface CadDocument {
  version: 1
  name: string
  unit: 'mm'
  layers: CadLayer[]
  entities: CadEntity[]
  activeLayerId: string
}
export interface Draft { tool: Exclude<Tool, 'select'>; points: Point[] }
export type SnapKind = '端點' | '中點' | '圓心'
export interface Snap { point: Point; kind: SnapKind }
