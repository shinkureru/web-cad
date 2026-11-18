/** Exact model-space circular arcs in millimetres, CCW in world coordinates.
 * Native DXF ARC uses degrees from +X; sweep is (end-start+360)%360.
 * No zero-sweep or full-circle arcs (use CIRCLE for full circles).
 */
import type { ArcEntity, CadPrimitive, Point } from './types'
const DEG = Math.PI / 180
const EPS = 1e-8
const rounded=(n:number)=>Math.round(n*1000)/1000
const roundedPoint=(p:Point):Point=>({x:rounded(p.x),y:rounded(p.y)})
export const normalizeAngle=(degrees:number):number=>((degrees%360)+360)%360
export const arcSweep=(arc:Pick<ArcEntity,'startAngle'|'endAngle'>):number=>
  normalizeAngle(arc.endAngle-arc.startAngle)
export function arcAt(arc:Pick<ArcEntity,'center'|'radius'|'startAngle'>,tDegrees:number):Point{
  const a=tDegrees*DEG
  const x=arc.radius*Math.cos(a),y=arc.radius*Math.sin(a)
  // Remove floating-point dust at the cardinal angles; preserves exact bounds.
  return {x:arc.center.x+(Math.abs(x)<arc.radius*1e-12?0:x),
    y:arc.center.y+(Math.abs(y)<arc.radius*1e-12?0:y)}
}
export function arcPoint(arc:ArcEntity,fraction:number):Point{
  return arcAt(arc,arc.startAngle+arcSweep(arc)*fraction)
}
export function arcContainsAngle(arc:ArcEntity,angle:number,tolerance=1e-7):boolean{
  return normalizeAngle(angle-arc.startAngle)<=arcSweep(arc)+tolerance
}
export function pointOnArc(arc:ArcEntity,p:Point,tolerance=.002):boolean{
  const r=Math.hypot(p.x-arc.center.x,p.y-arc.center.y)
  return Math.abs(r-arc.radius)<=tolerance && arcContainsAngle(arc,Math.atan2(p.y-arc.center.y,p.x-arc.center.x)/DEG,tolerance/arc.radius/DEG)
}
export function arcExtents(arc:ArcEntity):Point[]{
  return [arcPoint(arc,0),arcPoint(arc,1),...[0,90,180,270].filter(a=>arcContainsAngle(arc,a))
    .map(a=>arcAt(arc,a))]
}
export function arcDistance(p:Point,arc:ArcEntity):number{
  const angle=Math.atan2(p.y-arc.center.y,p.x-arc.center.x)/DEG
  const r=Math.hypot(p.x-arc.center.x,p.y-arc.center.y)
  if(arcContainsAngle(arc,angle))return Math.abs(r-arc.radius)
  return Math.min(...[arcPoint(arc,0),arcPoint(arc,1)].map(q=>Math.hypot(p.x-q.x,p.y-q.y)))
}
export function arcFromThreePoints(start:Point,onArc:Point,end:Point,id:string,layerId:string):ArcEntity{
  const u={x:onArc.x-start.x,y:onArc.y-start.y}
  const v={x:end.x-start.x,y:end.y-start.y}
  const cross=u.x*v.y-u.y*v.x
  if(Math.abs(cross)<1e-9*Math.max(1,Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)))
    throw new Error('三個圓弧點不可共線或重合')
  const u2=u.x*u.x+u.y*u.y,v2=v.x*v.x+v.y*v.y
  const localCenter={x:(u2*v.y-v2*u.y)/(2*cross),y:(u.x*v2-v.x*u2)/(2*cross)}
  const center=roundedPoint({x:start.x+localCenter.x,y:start.y+localCenter.y})
  const radius=rounded(Math.hypot(center.x-start.x,center.y-start.y))
  if(radius<.001||!Number.isFinite(radius)||radius>1e9)throw new Error('圓弧半徑不合法')
  const angle=(p:Point)=>normalizeAngle(Math.atan2(p.y-center.y,p.x-center.x)/DEG)
  const a=angle(start),m=angle(onArc),b=angle(end)
  // The middle point must lie on the chosen positive sweep.
  const first=normalizeAngle(m-a),last=normalizeAngle(b-a)
  const ccw=first>1e-7&&first<last-1e-7
  const startAngle=normalizeAngle(rounded(ccw?a:b)),endAngle=normalizeAngle(rounded(ccw?b:a))
  if(arcSweep({startAngle,endAngle})<1e-5)throw new Error('圓弧角度跨度太小')
  return {id,kind:'arc',layerId,center,radius,startAngle,endAngle}
}
export function arcSegmentIntersections(arc:ArcEntity,a:Point,b:Point):Point[]{
  const dx=b.x-a.x,dy=b.y-a.y
  const qa={x:a.x-arc.center.x,y:a.y-arc.center.y}
  const A=dx*dx+dy*dy
  if(A<EPS)return []
  const B=2*(qa.x*dx+qa.y*dy)
  const C=qa.x*qa.x+qa.y*qa.y-arc.radius*arc.radius
  const disc=B*B-4*A*C
  if(disc< -1e-7)return []
  const root=Math.sqrt(Math.max(0,disc))
  const found:Point[]=[]
  for(const t of [(-B-root)/(2*A),(-B+root)/(2*A)]){
    if(t< -1e-9||t>1+1e-9)continue
    const p={x:a.x+dx*t,y:a.y+dy*t}
    if(pointOnArc(arc,p,.005)&&!found.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.001))
      found.push(roundedPoint(p))
  }
  return found
}
export function arcCircleIntersections(arc:ArcEntity,center:Point,radius:number):Point[]{
  const delta={x:center.x-arc.center.x,y:center.y-arc.center.y}
  const d=Math.hypot(delta.x,delta.y),r=arc.radius
  if(d<1e-9||d>r+radius+1e-7||d<Math.abs(r-radius)-1e-7)return []
  const along=(r*r-radius*radius+d*d)/(2*d)
  const hh=Math.sqrt(Math.max(0,r*r-along*along))
  const mx=arc.center.x+delta.x*along/d,my=arc.center.y+delta.y*along/d
  const points=[{x:mx-delta.y*hh/d,y:my+delta.x*hh/d},
    {x:mx+delta.y*hh/d,y:my-delta.x*hh/d}]
  const found:Point[]=[]
  for(const p of points)if(pointOnArc(arc,p,.005)&&!found.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.001))
    found.push(roundedPoint(p))
  return found
}
export function arcPrimitiveIntersections(arc:ArcEntity,other:CadPrimitive):Point[]{
  if(other.kind==='circle')return arcCircleIntersections(arc,other.center,other.radius)
  if(other.kind==='arc')return arcCircleIntersections(arc,other.center,other.radius)
    .filter(p=>pointOnArc(other,p,.005))
  let points:Point[]=[]
  if(other.kind==='line')points=[other.start,other.end]
  else if(other.kind==='polyline')points=other.points
  else if(other.kind==='rectangle')points=[other.start,
    {x:other.end.x,y:other.start.y},other.end,
    {x:other.start.x,y:other.end.y},other.start]
  const hits:Point[]=[]
  for(let i=1;i<points.length;i++)for(const p of arcSegmentIntersections(arc,points[i-1],points[i])){
    if(!hits.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.001))hits.push(p)
  }
  return hits
}
/** Splits only the user's clicked span; intersection parameters are exact angles. */
export function trimArc(arc:ArcEntity,cutters:CadPrimitive[],click:Point,newId:()=>string):ArcEntity[]{
  const sweep=arcSweep(arc)
  const tValues:number[]=[]
  for(const cutter of cutters)for(const point of arcPrimitiveIntersections(arc,cutter)){
    const angle=normalizeAngle(Math.atan2(point.y-arc.center.y,point.x-arc.center.x)/DEG)
    const t=normalizeAngle(angle-arc.startAngle)/sweep
    if(t>1e-6&&t<1-1e-6&&!tValues.some(v=>Math.abs(v-t)<1e-6))tValues.push(t)
  }
  if(!tValues.length)throw new Error('圓弧與選定裁切邊界沒有可修剪的內部交點')
  const cpAngle=Math.atan2(click.y-arc.center.y,click.x-arc.center.x)/DEG
  if(arcDistance(click,arc)>Math.max(arc.radius*.2,15))
    throw new Error('請點擊靠近圓弧輪廓的待刪除區段')
  let clickT=normalizeAngle(cpAngle-arc.startAngle)/sweep
  if(clickT>1)clickT=clickT<1+1e-6?1:0
  const stops=[0,...tValues.sort((a,b)=>a-b),1]
  let removal=stops.findIndex((a,i)=>i<stops.length-1&&clickT>=a-1e-7&&clickT<=stops[i+1]+1e-7)
  if(removal<0)removal=0
  const kept:[number,number][]=[]
  if(stops[removal]>1e-6)kept.push([0,stops[removal]])
  if(stops[removal+1]<1-1e-6)kept.push([stops[removal+1],1])
  return kept.map(([a,b],i)=>({
    ...arc,id:i===0?arc.id:newId(),
    startAngle:normalizeAngle(rounded(arc.startAngle+a*sweep)),
    endAngle:normalizeAngle(rounded(arc.startAngle+b*sweep))
  }))
}
