import { distance, entitySegments, roundPoint, segmentCircleIntersections, segmentIntersection } from './geometry'
import { expandEntity } from './blocks'
import type { CadDocument, CadEntity, CadPrimitive, LineEntity, Point, PolylineEntity } from './types'

/**
 * v0.7.0 editing subset:
 * OFFSET: 2D straight line, circle, simple open/closed polyline and axis-aligned rectangle.
 * TRIM: finite straight segments/open polylines against explicitly selected edges.
 * Every operation is nondestructive until the document reducer commits a single undo step.
 */
const EPS = 1e-6
const V=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y})
const mult=(a:Point,k:number):Point=>({x:a.x*k,y:a.y*k})
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
const len=(p:Point)=>Math.hypot(p.x,p.y)
const eq=(a:Point,b:Point)=>distance(a,b)<.001
const lerp=(a:Point,b:Point,t:number)=>roundPoint(add(a,mult(V(b,a),t)))
const isClosed=(points:Point[])=>points.length>=4&&eq(points[0],points.at(-1)!)
const layerEditable=(doc:CadDocument,entity:CadEntity)=>{
  const layer=doc.layers.find(x=>x.id===entity.layerId)
  if(!layer?.visible||layer.locked)throw new Error('物件所在圖層已鎖定或隱藏，不能編輯。')
}
function nearestSegment(points:Point[],click:Point){
  let best=Infinity, index=0
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],v=V(b,a),l2=dot(v,v)
    if(l2<EPS*EPS)continue
    const t=Math.max(0,Math.min(1,dot(V(click,a),v)/l2))
    const d=distance(click,add(a,mult(v,t)))
    if(d<best){best=d;index=i}
  }
  return index
}
function parallelOffset(a:Point,b:Point,d:number){
  const v=V(b,a),length=len(v)
  if(length<EPS)throw new Error('輪廓存在長度為零的線段，無法偏移。')
  return mult({x:-v.y/length,y:v.x/length},d)
}
function lineIntersectionInfinite(a:Point,b:Point,c:Point,d:Point):Point|null{
  const r=V(b,a),s=V(d,c),denom=cross(r,s)
  if(Math.abs(denom)<1e-10*len(r)*len(s))return null
  return add(a,mult(r,cross(V(c,a),s)/denom))
}
function offsetPath(points:Point[],signed:number,closed:boolean):Point[]{
  if(points.length<(closed?4:2))throw new Error('聚合線至少要有兩段或有效封閉輪廓。')
  const vertices=closed?points.slice(0,-1):points
  const result:Point[]=[]
  // Work only with finite non-degenerate segments and modest miter joins.
  for(let i=0;i<vertices.length-1;i++)if(distance(vertices[i],vertices[i+1])<EPS)
    throw new Error('聚合線包含零長線段，請清理後偏移。')
  if(closed&&distance(vertices.at(-1)!,vertices[0])<EPS)
    throw new Error('封閉輪廓包含零長線段，請清理後偏移。')
  for(let i=0;i<vertices.length;i++){
    const current=vertices[i]
    if(!closed && (i===0||i===vertices.length-1)){
      const other=i===0?vertices[1]:vertices[i-1]
      const shift=i===0?parallelOffset(current,other,signed):parallelOffset(other,current,signed)
      result.push(roundPoint(add(current,shift)));continue
    }
    const before=vertices[(i-1+vertices.length)%vertices.length]
    const after=vertices[(i+1)%vertices.length]
    const left=parallelOffset(before,current,signed)
    const right=parallelOffset(current,after,signed)
    const meet=lineIntersectionInfinite(add(before,left),add(current,left),
      add(current,right),add(after,right))
    if(!meet){
      const forward=V(current,before),backward=V(after,current)
      if(dot(forward,backward)<0)throw new Error('聚合線含 180° 折返，不支援偏移。')
      result.push(roundPoint(add(current,left)));continue
    }
    if(distance(meet,current)>Math.abs(signed)*8+EPS)
      throw new Error('偏移造成尖角過長，請修改輪廓或縮小偏移距離。')
    result.push(roundPoint(meet))
  }
  if(closed)result.push({...result[0]})
  if(result.some((p,i)=>i>0&&eq(p,result[i-1])))throw new Error('偏移造成重疊點，請調整距離。')
  // Avoid silently producing self-crossing paths.
  for(let i=0;i<result.length-1;i++)for(let j=i+2;j<result.length-1;j++){
    if(closed&&i===0&&j===result.length-2)continue
    if(segmentIntersection({a:result[i],b:result[i+1]},{a:result[j],b:result[j+1]}))
      throw new Error('偏移後輪廓自交，已取消以保護圖面。')
  }
  return result
}
function candidateLine(entity:LineEntity,distanceMm:number,side:Point):LineEntity{
  const signed=cross(V(entity.end,entity.start),V(side,entity.start))>=0?distanceMm:-distanceMm
  const shift=parallelOffset(entity.start,entity.end,signed)
  return {...entity,start:roundPoint(add(entity.start,shift)),end:roundPoint(add(entity.end,shift))}
}
export function offsetEntity(entity:CadEntity,offset:number,side:Point):CadPrimitive {
  if(!Number.isFinite(offset)||offset<=0||offset>1000000)throw new Error('偏移距離需大於 0 且不超過 1,000,000 mm。')
  if(!Number.isFinite(side.x)||!Number.isFinite(side.y))throw new Error('請指定有效的偏移方向。')
  if(entity.kind==='line')return candidateLine(entity,offset,side)
  if(entity.kind==='circle'){
    const signed=distance(side,entity.center)>=entity.radius?offset:-offset
    const radius=entity.radius+signed
    if(radius<EPS)throw new Error('偏移後圓半徑必須大於零。')
    return {...entity,radius:Number(radius.toFixed(3))}
  }
  if(entity.kind==='rectangle'||entity.kind==='polyline'){
    const points:Point[]=entity.kind==='rectangle' ? [
      entity.start,{x:entity.end.x,y:entity.start.y},entity.end,
      {x:entity.start.x,y:entity.end.y},entity.start] : entity.points
    const index=nearestSegment(points,side)
    const a=points[index],b=points[index+1]
    const signed=cross(V(b,a),V(side,a))>=0?offset:-offset
    const closed=entity.kind==='rectangle'||isClosed(points)
    const shifted=offsetPath(points,signed,closed)
    return {id:entity.id,kind:'polyline',layerId:entity.layerId,points:shifted,
      color:entity.color,lineweight:entity.lineweight,linetype:entity.linetype}
  }
  throw new Error('OFFSET 目前僅支援直線、圓、矩形和直線段聚合線；圖塊及標註不支援。')
}
export function offsetDocument(doc:CadDocument,sourceId:string,distanceMm:number,side:Point,newId:string):CadDocument{
  const source=doc.entities.find(e=>e.id===sourceId)
  if(!source)throw new Error('找不到要偏移的物件。')
  layerEditable(doc,source)
  if(doc.entities.some(e=>e.id===newId))throw new Error('新物件 ID 重複。')
  const shifted=offsetEntity(source,distanceMm,side)
  return {...doc,entities:[...doc.entities,{...shifted,id:newId}]}
}
function cutValues(target:{a:Point;b:Point},cutters:CadPrimitive[]):number[]{
  const v=V(target.b,target.a),v2=dot(v,v)
  if(v2<EPS*EPS)return []
  const values:number[]=[]
  const addPoint=(hit:Point)=>{
    const t=dot(V(hit,target.a),v)/v2
    if(t>EPS && t<1-EPS&&!values.some(old=>Math.abs(old-t)<.000001))
      values.push(t)
  }
  for(const cutter of cutters){
    if(cutter.kind==='circle'){
      for(const hit of segmentCircleIntersections(target,cutter.center,cutter.radius))addPoint(hit)
    }else{
      for(const seg of entitySegments(cutter)){
        const hit=segmentIntersection(target,seg)
        if(hit)addPoint(hit)
      }
    }
  }
  return values.sort((a,b)=>a-b)
}
function projectT(click:Point,a:Point,b:Point){
  const v=V(b,a),l2=dot(v,v)
  return l2<EPS*EPS?0:Math.max(0,Math.min(1,dot(V(click,a),v)/l2))
}
function trimParts(target:LineEntity|PolylineEntity,cutters:CadPrimitive[],click:Point,newId:()=>string):CadPrimitive[]{
  const points=target.kind==='line'?[target.start,target.end]:target.points
  if(target.kind==='polyline'&&isClosed(points))
    throw new Error('TRIM 暫不支援封閉聚合線，請先分解為線段。')
  if(points.length<2)throw new Error('目標線段無效。')
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p))
  if(lengths.some(x=>x<EPS))throw new Error('目標包含零長線段。')
  const cumulative=[0]
  for(const l of lengths)cumulative.push(cumulative.at(-1)!+l)
  const total=cumulative.at(-1)!
  const pos=(global:number)=>{
    let i=0
    while(i<lengths.length-1&&global>cumulative[i+1])i++
    return lerp(points[i],points[i+1],Math.max(0,Math.min(1,(global-cumulative[i])/lengths[i])))
  }
  const cuts:number[]=[]
  for(let i=0;i<lengths.length;i++){
    const segment={a:points[i],b:points[i+1]}
    for(const t of cutValues(segment,cutters)){
      const value=cumulative[i]+lengths[i]*t
      if(value>EPS&&value<total-EPS&&!cuts.some(old=>Math.abs(old-value)<.001))cuts.push(value)
    }
  }
  cuts.sort((a,b)=>a-b)
  if(!cuts.length)throw new Error('所選修剪邊界與目標沒有有效交點。')
  const index=nearestSegment(points,click)
  const clickAt=cumulative[index]+lengths[index]*projectT(click,points[index],points[index+1])
  const stops=[0,...cuts,total]
  let remove=-1
  for(let i=0;i<stops.length-1;i++){
    if(clickAt>=stops[i]-EPS&&clickAt<=stops[i+1]+EPS){remove=i;break}
  }
  if(remove<0)throw new Error('請點擊要移除的線段部分。')
  const range=[stops[remove],stops[remove+1]]
  const kept:[number,number][]=[]
  if(range[0]>EPS)kept.push([0,range[0]])
  if(total-range[1]>EPS)kept.push([range[1],total])
  return kept.map(([start,end],i)=>{
    const path=[pos(start)]
    for(let j=1;j<points.length-1;j++){
      if(cumulative[j]>start+EPS&&cumulative[j]<end-EPS)path.push(points[j])
    }
    path.push(pos(end))
    const basis={...target,id:i===0?target.id:newId()}
    return target.kind==='line'
      ?({...basis,kind:'line',start:path[0],end:path.at(-1)!} as LineEntity)
      :({...basis,kind:'polyline',points:path} as PolylineEntity)
  })
}
export function trimDocument(doc:CadDocument,boundaryIds:string[],targetId:string,click:Point,newId:()=>string):CadDocument{
  if(!boundaryIds.length)throw new Error('請先選擇至少一個裁切邊界。')
  if(boundaryIds.includes(targetId))throw new Error('目標不能同時是裁切邊界。')
  const target=doc.entities.find(e=>e.id===targetId)
  if(!target)throw new Error('找不到要修剪的目標。')
  layerEditable(doc,target)
  if(target.kind!=='line'&&target.kind!=='polyline')
    throw new Error('TRIM 目前只能修剪直線或開放聚合線。')
  const cutterEntities=boundaryIds.map(id=>doc.entities.find(e=>e.id===id))
  if(cutterEntities.some(e=>!e))throw new Error('裁切邊界已不存在。')
  const cutters:CadPrimitive[]=[]
  for(const e of cutterEntities){
    const layer=doc.layers.find(l=>l.id===e!.layerId)
    if(!layer?.visible)throw new Error('裁切邊界所在圖層已隱藏。')
    cutters.push(...expandEntity(e!,doc).filter((item):item is CadPrimitive =>
      ['line','polyline','rectangle','circle'].includes(item.kind)))
  }
  if(!cutters.length)throw new Error('裁切邊界必須含直線、圓、矩形或聚合線。')
  const remains=trimParts(target,cutters,click,newId)
  return {...doc,entities:doc.entities.flatMap(e=>e.id===target.id?remains:[e])}
}
