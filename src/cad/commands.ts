import type { EditTool, Point, Tool } from './types'
import { roundPoint } from './geometry'

export type InputUnit = 'mm' | 'cm'
export const unitToMm = (unit: InputUnit): number => unit==='cm'?10:1

const aliases: Record<string, Tool | EditTool | 'undo' | 'redo' | 'delete' | 'save' | 'fit' | 'cancel' | 'block' | 'insert' | 'explode' | 'text' | 'linearDimension' | 'alignedDimension' | 'dimstyle' | 'plot' | 'offset' | 'trim' | 'extend' | 'fillet' | 'chamfer'> = {
  L: 'line', LINE: 'line', W: 'wall', WALL: 'wall', PL: 'polyline', PLINE: 'polyline',
  REC: 'rectangle', RECTANG: 'rectangle', RECTANGLE: 'rectangle',
  C: 'circle', CIRCLE: 'circle', A: 'arc', ARC: 'arc', SELECT: 'select', ESC: 'cancel',
  U: 'undo', UNDO: 'undo', REDO: 'redo', E: 'delete', ERASE: 'delete', DEL: 'delete',
  M: 'move', MOVE: 'move', CO: 'copy', COPY: 'copy', CP: 'copy', RO: 'rotate', ROTATE: 'rotate',
  B: 'block', BLOCK: 'block', I: 'insert', INSERT: 'insert', X: 'explode', EXPLODE: 'explode',
  T: 'text', TEXT: 'text', DT: 'text', DTEXT: 'text',
  DLI: 'linearDimension', DIMLINEAR: 'linearDimension',
  DAL: 'alignedDimension', DIMALIGNED: 'alignedDimension',
  D: 'dimstyle', DIMSTYLE: 'dimstyle',
  O: 'offset', OFFSET: 'offset', TR: 'trim', TRIM: 'trim',
  EX: 'extend', EXTEND: 'extend',
  F: 'fillet', FILLET: 'fillet',
  CHA: 'chamfer', CHAMFER: 'chamfer',
  PLOT: 'plot', PRINT: 'plot',
  SAVE: 'save', Z: 'fit', ZE: 'fit', ZOOM: 'fit',
}
export type CadCommand = (typeof aliases)[string]
export const EDITABLE_SHORTCUTS = [
  {command:'line',key:'L',label:'直線 LINE'},
  {command:'polyline',key:'PL',label:'聚合線 PLINE'},
  {command:'rectangle',key:'REC',label:'矩形 RECTANG'},
  {command:'circle',key:'C',label:'圓 CIRCLE'},
  {command:'arc',key:'A',label:'圓弧 ARC'},
  {command:'wall',key:'W',label:'雙線牆 WALL'},
  {command:'move',key:'M',label:'移動 MOVE'},
  {command:'copy',key:'CO',label:'複製 COPY'},
  {command:'rotate',key:'RO',label:'旋轉 ROTATE'},
  {command:'offset',key:'O',label:'偏移 OFFSET'},
  {command:'trim',key:'TR',label:'修剪 TRIM'},
  {command:'extend',key:'EX',label:'延伸 EXTEND'},
  {command:'fillet',key:'F',label:'圓角 FILLET'},
  {command:'chamfer',key:'CHA',label:'倒角 CHAMFER'},
  {command:'delete',key:'E',label:'刪除 ERASE'},
  {command:'fit',key:'Z',label:'全圖 ZOOM'},
  {command:'text',key:'T',label:'文字 TEXT'},
  {command:'linearDimension',key:'DLI',label:'線性尺寸 DIMLINEAR'},
  {command:'alignedDimension',key:'DAL',label:'對齊尺寸 DIMALIGNED'},
  {command:'block',key:'B',label:'建立圖塊 BLOCK'},
  {command:'insert',key:'I',label:'插入圖塊 INSERT'},
  {command:'explode',key:'X',label:'分解圖塊 EXPLODE'},
] as const satisfies readonly {command:CadCommand;key:string;label:string}[]
export type EditableCommand = (typeof EDITABLE_SHORTCUTS)[number]['command']
export type CommandOverrides = Partial<Record<EditableCommand,string>>

/** Customized aliases replace the primary short alias. Long-form CAD commands
 * continue to work. Built-ins belonging to another command cannot be remapped.
 */
