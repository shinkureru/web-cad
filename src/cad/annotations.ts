import type { CadDocument, DimensionEntity, DimensionStyle, Point, TextEntity } from './types'

export const DEFAULT_DIMENSION_STYLES: DimensionStyle[] = [
  { id:'standard', name:'標準標註', textHeight:150, arrowSize:70, textGap:60,
    extensionGap:35, extensionBeyond:65, precision:0, suffix:'' },
  { id:'detail', name:'細部標註', textHeight:75, arrowSize:35, textGap:30,
    extensionGap:20, extensionBeyond:35, precision:1, suffix:'' },
]
export function getDimensionStyle(doc?: CadDocument, id?: string): DimensionStyle {
  const options = doc?.dimensionStyles?.length ? doc.dimensionStyles : DEFAULT_DIMENSION_STYLES
  return options.find(s=>s.id === (id ?? doc?.activeDimensionStyleId ?? 'standard')) ?? options[0]
}
export interface GeometryLine { a: Point; b: Point }
export interface DimensionGeometry {
  lines: GeometryLine[]; arrowheads: [Point,Point,Point][]
  label: { position: Point; rotation: number; text: string; height: number }
  measured: number; dimensionStart: Point; dimensionEnd: Point
}
const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y})
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const mul=(p:Point,k:number):Point=>({x:p.x*k,y:p.y*k})
const dot=(a:Point,b:Point):number=>a.x*b.x+a.y*b.y
const norm=(p:Point):Point=>{const d=Math.hypot(p.x,p.y);return d>1e-10?mul(p,1/d):{x:1,y:0}}
export function formatDimension(value:number,style:DimensionStyle):string{
  if(!Number.isFinite(value))return '—'
  return value.toFixed(style.precision) + style.suffix
}
/** This is real model-space geometry; no pixel-based text or length values are serialized. */
export function dimensionGeometry(dim: DimensionEntity, style:DimensionStyle):DimensionGeometry {
  const {start,end,placement}=dim
  let first:Point,second:Point,unit:Point,measured:number
  if(dim.mode==='aligned'){
    const baseline=sub(end,start), direction=norm(baseline), normal={x:-direction.y,y:direction.x}
    const signed=dot(sub(placement,start),normal)
    first=add(start,mul(normal,signed));second=add(end,mul(normal,signed))
    measured=Math.hypot(baseline.x,baseline.y)
  }else if(dim.axis==='vertical'){
    first={x:placement.x,y:start.y};second={x:placement.x,y:end.y}
    measured=Math.abs(end.y-start.y)
  }else{
    first={x:start.x,y:placement.y};second={x:end.x,y:placement.y}
    measured=Math.abs(end.x-start.x)
  }
  unit=norm(sub(second,first))
  const normal={x:-unit.y,y:unit.x}
  const offsetFromStart=sub(first,start), offsetFromEnd=sub(second,end)
  const extension=(source:Point,projection:Point,displacement:Point):GeometryLine=>{
    const length=Math.hypot(displacement.x,displacement.y)
    const toward=norm(displacement)
    return {a:add(source,mul(toward,Math.min(style.extensionGap,length))),
      b:add(projection,mul(toward,style.extensionBeyond))}
  }
  const middle=mul(add(first,second),.5)
  const labelPosition=add(middle,mul(normal,style.textGap+style.textHeight*.7))
  const lineVector=sub(second,first)
  const available=Math.hypot(lineVector.x,lineVector.y)
  const arrowSize=Math.min(style.arrowSize,available*.22)
  const arrow=(tip:Point,toward:Point):[Point,Point,Point]=>{
    const back=add(tip,mul(toward,arrowSize))
    return [tip,add(back,mul(normal,arrowSize*.22)),add(back,mul(normal,-arrowSize*.22))]
  }
  let rotation=Math.atan2(unit.y,unit.x)*180/Math.PI
  if(rotation>90 || rotation<=-90)rotation+=180
  return {
    lines:[extension(start,first,offsetFromStart),extension(end,second,offsetFromEnd),{a:first,b:second}],
    arrowheads:[arrow(first,unit),arrow(second,mul(unit,-1))],
    label:{position:labelPosition,rotation,text:formatDimension(measured,style),height:style.textHeight},
    measured,dimensionStart:first,dimensionEnd:second,
  }
}
export function entityExtentPoints(entity:TextEntity|DimensionEntity,style:DimensionStyle):Point[]{
  if(entity.kind==='dimension'){
    const geo=dimensionGeometry(entity,style)
    return [...geo.lines.flatMap(s=>[s.a,s.b]),geo.label.position]
  }
  const lines=entity.text.split(String.fromCharCode(10))
  const width=Math.max(...lines.map(line=>[...line].length*entity.height*.72))
  const a=entity.rotation*Math.PI/180
  const rotate=(x:number,y:number):Point=>({x:entity.position.x+x*Math.cos(a)-y*Math.sin(a),
    y:entity.position.y+x*Math.sin(a)+y*Math.cos(a)})
  const lowest=-(lines.length-1)*entity.height*1.3-entity.height*.5
  return [rotate(0,entity.height*.5),rotate(width,entity.height*.5),rotate(0,lowest),rotate(width,lowest)]
}
