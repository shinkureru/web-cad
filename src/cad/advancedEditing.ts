/**
 * v0.8.0 finite-boundary EXTEND, two-line FILLET/CHAMFER and CAD window selection.
 *
 * No DWG/ARC promises: FILLET creates a discretized polyline with a maximum
 * chordal deviation and stays editable in the existing native JSON/DXF subset.
 */
import { distance, entitySegments, roundPoint, hitTest } from './geometry'
import { expandEntity } from './blocks'
import { entityExtentPoints, getDimensionStyle } from './annotations'
import type { CadDocument, CadEntity, CadDisplayEntity, CadPrimitive, LineEntity, Point } from './types'

const EPS = 1e-8
const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y})
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const mul=(a:Point,k:number):Point=>({x:a.x*k,y:a.y*k})
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y
const norm=(a:Point):Point=>{const d=Math.hypot(a.x,a.y);if(d<EPS)throw new Error('不可編輯零長度線段');return mul(a,1/d)}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
const finite=(v:number)=>Number.isFinite(v)&&v>=0&&v<=1e6
const validLine=(entity:CadEntity|undefined):entity is LineEntity=>!!entity&&entity.kind==='line'&&distance(entity.start,entity.end)>1e-6
const editable=(doc:CadDocument,entity:CadEntity)=>{
  const layer=doc.layers.find(l=>l.id===entity.layerId)
  if(!layer?.visible||layer.locked)throw new Error('圖層已鎖定或隱藏，禁止修改物件')
}
/** Exact intersection of infinite supporting lines, independent of direction. */
export function infiniteIntersection(a:LineEntity,b:LineEntity):Point|null{
  const r=sub(a.end,a.start),s=sub(b.end,b.start),den=cross(r,s)
  if(Math.abs(den)<1e-10*Math.hypot(r.x,r.y)*Math.hypot(s.x,s.y))return null
  return add(a.start,mul(r,cross(sub(b.start,a.start),s)/den))
}
type RayHit={t:number;point:Point}
function raySegment(origin:Point,direction:Point,a:Point,b:Point):RayHit|null{
  const v=sub(b,a),den=cross(direction,v)
  if(Math.abs(den)<1e-10*Math.max(1,Math.hypot(v.x,v.y)))return null
  const delta=sub(a,origin),t=cross(delta,v)/den,u=cross(delta,direction)/den
  if(t<=.001||u< -1e-8||u>1+1e-8)return null
  return {t,point:roundPoint(add(origin,mul(direction,t)))}
}
function rayCircle(origin:Point,direction:Point,center:Point,radius:number):RayHit[]{
  const delta=sub(origin,center),b=2*dot(delta,direction),c=dot(delta,delta)-radius*radius
  const disc=b*b-4*c
  if(disc<0)return []
  const root=Math.sqrt(Math.max(0,disc))
  return [...new Set([(-b-root)/2,(-b+root)/2].filter(t=>t>.001))]
    .map(t=>({t,point:roundPoint(add(origin,mul(direction,t)))}))
}
/** Extend the clicked endpoint of an existing LINE to the closest finite boundary. */
export function extendLine(doc:CadDocument,boundaryIds:string[],targetId:string,pick:Point):CadDocument{
  if(!boundaryIds.length)throw new Error('請先選擇至少一個延伸邊界')
  if(boundaryIds.includes(targetId))throw new Error('目標不能同時是延伸邊界')
  const target=doc.entities.find(e=>e.id===targetId)
  if(!validLine(target))throw new Error('EXTEND 目前僅支援非零長度 LINE')
  editable(doc,target)
  const atStart=distance(pick,target.start)<=distance(pick,target.end)
  const origin=atStart?target.start:target.end
  const other=atStart?target.end:target.start
  const direction=norm(sub(origin,other))
  const hits:RayHit[]=[]
  for(const id of boundaryIds){
    const source=doc.entities.find(e=>e.id===id)
    if(!source)throw new Error('延伸邊界已不存在')
    const layer=doc.layers.find(l=>l.id===source.layerId)
    if(!layer?.visible)throw new Error('延伸邊界所在圖層不可見')
    for(const primitive of expandEntity(source,doc)){
      if(primitive.kind==='circle')hits.push(...rayCircle(origin,direction,primitive.center,primitive.radius))
      else for(const segment of entitySegments(primitive)){
        const hit=raySegment(origin,direction,segment.a,segment.b)
        if(hit)hits.push(hit)
      }
    }
  }
  hits.sort((a,b)=>a.t-b.t)
  if(!hits.length)throw new Error('在目標端點延伸方向上找不到有限邊界交點')
  const point=hits[0].point
  if(distance(point,origin)<.001)throw new Error('延伸後線段長度未改變')
  const updated:LineEntity=atStart?{...target,start:point}:{...target,end:point}
  return {...doc,entities:doc.entities.map(e=>e.id===target.id?updated:e)}
}
type Adjacent={near:'start'|'end';far:Point;ray:Point;maximum:number}
function towardCorner(line:LineEntity,corner:Point):Adjacent{
  const d1=distance(line.start,corner),d2=distance(line.end,corner)
  // An interior crossing has two valid removal sides; fail instead of guessing.
  const vector=sub(line.end,line.start),length=Math.hypot(vector.x,vector.y)
  const t=dot(sub(corner,line.start),vector)/(length*length)
  if(t>1e-5&&t<1-1e-5&&hitTest(corner,line)<.001)
    throw new Error('兩條線在內部交叉，請先 TRIM 成端點後再倒角／圓角')
  const near=d1<=d2?'start':'end'
  const far=near==='start'?line.end:line.start
  const maximum=distance(far,corner)
  if(maximum<.001)throw new Error('線段距交角過近，無法建立倒角')
  return {near,far,ray:norm(sub(far,corner)),maximum}
}
const replaceNear=(line:LineEntity,near:'start'|'end',newPoint:Point):LineEntity=>
  near==='start'?{...line,start:roundPoint(newPoint)}:{...line,end:roundPoint(newPoint)}
