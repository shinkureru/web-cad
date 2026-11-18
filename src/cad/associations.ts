import { arcSweep } from './arcs'
import { roundPoint } from './geometry'
import type { CadDocument, CadEntity, CurveDimensionEntity, CurveMeasure, Point } from './types'

type Circular=Extract<CadEntity,{kind:'circle'|'arc'}>
const isCircular=(e:CadEntity|undefined):e is Circular=>
  !!e&&(e.kind==='circle'||e.kind==='arc')
const compatible=(entity:CadEntity|undefined,measure:CurveMeasure):entity is Circular=>
  isCircular(entity)&&((measure!=='angle'&&measure!=='arcLength')||entity.kind==='arc')
const samePoint=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y
/** Distinguish geometric edits from style/layer changes. */
function sameGeometry(before:Circular,after:Circular):boolean{
  return before.kind===after.kind&&before.radius===after.radius&&
    samePoint(before.center,after.center)&&
    (before.kind!=='arc'||(after.kind==='arc'&&
      before.startAngle===after.startAngle&&before.endAngle===after.endAngle))
}
function midpointDegrees(source:Circular):number {
  return source.kind==='arc'?
    source.startAngle+arcSweep(source)/2:0
}
function projectPlacement(old:CurveDimensionEntity,original:Circular,current:Circular):Point{
  const dx=old.placement.x-original.center.x
  const dy=old.placement.y-original.center.y
  const distance=Math.hypot(dx,dy)
  const angle=(current.kind==='arc'&&original.kind==='arc')
    ? (midpointDegrees(current)-midpointDegrees(original))*Math.PI/180:0
  const length=Math.max(.001,distance+(current.radius-original.radius))
  if(distance<.001)return {...current.center}
  const ratio=length/distance
  return roundPoint({
    x:current.center.x+(dx*Math.cos(angle)-dy*Math.sin(angle))*ratio,
    y:current.center.y+(dx*Math.sin(angle)+dy*Math.cos(angle))*ratio
  })
}
function snapshotFields(dim:CurveDimensionEntity,source:Circular):CurveDimensionEntity{
  const {startAngle:ignoredStart,endAngle:ignoredEnd,...rest}=dim
  // All linear circular measurements need just a center/radius.
  // Angular/arc-length measurements additionally track the native ARC sweep.
  void ignoredStart;void ignoredEnd
  return {
    ...rest,center:{...source.center},radius:source.radius,
    ...((dim.measure==='angle'||dim.measure==='arcLength')&&source.kind==='arc'
      ?{startAngle:source.startAngle,endAngle:source.endAngle}:{}),
    orphaned:false
  }
}
/** Explicit opt-in. v1.3.0 and earlier snapshot dimensions are unchanged. */
export function linkCurveDimension(
  dim:CurveDimensionEntity,source:CadEntity
):CurveDimensionEntity{
  if(!compatible(source,dim.measure))
    throw new Error('標註與來源不相容：半徑／直徑需圓或圓弧，角度／弧長需原生 ARC')
  if(source.id===dim.id)throw new Error('標註不能參照自己')
  return {...snapshotFields(dim,source),sourceId:source.id}
}
/** Explicit detach freezes the last measured geometry, not the source object. */
export function unlinkCurveDimension(dim:CurveDimensionEntity):CurveDimensionEntity {
  const {sourceId:ignored,...rest}=dim
  void ignored
  return {...rest,orphaned:false}
}
export function linkCurveDimensionInDocument(
  doc:CadDocument,dimId:string,sourceId:string
):CadDocument{
  const dim=doc.entities.find(e=>e.id===dimId)
  const source=doc.entities.find(e=>e.id===sourceId)
  if(dim?.kind!=='curveDimension'||!source)throw new Error('請選取一個曲線標註及一個來源圓或圓弧')
  const layer=doc.layers.find(l=>l.id===dim.layerId)
  if(!layer?.visible||layer.locked)throw new Error('標註所在圖層不可編輯')
  const linked=linkCurveDimension(dim,source)
  return {...doc,entities:doc.entities.map(e=>e.id===dimId?linked:e)}
}
/** A single documentReducer edit covers source change and all label updates.
 * This retains undo/redo atomicity across grips, exact inspector, MOVE, ROTATE,
 * TRIM and direct geometry edits.
 */
export function reconcileCurveAssociations(
  before:CadDocument,after:CadDocument
):CadDocument{
  if(!after.entities.some(e=>e.kind==='curveDimension'&&e.sourceId))return after
  const previous=new Map(before.entities.map(e=>[e.id,e]))
  const current=new Map(after.entities.map(e=>[e.id,e]))
  let changed=false
  const entities=after.entities.map(entity=>{
    if(entity.kind!=='curveDimension'||!entity.sourceId)return entity
    const source=current.get(entity.sourceId)
    if(!compatible(source,entity.measure)){
      // Do not quietly retain a link to a deleted or incompatible source.
      const {sourceId:removed,...rest}=entity
      void removed
      changed=true
      return {...rest,orphaned:true}
    }
    const oldSource=previous.get(entity.sourceId)
    const oldDim=previous.get(entity.id)
    if(!compatible(oldSource,entity.measure)||
      oldDim?.kind!=='curveDimension'||oldDim.sourceId!==entity.sourceId){
      const synced=snapshotFields(entity,source)
      changed=true
      return synced
    }
    if(sameGeometry(oldSource,source))return entity
    const movedByUser=!samePoint(oldDim.placement,entity.placement)
    const nextPlacement=movedByUser
      ?entity.placement:projectPlacement(entity,oldSource,source)
    const synced={...snapshotFields(entity,source),placement:nextPlacement}
    changed=true
    return synced
  })
  return changed?{...after,entities}:after
}

/** Copy only the linked label: it still references the original source.
 * Copy the label AND source together: remap to the duplicated source atomically.
 */
export function copyAssociationSourceIds(
  clones:CadEntity[],originalIds:string[]
):CadEntity[]{
  if(clones.length!==originalIds.length)throw new Error('複製來源對應數量不符')
  const idMap=new Map(originalIds.map((id,i)=>[id,clones[i].id]))
  return clones.map(e=>e.kind==='curveDimension'&&e.sourceId&&idMap.has(e.sourceId)
    ?{...e,sourceId:idMap.get(e.sourceId)!}:e)
}