export function findCommand(raw:string,overrides:CommandOverrides={}):CadCommand|null{
  const key=raw.trim().toUpperCase()
  if(!key)return null
  const assigned=EDITABLE_SHORTCUTS.find(item=>overrides[item.command]?.toUpperCase()===key)
  if(assigned)return assigned.command
  const builtIn=aliases[key]
  if(!builtIn)return null
  const former=EDITABLE_SHORTCUTS.find(item=>
    item.command===builtIn&&item.key===key&&
    overrides[item.command]&&overrides[item.command]?.toUpperCase()!==key)
  return former?null:builtIn
}

/** Returns millimetres; bare numbers use the user's INPUT unit, not model units.
 * Exposed suffixes always override the preference: 12.34cm = 123.4mm.
 */
export function parseLengthInput(raw:string,defaultUnit:InputUnit='mm'):number|null{
  const value=raw.trim().replace(/\s+/g,'').toLowerCase()
  const match=/^(-?(?:\d+(?:\.\d*)?|\.\d+))(mm|cm|m|毫米|公分|公尺)?$/.exec(value)
  if(!match)return null
  const multiplier=match[2]==='mm'||match[2]==='毫米'?1
    :match[2]==='cm'||match[2]==='公分'?10
    :match[2]==='m'||match[2]==='公尺'?1000:unitToMm(defaultUnit)
  const result=Number(match[1])*multiplier
  return Number.isFinite(result)&&Math.abs(result)<=1e12
    ?Math.round(result*1000)/1000:null
}
const LENGTH='-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:mm|cm|m|毫米|公分|公尺)?'
const pair=new RegExp('^(@)?('+LENGTH+'),('+LENGTH+')$','i')
const polar=new RegExp('^@?('+LENGTH+')<(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))

/** CAD coordinates: X,Y / @DX,DY / @DIST<ANGLE / scalar in cursor direction.
 * World geometry is always mm; only bare command-line input is configurable.
 */
export function parsePointInput(input:string,base:Point|null,cursor:Point,defaultUnit:InputUnit='mm'):Point|null{
  const value=input.trim().replace(/\s+/g,'')
  const xy=pair.exec(value)
  if(xy){
    const x=parseLengthInput(xy[2],defaultUnit),y=parseLengthInput(xy[3],defaultUnit)
    if(x===null||y===null||(xy[1]&&!base))return null
    return roundPoint({x:x+(xy[1]?base!.x:0),y:y+(xy[1]?base!.y:0)})
  }
  const polarMatch=polar.exec(value)
  if(polarMatch&&base){
    const length=parseLengthInput(polarMatch[1],defaultUnit)
    if(length===null)return null
    const angle=Number(polarMatch[2])*Math.PI/180
    return roundPoint({x:base.x+Math.cos(angle)*length,y:base.y+Math.sin(angle)*length})
  }
  if(base){
    const length=parseLengthInput(value,defaultUnit)
    if(length!==null){
      const angle=Math.atan2(cursor.y-base.y,cursor.x-base.x)
      return roundPoint({x:base.x+Math.cos(angle)*length,y:base.y+Math.sin(angle)*length})
    }
  }
  return null
}
,'i')

/** CAD coordinates: X,Y / @DX,DY / @DIST<ANGLE / scalar in cursor direction.
 * World geometry is always mm; only bare command-line input is configurable.
 */
export function parsePointInput(input:string,base:Point|null,cursor:Point,defaultUnit:InputUnit='mm'):Point|null{
  const value=input.trim().replace(/\s+/g,'')
  const xy=pair.exec(value)
  if(xy){
    const x=parseLengthInput(xy[2],defaultUnit),y=parseLengthInput(xy[3],defaultUnit)
    if(x===null||y===null||(xy[1]&&!base))return null
    return roundPoint({x:x+(xy[1]?base!.x:0),y:y+(xy[1]?base!.y:0)})
  }
  const polarMatch=polar.exec(value)
  if(polarMatch&&base){
    const length=parseLengthInput(polarMatch[1],defaultUnit)
    if(length===null)return null
    const angle=Number(polarMatch[2])*Math.PI/180
    return roundPoint({x:base.x+Math.cos(angle)*length,y:base.y+Math.sin(angle)*length})
  }
  if(base){
    const length=parseLengthInput(value,defaultUnit)
    if(length!==null){
      const angle=Math.atan2(cursor.y-base.y,cursor.x-base.x)
      return roundPoint({x:base.x+Math.cos(angle)*length,y:base.y+Math.sin(angle)*length})
    }
  }
  return null
}
