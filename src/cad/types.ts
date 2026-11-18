export interface Point { x: number; y: number }
export interface Camera extends Point { scale: number }
export type Tool = 'select' | 'line' | 'polyline' | 'rectangle' | 'circle' | 'arc' | 'wall'
export type EditTool = 'move' | 'copy' | 'rotate'
export type LineType = 'continuous' | 'dashed' | 'center'
export type PropertyValue<T> = T | 'ByLayer'

export interface EntityBase { id: string; layerId: string; color?: PropertyValue<string>; lineweight?: PropertyValue<number>; linetype?: PropertyValue<LineType> }
export interface LineEntity extends EntityBase { kind: 'line'; start: Point; end: Point }
export interface PolylineEntity extends EntityBase { kind: 'polyline'; points: Point[] }
export interface RectangleEntity extends EntityBase { kind: 'rectangle'; start: Point; end: Point }
export interface CircleEntity extends EntityBase { kind: 'circle'; center: Point; radius: number }
/** CCW circular arc from startAngle to endAngle in degrees, relative to +X, in model-space mm. */
export interface ArcEntity extends EntityBase {
  kind: 'arc'; center: Point; radius: number; startAngle: number; endAngle: number
}
export type CadPrimitive = LineEntity | PolylineEntity | RectangleEntity | CircleEntity | ArcEntity
/** Insert references one non-nested block definition; origin, angle and coordinates are all mm. */
export interface InsertEntity extends EntityBase { kind: 'insert'; blockId: string; position: Point; rotation: number }
export interface TextEntity extends EntityBase { kind: 'text'; position: Point; text: string; height: number; rotation: number }
export type DimensionMode = 'linear' | 'aligned'
export type DimensionAxis = 'horizontal' | 'vertical'
export interface DimensionStyle {
  id: string; name: string; textHeight: number; arrowSize: number; textGap: number
  extensionGap: number; extensionBeyond: number; precision: number; suffix: string
}
export interface DimensionEntity extends EntityBase {
  kind: 'dimension'; start: Point; end: Point; placement: Point; mode: DimensionMode
  axis: DimensionAxis; styleId: string
}
/** Circular dimension: legacy v1.3 snapshots stay standalone; v1.4 may link a source. */
export type CurveMeasure = 'radius' | 'diameter' | 'arcLength' | 'angle'
export interface CurveDimensionEntity extends EntityBase {
  kind:'curveDimension'; measure:CurveMeasure
  center:Point; radius:number; placement:Point; styleId:string
  /** Required only for arcLength or angle; CCW model degrees. */
  startAngle?:number; endAngle?:number
  /** The original CIRCLE/ARC ID; linked dimensions track all geometric edits. */
  sourceId?:string
  /** Frozen snapshot because its source was deleted or became incompatible. */
  orphaned?:boolean
}
export type CadDisplayEntity = CadPrimitive | TextEntity | DimensionEntity | CurveDimensionEntity
export type CadEntity = CadDisplayEntity | InsertEntity
export interface BlockDefinition { id: string; name: string; entities: CadPrimitive[] }

export interface CadLayer {
  id: string
  name: string
  color: string
  lineweight: number
  linetype?: LineType
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
  /** Optional to preserve files saved by v0.1/v0.2. */
  blocks?: BlockDefinition[]
  /** Optional for v0.1-v0.3 document compatibility. */
  dimensionStyles?: DimensionStyle[]
  activeDimensionStyleId?: string
}
export interface Draft { tool: Exclude<Tool, 'select'>; points: Point[] }
export type SnapKind = '端點' | '中點' | '圓心' | '交點' | '象限點' | '垂足'
export interface Snap { point: Point; kind: SnapKind }
