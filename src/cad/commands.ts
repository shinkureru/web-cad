import type { EditTool, Point, Tool } from './types'
import { roundPoint } from './geometry'

const aliases: Record<string, Tool | EditTool | 'undo' | 'redo' | 'delete' | 'save' | 'fit' | 'cancel' | 'block' | 'insert' | 'explode' | 'text' | 'linearDimension' | 'alignedDimension' | 'dimstyle' | 'plot'> = {
  L: 'line', LINE: 'line', W: 'wall', WALL: 'wall', PL: 'polyline', PLINE: 'polyline',
  REC: 'rectangle', RECTANG: 'rectangle', RECTANGLE: 'rectangle',
  C: 'circle', CIRCLE: 'circle', SELECT: 'select', ESC: 'cancel',
  U: 'undo', UNDO: 'undo', REDO: 'redo', E: 'delete', ERASE: 'delete', DEL: 'delete',
  M: 'move', MOVE: 'move', CO: 'copy', COPY: 'copy', CP: 'copy', RO: 'rotate', ROTATE: 'rotate',
  B: 'block', BLOCK: 'block', I: 'insert', INSERT: 'insert', X: 'explode', EXPLODE: 'explode',
  T: 'text', TEXT: 'text', DT: 'text', DTEXT: 'text',
  DLI: 'linearDimension', DIMLINEAR: 'linearDimension',
  DAL: 'alignedDimension', DIMALIGNED: 'alignedDimension',
  D: 'dimstyle', DIMSTYLE: 'dimstyle',
  PLOT: 'plot', PRINT: 'plot',
  SAVE: 'save', Z: 'fit', ZE: 'fit', ZOOM: 'fit',
}
export type CadCommand = (typeof aliases)[string]
export function findCommand(raw: string): CadCommand | null { return aliases[raw.trim().toUpperCase()] ?? null }

/** CAD coordinates: absolute X,Y, relative @DX,DY, polar @DIST<ANGLE, or distance in cursor direction. */
export function parsePointInput(input: string, base: Point | null, cursor: Point): Point | null {
  const value = input.trim().replace(/\s+/g, '')
  const pair = /^(@)?(-?(?:\d+(?:\.\d*)?|\.\d+)),(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(value)
  if (pair) {
    const x = Number(pair[2]), y = Number(pair[3])
    const origin = pair[1] ? base : null
    if (pair[1] && !base) return null
    return roundPoint({ x: x + (origin?.x ?? 0), y: y + (origin?.y ?? 0) })
  }
  const polar = /^@(-?(?:\d+(?:\.\d*)?|\.\d+))<(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(value)
  if (polar && base) {
    const angle = Number(polar[2]) * Math.PI / 180, length = Number(polar[1])
    return roundPoint({ x: base.x + Math.cos(angle) * length, y: base.y + Math.sin(angle) * length })
  }
  const scalar = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.exec(value)
  if (scalar && base) {
    const length = Number(value)
    const angle = Math.atan2(cursor.y - base.y, cursor.x - base.x)
    return roundPoint({ x: base.x + Math.cos(angle) * length, y: base.y + Math.sin(angle) * length })
  }
  return null
}
