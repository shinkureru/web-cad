import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { CadDocument, Camera, Draft, EditTool, Point, Snap, Tool } from '../cad/types'
import { distance, hitTest, nearestSnap, orthoPoint, roundPoint, toScreen, toWorld, zoomAt } from '../cad/geometry'
import { rotateEntity, translateEntity } from '../cad/editing'
import { expandEntity, expandedDrawing } from '../cad/blocks'

interface Props {
  doc: CadDocument; camera: Camera; onCameraChange: (v: Camera) => void
  tool: Tool; draft: Draft | null; selectedId: string | null; selectedIds: string[]
  cursor: Point; onCursorChange: (v: Point) => void
  onPoint: (p: Point) => void; onSelect: (id: string | null, extend: boolean) => void
  osnap: boolean; ortho: boolean; grid: boolean
  edit: { kind: EditTool; base: Point | null } | null
  blockPreview: string | null; pointInputMode: boolean
}

const gridStep = (scale: number): number => {
  const rough = 65 / scale
  const power = 10 ** Math.floor(Math.log10(rough))
  return [1, 2, 5, 10].map(n => n * power).find(n => n >= rough) ?? power * 10
}
const drawEntity = (ctx: CanvasRenderingContext2D, docEntity: CadDocument['entities'][number], camera: Camera, w: number, h: number): void => {
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
    case 'circle': {
      const c = point(docEntity.center)
      ctx.arc(c.x, c.y, docEntity.radius * camera.scale, 0, Math.PI * 2); break
    }
  }
  ctx.stroke()
}

export default function CadCanvas({ doc, camera, onCameraChange, tool, draft, selectedId, selectedIds, cursor, onCursorChange, onPoint, onSelect, osnap, ortho, grid, edit, blockPreview, pointInputMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [hover, setHover] = useState<Point>(cursor)
  const [snap, setSnap] = useState<Snap | null>(null)
  const drag = useRef<{ pointerId: number; at: Point; cam: Camera } | null>(null)

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
      drawEntity(ctx, entity, camera, w, h)
      ctx.setLineDash([])
    }
    if (edit?.base && selectedId) {
      const original = doc.entities.find(e => e.id === selectedId)
      if (original) {
        const ghost = edit.kind === 'rotate'
          ? rotateEntity(original, edit.base, Math.atan2(hover.y - edit.base.y, hover.x - edit.base.x) * 180 / Math.PI)
          : translateEntity(original, { x: hover.x - edit.base.x, y: hover.y - edit.base.y })
        ctx.strokeStyle = '#7cc5ff'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5])
        for (const part of expandEntity(ghost, doc)) drawEntity(ctx, part, camera, w, h)
        ctx.setLineDash([])
      }
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
      if (draft.tool === 'circle') {
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
  }, [doc, camera, size, grid, draft, hover, selectedId, selectedIds, snap, edit, blockPreview])

  function localPosition(ev: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): Point {
    const r = ev.currentTarget.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }
  function effectivePoint(screen: Point): Point {
    let p = toWorld(screen, camera, size.width, size.height)
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
  function handlePointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    const screen = localPosition(ev)
    if (drag.current?.pointerId === ev.pointerId) {
      const d = drag.current
      onCameraChange({ ...d.cam, x: d.cam.x - (screen.x - d.at.x) / d.cam.scale, y: d.cam.y + (screen.y - d.at.y) / d.cam.scale })
      return
    }
    const p = effectivePoint(screen)
    setHover(p); onCursorChange(p)
  }
  function handlePointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    const screen = localPosition(ev)
    if (ev.button === 1 || (ev.button === 0 && ev.altKey)) {
      drag.current = { pointerId: ev.pointerId, at: screen, cam: camera }
      ev.currentTarget.setPointerCapture(ev.pointerId)
      ev.preventDefault(); return
    }
    if (ev.button !== 0) return
    const point = effectivePoint(screen)
    setHover(point); onCursorChange(point)
    if (edit || pointInputMode) { onPoint(point); return }
    if (tool === 'select') {
      let match: string | null = null, closest = 12 / camera.scale
      for (const entity of [...doc.entities].reverse()) {
        const layer = doc.layers.find(l => l.id === entity.layerId)
        if (!layer?.visible || layer.locked) continue
        const d = Math.min(Infinity, ...expandEntity(entity, doc).map(part => hitTest(toWorld(screen, camera, size.width, size.height), part)))
        if (d < closest) { closest = d; match = entity.id }
      }
      onSelect(match, ev.shiftKey)
    } else {
      const layer = doc.layers.find(l => l.id === doc.activeLayerId)
      if (layer?.visible && !layer.locked) onPoint(point)
    }
  }
  return <div className="drawing-surface" ref={hostRef}>
    <canvas ref={canvasRef} className="cad-canvas" aria-label="CAD 繪圖畫布" style={{ cursor: drag.current ? 'grabbing' : 'crosshair' }}
      onPointerMove={handlePointerMove} onPointerDown={handlePointerDown}
      onPointerUp={ev => { if (drag.current?.pointerId === ev.pointerId) drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
      onContextMenu={e => e.preventDefault()}
      onAuxClick={e => e.preventDefault()}
      onWheel={e => { e.preventDefault(); onCameraChange(zoomAt(camera, e.deltaY < 0 ? 1.15 : 1 / 1.15, localPosition(e), size.width, size.height)) }} />
    <div className="canvas-label"><span className="canvas-label-mark">⌗</span> 模型空間 <span className="canvas-label-sep">/</span> TOP <span className="canvas-label-sep">/</span> 2D 線框</div>
    <div className="canvas-guide">滾輪縮放 · 按住中鍵平移 · 輸入指令開始繪圖</div>
    <div className="axis-widget"><span className="axis-y">Y</span><span className="axis-origin"/><span className="axis-x">X</span></div>
  </div>
}
