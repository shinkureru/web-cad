import { arcExtents, arcPoint, arcSweep } from './arcs'
import { formatDimension } from './annotations'
import type {
  ArcEntity, CadEntity, CurveDimensionEntity, CurveMeasure,
  DimensionStyle, Point
} from './types'

export interface CurveArc {center:Point;radius:number;startAngle:number;endAngle:number}
export interface CurveDimensionPicture {
  lines:{a:Point;b:Point}[]
  arcs:CurveArc[]
  arrowheads:[Point,Point,Point][]
  label:{position:Point;rotation:number;text:string;height:number}
  measured:number
}
const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y})
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const times=(a:Point,k:number):Point=>({x:a.x*k,y:a.y*k})
const norm=(a:Point):Point=>{const d=Math.hypot(a.x,a.y);return d>1e-8?times(a,1/d):{x:1,y:0}}
const polar=(center:Point,radius:number,degrees:number):Point=>({
  x:center.x+radius*Math.cos(degrees*Math.PI/180),
  y:center.y+radius*Math.sin(degrees*Math.PI/180)
})
const tangent=(degrees:number):Point=>({x:-Math.sin(degrees*Math.PI/180),y:Math.cos(degrees*Math.PI/180)})
const triangle=(tip:Point,into:Point,requested:number):[Point,Point,Point]=>{
  const unit=norm(into),perp={x:-unit.y,y:unit.x}
  const size=Math.max(.001,requested)
  const base=add(tip,times(unit,size))
  return [tip,add(base,times(perp,size*.23)),add(base,times(perp,-size*.23))]
}
export function makeCurveDimension(
  source:CadEntity,measure:CurveMeasure,placement:Point,
  id:string,layerId:string,styleId:string
):CurveDimensionEntity {
  if(source.kind!=='circle'&&source.kind!=='arc')throw new Error('請先選取圓或圓弧')
  if((measure==='angle'||measure==='arcLength')&&source.kind!=='arc')
    throw new Error('角度與弧長只適用於原生 ARC 圓弧')
  if(!Number.isFinite(source.radius)||source.radius<=0||source.radius>1e9
    ||![placement.x,placement.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))
    throw new Error('圓形標註的半徑或位置不合法')
  const arc=source.kind==='arc'?{
    startAngle:source.startAngle,endAngle:source.endAngle
  }:{}
  return {
    kind:'curveDimension',id,layerId,measure,
    center:{...source.center},radius:source.radius,
    placement:{...placement},styleId,
    ...((measure==='arcLength'||measure==='angle')?arc:{})
  }
}
export function curveDimensionPicture(dim:CurveDimensionEntity,
  style:DimensionStyle):CurveDimensionPicture {
  const c=dim.center,r=dim.radius
  const lines:{a:Point;b:Point}[]=[]
  const arcs:CurveArc[]=[]
  const arrowheads:[Point,Point,Point][]=[]
  let measured=0,position:Point
  if(dim.measure==='radius'||dim.measure==='diameter'){
    const toward=norm(sub(dim.placement,c))
    const edge=add(c,times(toward,r))
    const other=add(c,times(toward,-r))
    measured=dim.measure==='diameter'?r*2:r
    if(dim.measure==='radius'){
      lines.push({a:c,b:edge})
      arrowheads.push(triangle(edge,times(toward,-1),Math.min(style.arrowSize,r*.35)))
    }else{
      lines.push({a:other,b:edge})
      const arrowSize=Math.min(style.arrowSize,r*.35)
      arrowheads.push(triangle(edge,times(toward,-1),arrowSize))
      arrowheads.push(triangle(other,toward,arrowSize))
    }
    // A separate leader allows the dimension value to sit outside a crowded circle.
    if(Math.hypot(dim.placement.x-edge.x,dim.placement.y-edge.y)>.001)
      lines.push({a:edge,b:dim.placement})
    position=add(dim.placement,times({x:-toward.y,y:toward.x},
      style.textGap+style.textHeight*.6))
  }else{
    if(dim.startAngle===undefined||dim.endAngle===undefined)
      throw new Error('圓弧尺寸缺少起訖角度')
    const span=arcSweep({startAngle:dim.startAngle,endAngle:dim.endAngle})
    measured=dim.measure==='angle'?span:r*span*Math.PI/180
    const placedRadius=Math.hypot(dim.placement.x-c.x,dim.placement.y-c.y)
    const dimensionRadius=Math.max(style.arrowSize*2,r*.25,placedRadius)
    const start=polar(c,dimensionRadius,dim.startAngle)
    const end=polar(c,dimensionRadius,dim.endAngle)
    const first=polar(c,r,dim.startAngle),last=polar(c,r,dim.endAngle)
    arcs.push({center:c,radius:dimensionRadius,
      startAngle:dim.startAngle,endAngle:dim.endAngle})
    if(Math.abs(dimensionRadius-r)>.001){
      lines.push({a:first,b:start},{a:last,b:end})
    }
    const arrowSize=Math.min(style.arrowSize,Math.max(.5,dimensionRadius*span*Math.PI/180*.2))
    arrowheads.push(triangle(start,tangent(dim.startAngle),arrowSize))
    arrowheads.push(triangle(end,times(tangent(dim.endAngle),-1),arrowSize))
    const mid=dim.startAngle+span/2
    position=polar(c,dimensionRadius+style.textGap+style.textHeight*.65,mid)
  }
  const labelText=dim.measure==='angle'
    ?measured.toFixed(style.precision)+'°'
    :(dim.measure==='radius'?'R':dim.measure==='diameter'?'Ø': '⌒')+
      formatDimension(measured,style)
  return {lines,arcs,arrowheads,measured,
    label:{position,rotation:0,height:style.textHeight,text:labelText}}
}
/** Ink bounds (with conservative font extents) for PLOT, ZOOM and selection. */
export function curveDimensionExtents(dim:CurveDimensionEntity,style:DimensionStyle):Point[]{
  const picture=curveDimensionPicture(dim,style)
  const pts=[
    ...picture.lines.flatMap(s=>[s.a,s.b]),...picture.arrowheads.flat(),
    ...picture.arcs.flatMap(a=>arcExtents({...a,kind:'arc',id:dim.id,layerId:dim.layerId} as ArcEntity))
  ]
  const text=picture.label
  const half=Math.max(text.height*.5,text.text.length*text.height*.4)
  pts.push({x:text.position.x-half,y:text.position.y-text.height},
    {x:text.position.x+half,y:text.position.y+text.height})
  return pts
}
