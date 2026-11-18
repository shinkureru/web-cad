import type { CadEntity, CadDocument, Point, LineEntity } from './types'
import { arcPoint, normalizeAngle, arcSweep } from './arcs'
import { distance, roundPoint } from './geometry'

export interface Grip { id:string; position:Point; label:string }
const finite=(n:number)=>Number.isFinite(n)&&Math.abs(n)<=1e9
function assertPoint(p:Point){
  if(!finite(p.x)||!finite(p.y))throw new Error('夾點座標超出有效模型範圍')
  return roundPoint(p)
}
function safeRadius(radius:number){
  if(!Number.isFinite(radius)||radius<.001||radius>1e9)
    throw new Error('半徑必須在 0.001 至 1,000,000,000 mm 之間')
  return Math.round(radius*1000)/1000
}
function rectCorners(e:Extract<CadEntity,{kind:'rectangle'}>):Point[]{
  return [e.start,{x:e.end.x,y:e.start.y},e.end,{x:e.start.x,y:e.end.y}]
}
export function entityGrips(entity:CadEntity):Grip[]{
  switch(entity.kind){
    case 'line':return [
      {id:'start',position:entity.start,label:'起點'},
      {id:'end',position:entity.end,label:'終點'},
      {id:'mid',position:{x:(entity.start.x+entity.end.x)/2,
        y:(entity.start.y+entity.end.y)/2},label:'整線移動'}
    ]
    case 'polyline':return entity.points.map((p,i)=>({id:'point:'+i,position:p,label:'頂點 '+(i+1)}))
    case 'rectangle':return rectCorners(entity).map((p,i)=>({
      id:'corner:'+i,position:p,label:'矩形角點 '+(i+1)
    }))
    case 'circle':return [
      {id:'center',position:entity.center,label:'圓心'},
      {id:'radius',position:{x:entity.center.x+entity.radius,y:entity.center.y},label:'半徑'}
    ]
    case 'arc':return [
      {id:'center',position:entity.center,label:'圓心'},
      {id:'radius',position:arcPoint(entity,.5),label:'半徑'},
      {id:'startAngle',position:arcPoint(entity,0),label:'弧起點'},
      {id:'endAngle',position:arcPoint(entity,1),label:'弧終點'}
    ]
    case 'curveDimension':return [{id:'placement',position:entity.placement,label:'標註文字位置'}]
    case 'insert':return [{id:'position',position:entity.position,label:'插入點'}]
    case 'text':return [{id:'position',position:entity.position,label:'文字插入點'}]
    case 'dimension':return [
      {id:'start',position:entity.start,label:'第一標註點'},
      {id:'end',position:entity.end,label:'第二標註點'},
      {id:'placement',position:entity.placement,label:'尺寸線位置'}
    ]
  }
}
/** Nondestructive shape edit. Dragging returns a new entity; caller commits once. */
export function moveGrip(entity:CadEntity,gripId:string,raw:Point):CadEntity{
  const target=assertPoint(raw)
  const exists=entityGrips(entity).some(g=>g.id===gripId)
  if(!exists)throw new Error('未知或無效的物件夾點')
  switch(entity.kind){
    case 'line':{
      if(gripId==='mid'){
        const midpoint={x:(entity.start.x+entity.end.x)/2,y:(entity.start.y+entity.end.y)/2}
        const dx=target.x-midpoint.x,dy=target.y-midpoint.y
        return {...entity,start:assertPoint({x:entity.start.x+dx,y:entity.start.y+dy}),
          end:assertPoint({x:entity.end.x+dx,y:entity.end.y+dy})}
      }
      const result={...entity,[gripId]:target} as LineEntity
      if(distance(result.start,result.end)<.001)throw new Error('線段長度不得小於 0.001 mm')
      return result
    }
    case 'polyline':{
      const index=Number(gripId.slice(6))
      const points=entity.points.map(p=>({...p}))
      const closed=points.length>=4&&distance(points[0],points.at(-1)!)<.001
      points[index]=target
      if(closed&&(index===0||index===points.length-1)){
        points[0]=target;points[points.length-1]=target
      }
      if(points.some((p,i)=>i>0&&distance(p,points[i-1])<.001))
        throw new Error('相鄰聚合線頂點不可重合')
      return {...entity,points}
    }
    case 'rectangle':{
      const index=Number(gripId.slice(7))
      const corners=rectCorners(entity)
      const opposite=corners[(index+2)%4]
      if(Math.abs(target.x-opposite.x)<.001||Math.abs(target.y-opposite.y)<.001)
        throw new Error('矩形寬高必須大於 0.001 mm')
      return {...entity,start:target,end:opposite}
    }
    case 'circle':
      return gripId==='center'?{...entity,center:target}
        :{...entity,radius:safeRadius(distance(target,entity.center))}
    case 'arc':{
      if(gripId==='center')return {...entity,center:target}
      if(gripId==='radius')return {...entity,radius:safeRadius(distance(target,entity.center))}
      if(distance(target,entity.center)<.001)throw new Error('弧端點不可與圓心重合')
      const angle=normalizeAngle(Math.round(Math.atan2(target.y-entity.center.y,
        target.x-entity.center.x)*180/Math.PI*1000)/1000)
      const modified=gripId==='startAngle'?{...entity,startAngle:angle}:{...entity,endAngle:angle}
      if(arcSweep(modified)<.001)throw new Error('圓弧角度跨度必須大於 0.001°')
      return modified
    }
    case 'curveDimension':return {...entity,placement:target}
    case 'insert':case 'text':return {...entity,position:target}
    case 'dimension':return {...entity,[gripId]:target}
  }
}
export function commitGrip(doc:CadDocument,entityId:string,gripId:string,p:Point):CadDocument{
  const source=doc.entities.find(e=>e.id===entityId)
  if(!source)throw new Error('物件已不存在')
  const layer=doc.layers.find(l=>l.id===source.layerId)
  if(!layer?.visible||layer.locked)throw new Error('圖層已鎖定或隱藏，無法編輯夾點')
  const changed=moveGrip(source,gripId,p)
  return {...doc,entities:doc.entities.map(e=>e.id===entityId?changed:e)}
}
export type GeometryField =
  'startX'|'startY'|'endX'|'endY'|'centerX'|'centerY'|'radius'|
  'length'|'angle'|'width'|'height'|'positionX'|'positionY'
