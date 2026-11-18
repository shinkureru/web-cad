import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { CadDocument, CadDisplayEntity, Camera, DimensionEntity, DimensionStyle, Draft, EditTool, Point, Snap, Tool } from '../cad/types'
import { distance, hitTest, nearestSnap, orthoPoint, roundPoint, toScreen, toWorld, zoomAt } from '../cad/geometry'
import { rotateEntity, translateEntity } from '../cad/editing'
import { wallOutline } from '../cad/walls'
import { expandEntity, expandedDrawing } from '../cad/blocks'
import { dimensionGeometry, getDimensionStyle } from '../cad/annotations'
import { offsetEntity } from '../cad/precisionEdit'
import { cornerGeometry, windowSelection } from '../cad/advancedEditing'
import { arcFromThreePoints } from '../cad/arcs'
import type { CornerMode } from '../cad/advancedEditing'

interface Props {
  doc: CadDocument; camera: Camera; onCameraChange: (v: Camera) => void
  tool: Tool; draft: Draft | null; selectedId: string | null; selectedIds: string[]
  cursor: Point; onCursorChange: (v: Point) => void
  onPoint: (p: Point) => void; onSelect: (id: string | null, extend: boolean) => void
  onSelectMany: (ids: string[], extend: boolean) => void
  onPick: (id: string | null, point: Point) => void; pickMode: boolean
  pickLabel: 'trim'|'extend'|null; cornerMode: CornerMode|null; cornerPreviewValue: string
  trimBoundaryIds: string[]; offsetPreview: {sourceId: string; distance: number} | null
  osnap: boolean; ortho: boolean; grid: boolean
  edit: { kind: EditTool; base: Point | null } | null
  blockPreview: string | null; pointInputMode: boolean; wallThickness: number
  annotation: {kind:'text'|'linear'|'aligned'; text:string; points:Point[]} | null; textHeight: number
}

const gridStep = (scale: number): number => {
  const rough = 65 / scale
  const power = 10 ** Math.floor(Math.log10(rough))
  return [1, 2, 5, 10].map(n => n * power).find(n => n >= rough) ?? power * 10
}
const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC",sans-serif'
function drawLabel(ctx: CanvasRenderingContext2D, text: string, position: Point,
  height: number, rotation: number, camera: Camera, w: number, h: number, align: CanvasTextAlign='center') {
  const p=toScreen(position,camera,w,h)
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-rotation*Math.PI/180)
  ctx.font=`${Math.max(.2,height*camera.scale)}px ${FONT}`
  ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=ctx.strokeStyle
  ctx.fillText(text,0,0);ctx.restore()
}
const drawEntity = (ctx: CanvasRenderingContext2D, docEntity: CadDisplayEntity,
  camera: Camera, w: number, h: number, style?: DimensionStyle): void => {
  if (docEntity.kind === 'text') {
    docEntity.text.split(String.fromCharCode(10)).forEach((line,i)=>{
      const rad=docEntity.rotation*Math.PI/180
      drawLabel(ctx,line,{
        x:docEntity.position.x + Math.sin(rad)*i*docEntity.height*1.3,
        y:docEntity.position.y - Math.cos(rad)*i*docEntity.height*1.3,
      },docEntity.height,docEntity.rotation,camera,w,h,'left')
    })
    return
  }
  if (docEntity.kind === 'dimension') {
    const geo=dimensionGeometry(docEntity,style??getDimensionStyle())
    ctx.beginPath()
    for(const seg of geo.lines){
      const a=toScreen(seg.a,camera,w,h),b=toScreen(seg.b,camera,w,h)
      ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)
    }
    ctx.stroke()
    for(const arrow of geo.arrowheads){
      ctx.beginPath()
      arrow.forEach((v,i)=>{const p=toScreen(v,camera,w,h); if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)})
      ctx.closePath();ctx.fillStyle=ctx.strokeStyle;ctx.fill()
    }
    // Cut a readable text gap over the dimension line without changing model geometry.
    const label=geo.label
    const screen=toScreen(label.position,camera,w,h)
    const px=Math.max(.2,label.height*camera.scale)
    ctx.save();ctx.translate(screen.x,screen.y);ctx.rotate(-label.rotation*Math.PI/180)
    ctx.font=`${px}px ${FONT}`;const labelWidth=ctx.measureText(label.text).width
    ctx.fillStyle='#101317';ctx.fillRect(-labelWidth/2-4,-px*.72,labelWidth+8,px*1.44)
    ctx.restore()
    drawLabel(ctx,geo.label.text,geo.label.position,geo.label.height,geo.label.rotation,camera,w,h)
    return
  }
  const point = (p: Point): Point => toScreen(p, camera, w, h)
  ctx.beginPath()
  switch (docEntity.kind) {
    case 'line': {
      const a = point(docEntity.start), b = point(docEntity.end)
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); break
    }
    case 'polyline': {
      docEntity.points.forEach((p, i) => { const s = point(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y) }); break
    }
    case 'rectangle': {
      const a = point(docEntity.start), b = point(docEntity.end)
      ctx.rect(Math.min(a.x,b.x), Math.min(a.y,b.y), Math.abs(b.x-a.x), Math.abs(b.y-a.y)); break
    }
    case 'arc': {
      const c=point(docEntity.center)
      ctx.arc(c.x,c.y,docEntity.radius*camera.scale,
        -docEntity.startAngle*Math.PI/180,-docEntity.endAngle*Math.PI/180,true)
      break
    }
    case 'circle': {
      const c = point(docEntity.center)
      ctx.arc(c.x, c.y, docEntity.radius * camera.scale, 0, Math.PI * 2); break
    }
  }
  ctx.stroke()
}