export type CornerMode='fillet'|'chamfer'
export interface CornerPreview {a:LineEntity;b:LineEntity;connector:CadPrimitive|null;corner:Point}
/**
 * A circular fillet is tessellated into short POLYLINE chords (<= ~0.1 mm
 * sagitta before rounding, maximum 256 pieces) because native ARC is not yet
 * in the model; exporting DXF keeps this as LWPOLYLINE, not a true ARC.
 */
export function cornerGeometry(first:LineEntity,second:LineEntity,mode:CornerMode,
  d1:number,d2=d1,connectorId='corner'):CornerPreview{
  if(first.id===second.id)throw new Error('請選兩條不同的直線')
  if(!finite(d1)||!finite(d2))throw new Error('半徑／倒角距離須介於 0–1,000,000 mm')
  if(distance(first.start,first.end)<.001||distance(second.start,second.end)<.001)
    throw new Error('不可對零長度直線倒角')
  const intersection=infiniteIntersection(first,second)
  if(!intersection)throw new Error('兩直線平行或重合，無法建立圓角／倒角')
  const aa=towardCorner(first,intersection),bb=towardCorner(second,intersection)
  const cosine=clamp(dot(aa.ray,bb.ray),-1,1)
  const angle=Math.acos(cosine)
  if(angle<1e-5||Math.PI-angle<1e-5)throw new Error('轉角過小或接近平角')
  const travel1=mode==='fillet'&&d1>0?d1/Math.tan(angle/2):d1
  const travel2=mode==='fillet'&&d1>0?travel1:d2
  if(travel1>aa.maximum+.001||travel2>bb.maximum+.001)
    throw new Error('線段不足以容納指定圓角／倒角距離')
  const tangent1=roundPoint(add(intersection,mul(aa.ray,travel1)))
  const tangent2=roundPoint(add(intersection,mul(bb.ray,travel2)))
  if(distance(tangent1,aa.far)<.001||distance(tangent2,bb.far)<.001)
    throw new Error('操作將使原線段消失，請減小距離')
  const a=replaceNear(first,aa.near,tangent1),b=replaceNear(second,bb.near,tangent2)
  let connector:CadPrimitive|null=null
  if(distance(tangent1,tangent2)>.001){
    if(mode==='chamfer'){
      connector={id:connectorId,kind:'line',layerId:first.layerId,
        color:first.color,lineweight:first.lineweight,linetype:first.linetype,
        start:tangent1,end:tangent2}
    }else{
      const bisector=norm(add(aa.ray,bb.ray))
      const center=add(intersection,mul(bisector,d1/Math.sin(angle/2)))
      const start=Math.atan2(tangent1.y-center.y,tangent1.x-center.x)
      const end=Math.atan2(tangent2.y-center.y,tangent2.x-center.x)
      let sweep=end-start
      while(sweep>Math.PI)sweep-=2*Math.PI
      while(sweep< -Math.PI)sweep+=2*Math.PI
      const radius=d1
      const maxStep=2*Math.acos(clamp(1-Math.min(.1,radius/2)/radius,-1,1))
      const count=Math.min(256,Math.max(8,Math.ceil(Math.abs(sweep)/maxStep)))
      const points=Array.from({length:count+1},(_,i)=>{
        if(i===0)return tangent1
        if(i===count)return tangent2
        const theta=start+sweep*i/count
        return roundPoint({x:center.x+radius*Math.cos(theta),y:center.y+radius*Math.sin(theta)})
      })
      if(points.some((pt,i)=>i>0&&distance(pt,points[i-1])<.0005))
        throw new Error('半徑太小，0.001 mm 幾何精度無法生成圓弧')
      connector={id:connectorId,kind:'polyline',layerId:first.layerId,
        color:first.color,lineweight:first.lineweight,linetype:first.linetype,points}
    }
  }
  return {a,b,connector,corner:roundPoint(intersection)}
}
export function joinLines(doc:CadDocument,ids:[string,string],mode:CornerMode,
  d1:number,d2:number,newId:string):CadDocument{
  if(ids[0]===ids[1]||doc.entities.some(e=>e.id===newId))throw new Error('線段或新圖元 ID 無效')
  const a=doc.entities.find(e=>e.id===ids[0]),b=doc.entities.find(e=>e.id===ids[1])
  if(!validLine(a)||!validLine(b))throw new Error('FILLET／CHAMFER 目前只接受兩條 LINE')
  editable(doc,a);editable(doc,b)
  const result=cornerGeometry(a,b,mode,d1,d2,newId)
  return {...doc,entities:[
    ...doc.entities.map(e=>e.id===a.id?result.a:e.id===b.id?result.b:e),
    ...(result.connector?[result.connector]:[])
  ]}
}
export type SelectionMode='window'|'crossing'
export interface WindowRect {minX:number;minY:number;maxX:number;maxY:number}
export const selectionRectangle=(a:Point,b:Point):WindowRect=>({
  minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),
  minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)
})
const inside=(p:Point,r:WindowRect)=>p.x>=r.minX-EPS&&p.x<=r.maxX+EPS&&p.y>=r.minY-EPS&&p.y<=r.maxY+EPS
const corners=(r:WindowRect):Point[]=>[
  {x:r.minX,y:r.minY},{x:r.maxX,y:r.minY},
  {x:r.maxX,y:r.maxY},{x:r.minX,y:r.maxY}
]
const rectEdges=(r:WindowRect)=>{const pts=corners(r);return pts.map((a,i)=>({a,b:pts[(i+1)%4]}))}
function pointOnSegmentRect(a:Point,b:Point,r:WindowRect):boolean{
  if(inside(a,r)||inside(b,r))return true
  const v=sub(b,a)
  for(const edge of rectEdges(r)){
    const s=sub(edge.b,edge.a),den=cross(v,s)
    if(Math.abs(den)<1e-10)continue
    const diff=sub(edge.a,a)
    const t=cross(diff,s)/den,u=cross(diff,v)/den
    if(t>= -EPS&&t<=1+EPS&&u>= -EPS&&u<=1+EPS)return true
  }
  return false
}
function hitsCircle(center:Point,radius:number,box:WindowRect,mode:SelectionMode){
  if(mode==='window')return center.x-radius>=box.minX-EPS&&center.x+radius<=box.maxX+EPS
    &&center.y-radius>=box.minY-EPS&&center.y+radius<=box.maxY+EPS
  const closest={x:clamp(center.x,box.minX,box.maxX),y:clamp(center.y,box.minY,box.maxY)}
  const furthest=Math.max(...corners(box).map(p=>distance(p,center)))
  return distance(center,closest)<=radius+EPS && furthest>=radius-EPS
}
function selectedDisplay(entity:CadDisplayEntity,doc:CadDocument,box:WindowRect,mode:SelectionMode):boolean{
  if(entity.kind==='circle')return hitsCircle(entity.center,entity.radius,box,mode)
  let points:Point[]=[]
  if(entity.kind==='line')points=[entity.start,entity.end]
  else if(entity.kind==='polyline')points=entity.points
  else if(entity.kind==='rectangle')points=[
    entity.start,{x:entity.end.x,y:entity.start.y},entity.end,
    {x:entity.start.x,y:entity.end.y},entity.start]
  else if(entity.kind==='text'||entity.kind==='dimension'){
    points=entityExtentPoints(entity,getDimensionStyle(doc,entity.kind==='dimension'?entity.styleId:undefined))
  }
  if(mode==='window')return points.length>0&&points.every(p=>inside(p,box))
  if(points.some(p=>inside(p,box)))return true
  return points.slice(1).some((p,i)=>pointOnSegmentRect(points[i],p,box))
}
/** L→R requires full containment; R→L selects any geometry crossing the window. */
export function windowSelection(doc:CadDocument,a:Point,b:Point):string[]{
  const mode:SelectionMode=a.x<=b.x?'window':'crossing'
  const box=selectionRectangle(a,b)
  if(box.maxX-box.minX<1e-6||box.maxY-box.minY<1e-6)return []
  return doc.entities.filter(e=>{
    const layer=doc.layers.find(l=>l.id===e.layerId)
    if(!layer?.visible||layer.locked)return false
    return expandEntity(e,doc).some(part=>selectedDisplay(part,doc,box,mode))
  }).map(e=>e.id)
}