const positive=(v:number)=>Number.isFinite(v)&&v>=.001&&v<=1e9
/** Precise dimension editing preserves the anchored first point and current line direction. */
export function editGeometry(entity:CadEntity,field:GeometryField,value:number):CadEntity{
  if(!finite(value))throw new Error('請輸入有效的數值')
  const n=Math.round(value*1000)/1000
  if(entity.kind==='line'){
    if(field==='length'){
      if(!positive(n))throw new Error('線段長度必須大於零')
      const d=distance(entity.start,entity.end)
      if(d<.001)throw new Error('零長度線段無法設定方向')
      return moveGrip(entity,'end',{x:entity.start.x+(entity.end.x-entity.start.x)*n/d,
        y:entity.start.y+(entity.end.y-entity.start.y)*n/d})
    }
    if(field==='angle'){
      const d=distance(entity.start,entity.end),rad=n*Math.PI/180
      return moveGrip(entity,'end',{x:entity.start.x+d*Math.cos(rad),y:entity.start.y+d*Math.sin(rad)})
    }
    if(field==='startX'||field==='startY'||field==='endX'||field==='endY'){
      const id=field.startsWith('start')?'start':'end'
      const coordinate=field.endsWith('X')?'x':'y'
      return moveGrip(entity,id,{...entity[id],[coordinate]:n})
    }
  }
  if(entity.kind==='rectangle'){
    if(field==='width'||field==='height'){
      if(!positive(n))throw new Error('矩形寬高必須大於零')
      const key=field==='width'?'x':'y'
      const sign=entity.end[key]>=entity.start[key]?1:-1
      return {...entity,end:{...entity.end,[key]:entity.start[key]+sign*n}}
    }
    if(field==='startX'||field==='startY'||field==='endX'||field==='endY'){
      const id=field.startsWith('start')?'start':'end'
      const key=field.endsWith('X')?'x':'y'
      const changed={...entity,[id]:{...entity[id],[key]:n}}
      if(Math.abs(changed.start.x-changed.end.x)<.001||
        Math.abs(changed.start.y-changed.end.y)<.001)throw new Error('矩形寬高必須大於零')
      return changed
    }
  }
  if(entity.kind==='circle'||entity.kind==='arc'){
    if(field==='radius')return {...entity,radius:safeRadius(n)}
    if(field==='centerX'||field==='centerY')
      return {...entity,center:{...entity.center,[field==='centerX'?'x':'y']:n}}
  }
  if((entity.kind==='text'||entity.kind==='insert')&&
      (field==='positionX'||field==='positionY'))
    return {...entity,position:{...entity.position,[field==='positionX'?'x':'y']:n}}
  throw new Error('此圖元暫不支援修改所選幾何屬性')
}
export function commitGeometry(doc:CadDocument,entityId:string,field:GeometryField,value:number):CadDocument{
  const entity=doc.entities.find(e=>e.id===entityId)
  if(!entity)throw new Error('物件已不存在')
  const layer=doc.layers.find(l=>l.id===entity.layerId)
  if(!layer?.visible||layer.locked)throw new Error('圖層已鎖定或隱藏，無法編輯幾何')
  const updated=editGeometry(entity,field,value)
  return {...doc,entities:doc.entities.map(e=>e.id===entityId?updated:e)}
}