export default function CadCanvas({ doc, camera, onCameraChange, tool, draft, selectedId, selectedIds, cursor, onCursorChange, onPoint, onSelect, onSelectMany, onPick, pickMode, pickLabel, cornerMode, cornerPreviewValue, trimBoundaryIds, offsetPreview, osnap, ortho, grid, edit, blockPreview, pointInputMode, wallThickness, annotation, textHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [hover, setHover] = useState<Point>(cursor)
  const [snap, setSnap] = useState<Snap | null>(null)
  const drag = useRef<{ pointerId: number; at: Point; cam: Camera } | null>(null)
  const selectionRef=useRef<{pointerId:number;from:Point;shift:boolean;dragging:boolean}|null>(null)
  const [selectionBox,setSelectionBox]=useState<{from:Point;to:Point}|null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const resize = () => setSize({ width: host.clientWidth, height: host.clientHeight })
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = size.width, h = size.height
    ctx.fillStyle = '#101317'; ctx.fillRect(0, 0, w, h)
    if (grid) {
      const step = gridStep(camera.scale)
      const start = toWorld({ x: 0, y: h }, camera, w, h)
      const end = toWorld({ x: w, y: 0 }, camera, w, h)
      ctx.strokeStyle = '#252a31'; ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(start.x / step) * step; x <= end.x; x += step) {
        const sx = toScreen({ x, y: 0 }, camera, w, h).x
        ctx.moveTo(Math.round(sx) + .5, 0); ctx.lineTo(Math.round(sx) + .5, h)
      }
      for (let y = Math.ceil(start.y / step) * step; y <= end.y; y += step) {
        const sy = toScreen({ x: 0, y }, camera, w, h).y
        ctx.moveTo(0, Math.round(sy) + .5); ctx.lineTo(w, Math.round(sy) + .5)
      }
      ctx.stroke()
      const origin = toScreen({ x: 0, y: 0 }, camera, w, h)
      ctx.strokeStyle = '#3b4859'; ctx.beginPath()
      ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, h)
      ctx.moveTo(0, origin.y); ctx.lineTo(w, origin.y)
      ctx.stroke()
    }
    for (const entity of expandedDrawing(doc)) {
      const layer = doc.layers.find(l => l.id === entity.layerId)
      if (!layer?.visible) continue
      ctx.strokeStyle = selectedIds.includes(entity.id) ? '#ffcc79' : entity.color && entity.color !== 'ByLayer' ? entity.color : layer.color
      const weight = typeof entity.lineweight === 'number' ? entity.lineweight : layer.lineweight
      ctx.lineWidth = selectedIds.includes(entity.id) ? 2.4 : Math.max(1, Math.min(4, weight * 4))
      const type = entity.linetype && entity.linetype !== 'ByLayer' ? entity.linetype : layer.linetype ?? 'continuous'
      ctx.setLineDash(type === 'dashed' ? [9, 6] : type === 'center' ? [16, 5, 3, 5] : [])
      drawEntity(ctx, entity, camera, w, h, entity.kind==='dimension' ? getDimensionStyle(doc,entity.styleId) : undefined)
      ctx.setLineDash([])
    }
    if(edit?.base && selectedIds.length){
      ctx.save()
      ctx.strokeStyle='#7cc5ff';ctx.lineWidth=1.5;ctx.setLineDash([7,5])
      for(const original of doc.entities.filter(e=>selectedIds.includes(e.id))){
        const ghost=edit.kind==='rotate'
          ? rotateEntity(original,edit.base,Math.atan2(hover.y-edit.base.y,hover.x-edit.base.x)*180/Math.PI)
          : translateEntity(original,{x:hover.x-edit.base.x,y:hover.y-edit.base.y})
        for(const part of expandEntity(ghost,doc))
          drawEntity(ctx,part,camera,w,h,part.kind==='dimension'?getDimensionStyle(doc,part.styleId):undefined)
      }
      ctx.restore()
    }
    // Explicit trim cutting edges remain visually distinguished even without normal selection.
    if(trimBoundaryIds.length){
      ctx.strokeStyle='#e8b86a';ctx.lineWidth=2;ctx.setLineDash([5,4])
      for(const entity of doc.entities.filter(e=>trimBoundaryIds.includes(e.id))){
        for(const part of expandEntity(entity,doc)){
          drawEntity(ctx,part,camera,w,h,part.kind==='dimension'?getDimensionStyle(doc,part.styleId):undefined)
        }
      }
      ctx.setLineDash([])
    }
    if(selectionBox){
      const {from,to}=selectionBox
      const crossing=to.x<from.x
      ctx.save()
      ctx.strokeStyle=crossing?'#83dca7':'#78b6ff'
      ctx.lineWidth=1.2;ctx.setLineDash(crossing?[7,4]:[])
      ctx.fillStyle=crossing?'#5cce8a26':'#6faeff21'
      ctx.fillRect(Math.min(from.x,to.x),Math.min(from.y,to.y),
        Math.abs(to.x-from.x),Math.abs(to.y-from.y))
      ctx.strokeRect(Math.min(from.x,to.x),Math.min(from.y,to.y),
        Math.abs(to.x-from.x),Math.abs(to.y-from.y))
      ctx.restore()
    }
    if(cornerMode&&selectedIds.length===2){
      const [a,b]=selectedIds.map(id=>doc.entities.find(e=>e.id===id))
      if(a?.kind==='line'&&b?.kind==='line'){
        try{
          const values=cornerPreviewValue.split(',').map(n=>Number(n.trim()))
          const d1=cornerPreviewValue.trim()&&Number.isFinite(values[0])?values[0]:100
          const d2=cornerMode==='fillet'?d1:(values[1]??d1)
          const preview=cornerGeometry(a,b,cornerMode,d1,d2,'preview')
          ctx.strokeStyle='#a6d6f1';ctx.lineWidth=2;ctx.setLineDash([6,3])
          drawEntity(ctx,preview.a,camera,w,h);drawEntity(ctx,preview.b,camera,w,h)
          if(preview.connector)drawEntity(ctx,preview.connector,camera,w,h)
          ctx.setLineDash([])
        }catch{/* invalid geometry is explained by command submission */}
      }
    }
    if(offsetPreview){
      const source=doc.entities.find(e=>e.id===offsetPreview.sourceId)
      if(source){
        try{
          const ghost=offsetEntity(source,offsetPreview.distance,hover)
          ctx.strokeStyle='#78d6ce';ctx.lineWidth=1.7;ctx.setLineDash([7,5])
          drawEntity(ctx,ghost,camera,w,h)
          ctx.setLineDash([])
        }catch{
          // Invalid side/degenerate offset cannot be previewed; drawing remains unchanged.
          ctx.setLineDash([])
        }
      }
    }
    if(annotation){
      ctx.strokeStyle='#80d0f0';ctx.lineWidth=1.3;ctx.setLineDash([6,5])
      if(annotation.kind==='text' && annotation.text){
        drawEntity(ctx,{id:'preview',kind:'text',text:annotation.text,height:textHeight,rotation:0,
          position:hover,layerId:doc.activeLayerId},camera,w,h)
      }else if(annotation.kind!=='text'){
        const pts=annotation.points
        if(pts.length===1){
          const a=toScreen(pts[0],camera,w,h),b=toScreen(hover,camera,w,h)
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()
        }else if(pts.length===2){
          const ghost: DimensionEntity={id:'preview',kind:'dimension',layerId:doc.activeLayerId,
            start:pts[0],end:pts[1],placement:hover,mode:annotation.kind,
            axis:Math.abs(pts[1].x-pts[0].x)>=Math.abs(pts[1].y-pts[0].y)?'horizontal':'vertical',
            styleId:doc.activeDimensionStyleId??'standard'}
          drawEntity(ctx,ghost,camera,w,h,getDimensionStyle(doc,ghost.styleId))
        }
      }
      ctx.setLineDash([])
    }
    if (blockPreview) {
      ctx.strokeStyle = '#7bd9d0'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4])
      const ghost = { id: 'preview', kind: 'insert' as const, blockId: blockPreview,
        position: hover, rotation: 0, layerId: doc.activeLayerId }
      for (const part of expandEntity(ghost, doc)) drawEntity(ctx, part, camera, w, h)
      ctx.setLineDash([])
    }
    if (draft?.points.length) {
      const layer = doc.layers.find(l => l.id === doc.activeLayerId)
      ctx.strokeStyle = layer?.color ?? '#ffffff'; ctx.lineWidth = 1.5
      ctx.setLineDash([6, 5])
      const points = draft.points
      if (draft.tool === 'wall' && distance(points[0], hover) > .001) {
        drawEntity(ctx, { id: 'draft', kind: 'polyline', layerId: doc.activeLayerId,
          points: wallOutline(points[0], hover, wallThickness) }, camera, w, h)
      } else if (draft.tool === 'arc') {
        if(points.length===1){
          drawEntity(ctx,{id:'draft',kind:'line',layerId:doc.activeLayerId,
            start:points[0],end:hover},camera,w,h)
        }else if(points.length===2){
          try{
            const ghost=arcFromThreePoints(points[0],points[1],hover,'preview',doc.activeLayerId)
            drawEntity(ctx,ghost,camera,w,h)
          }catch{
            drawEntity(ctx,{id:'draft',kind:'polyline',layerId:doc.activeLayerId,
              points:[...points,hover]},camera,w,h)
          }
        }
      } else if (draft.tool === 'circle') {
        drawEntity(ctx, { id: 'draft', kind: 'circle', layerId: doc.activeLayerId, center: points[0], radius: distance(points[0], hover) }, camera, w, h)
      } else if (draft.tool === 'rectangle') {
        drawEntity(ctx, { id: 'draft', kind: 'rectangle', layerId: doc.activeLayerId, start: points[0], end: hover }, camera, w, h)
      } else {
        const seq = [...points, hover]
        drawEntity(ctx, { id: 'draft', kind: 'polyline', layerId: doc.activeLayerId, points: seq }, camera, w, h)
      }
      ctx.setLineDash([])
    }
    if (snap) {
      const p = toScreen(snap.point, camera, w, h)
      ctx.strokeStyle = '#f6d083'; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - 5, p.y - 5, 10, 10)
      ctx.fillStyle = '#f6d083'; ctx.font = '11px monospace'; ctx.fillText(snap.kind, p.x + 10, p.y - 8)
    }
  }, [doc, camera, size, grid, draft, hover, selectedId, selectedIds, snap, edit, blockPreview, wallThickness, annotation, textHeight, trimBoundaryIds, offsetPreview, selectionBox, cornerMode, cornerPreviewValue])

  function localPosition(ev: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): Point {
    const r = ev.currentTarget.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }
  function effectivePoint(screen: Point): Point {
    let p = toWorld(screen, camera, size.width, size.height)
    // OFFSET side and TRIM pick must be raw cursor positions; endpoint OSNAP would
    // change the side or the segment to delete at a crossing.
    if(offsetPreview || pickMode)
      {setSnap(null);return roundPoint(p)}
    if (ortho && draft?.points.length) p = orthoPoint(draft.points.at(-1)!, p)
    else if (ortho && edit?.base && edit.kind !== 'rotate') p = orthoPoint(edit.base, p)
    if (osnap) {
      const visible = new Set(doc.layers.filter(l => l.visible).map(l => l.id))
      const found = nearestSnap(p, expandedDrawing(doc), visible, 12 / camera.scale)
      setSnap(found)
      if (found) return roundPoint(found.point)
    } else setSnap(null)
    return roundPoint(p)
  }
  function pickAt(screen:Point):string|null{
    let match:string|null=null,closest=12/camera.scale
    const world=toWorld(screen,camera,size.width,size.height)
    for(const entity of [...doc.entities].reverse()){
      const layer=doc.layers.find(l=>l.id===entity.layerId)
      if(!layer?.visible||layer.locked||(pickMode&&trimBoundaryIds.includes(entity.id)))continue
      const d=Math.min(Infinity,...expandEntity(entity,doc).map(part=>{
        if(part.kind!=='dimension')return hitTest(world,part)
        const geo=dimensionGeometry(part,getDimensionStyle(doc,part.styleId))
        return Math.min(...geo.lines.map(seg=>{
          const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,l2=dx*dx+dy*dy
          const t=l2?Math.max(0,Math.min(1,((world.x-seg.a.x)*dx+(world.y-seg.a.y)*dy)/l2)):0
          return Math.hypot(world.x-seg.a.x-t*dx,world.y-seg.a.y-t*dy)
        }),Math.hypot(world.x-geo.label.position.x,world.y-geo.label.position.y))
      }))
      if(d<closest){closest=d;match=entity.id}
    }
    return match
  }
  function handlePointerMove(ev:React.PointerEvent<HTMLCanvasElement>){
    const screen=localPosition(ev)
    if(drag.current?.pointerId===ev.pointerId){
      const d=drag.current
      onCameraChange({...d.cam,x:d.cam.x-(screen.x-d.at.x)/d.cam.scale,
        y:d.cam.y+(screen.y-d.at.y)/d.cam.scale})
      return
    }
    const selection=selectionRef.current
    if(selection?.pointerId===ev.pointerId){
      if(Math.hypot(screen.x-selection.from.x,screen.y-selection.from.y)>=6){
        selection.dragging=true
        setSelectionBox({from:selection.from,to:screen})
      }
      // Selection boxes use raw model coordinates and never OSNAP their corners.
      const raw=roundPoint(toWorld(screen,camera,size.width,size.height))
      setHover(raw);onCursorChange(raw)
      return
    }
    const point=effectivePoint(screen)
    setHover(point);onCursorChange(point)
  }
  function handlePointerDown(ev:React.PointerEvent<HTMLCanvasElement>){
    const screen=localPosition(ev)
    if(ev.button===1||(ev.button===0&&ev.altKey)){
      drag.current={pointerId:ev.pointerId,at:screen,cam:camera}
      ev.currentTarget.setPointerCapture(ev.pointerId)
      ev.preventDefault();return
    }
    if(ev.button!==0)return
    const point=effectivePoint(screen)
    setHover(point);onCursorChange(point)
    if(edit||pointInputMode){onPoint(point);return}
    if(tool==='select'){
      if(pickMode){onPick(pickAt(screen),roundPoint(toWorld(screen,camera,size.width,size.height)));return}
      selectionRef.current={pointerId:ev.pointerId,from:screen,shift:ev.shiftKey,dragging:false}
      ev.currentTarget.setPointerCapture(ev.pointerId)
      ev.preventDefault()
    }else{
      const layer=doc.layers.find(l=>l.id===doc.activeLayerId)
      if(layer?.visible&&!layer.locked)onPoint(point)
    }
  }
  function handlePointerUp(ev:React.PointerEvent<HTMLCanvasElement>){
    if(drag.current?.pointerId===ev.pointerId){drag.current=null;return}
    const selection=selectionRef.current
    if(!selection||selection.pointerId!==ev.pointerId)return
    selectionRef.current=null;setSelectionBox(null)
    const end=localPosition(ev)
    if(selection.dragging){
      const first=toWorld(selection.from,camera,size.width,size.height)
      const last=toWorld(end,camera,size.width,size.height)
      onSelectMany(windowSelection(doc,first,last),selection.shift)
    }else onSelect(pickAt(end),selection.shift)
  }
  return <div className="drawing-surface" ref={hostRef}>
    <canvas ref={canvasRef} className="cad-canvas" aria-label="CAD 繪圖畫布" style={{ cursor: drag.current ? 'grabbing' : pickMode?'cell' : selectionBox?'crosshair':'crosshair' }}
      onPointerMove={handlePointerMove} onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { drag.current = null;selectionRef.current=null;setSelectionBox(null) }}
      onContextMenu={e => e.preventDefault()}
      onAuxClick={e => e.preventDefault()}
      onWheel={e => { e.preventDefault(); onCameraChange(zoomAt(camera, e.deltaY < 0 ? 1.15 : 1 / 1.15, localPosition(e), size.width, size.height)) }} />
    <div className="canvas-label"><span className="canvas-label-mark">⌗</span> 模型空間 <span className="canvas-label-sep">/</span> TOP <span className="canvas-label-sep">/</span> 2D 線框</div>
    <div className="canvas-guide">{pickLabel==='trim'?'TRIM：點擊要刪除的部分；金色虛線為裁切邊界':
      pickLabel==='extend'?'EXTEND：點選靠近欲延伸端點的線段；金色虛線為邊界':
      offsetPreview?'OFFSET：點擊偏移方向；青色虛線為預覽':
      '拖曳框選：左→右完整／右→左交叉 · 滾輪縮放 · 中鍵平移'}</div>
    <div className="axis-widget"><span className="axis-y">Y</span><span className="axis-origin"/><span className="axis-x">X</span></div>
  </div>
}
