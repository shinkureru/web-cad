import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  ArrowDownToLine, Box, Circle, Command, CornerDownLeft, Type, PencilRuler, FilePlus2, FolderOpen, Grid3X3, Copy, Move, RotateCw,
  HelpCircle, Layers3, LockKeyhole, Minus, MousePointer2, PanelRightClose, PanelRightOpen,
  PenLine, Plus, Redo2, Ruler, Save, Scan, Square, Trash2, Undo2,
  UnlockKeyhole, Eye, EyeOff, ZoomIn, ZoomOut,
} from 'lucide-react'
import CadCanvas from './components/CadCanvas'
import { findCommand, parsePointInput } from './cad/commands'
import { createDocument, documentReducer, parseDocument, STORAGE_KEY, uid } from './cad/document'
import { distance } from './cad/geometry'
import { rotateEntity, translateEntity } from './cad/editing'
import { wallOutline } from './cad/walls'
import { DEFAULT_DIMENSION_STYLES, entityExtentPoints, getDimensionStyle } from './cad/annotations'
import { exportDxf, importDxf } from './cad/dxf'
import { BUILTIN_BLOCKS, createBlockFromSelection, expandedDrawing, explodeInsert, installPreset } from './cad/blocks'
import type { LibraryPreset } from './cad/blocks'
import type { CadDocument, CadEntity, Camera, Draft, EditTool, Point, Tool, LineType, DimensionMode, DimensionStyle } from './cad/types'

const editTools: { id: EditTool; label: string; alias: string; Icon: typeof Minus }[] = [
  { id: 'move', label: '移動', alias: 'M', Icon: Move },
  { id: 'copy', label: '複製', alias: 'CO', Icon: Copy },
  { id: 'rotate', label: '旋轉', alias: 'RO', Icon: RotateCw },
]
const linetypes: { id: LineType; label: string }[] = [
  { id: 'continuous', label: 'Continuous — 實線' },
  { id: 'dashed', label: 'Dashed — 虛線' },
  { id: 'center', label: 'Center — 中心線' },
]
const weights = [.09,.13,.18,.25,.35,.5,.7,1,1.4]

const tools: { id: Tool; label: string; alias: string; Icon: typeof Minus }[] = [
  { id: 'select', label: '選取', alias: 'SELECT', Icon: MousePointer2 },
  { id: 'line', label: '直線', alias: 'L', Icon: Minus },
  { id: 'polyline', label: '聚合線', alias: 'PL', Icon: PenLine },
  { id: 'rectangle', label: '矩形', alias: 'REC', Icon: Square },
  { id: 'circle', label: '圓形', alias: 'C', Icon: Circle },
  { id: 'wall', label: '雙線牆', alias: 'W', Icon: Layers3 },
]

function loadDocument(): CadDocument {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? parseDocument(JSON.parse(stored) as unknown) : createDocument()
  } catch { return createDocument() }
}
function sampleDocument(): CadDocument {
  const d = createDocument()
  d.name = '室內平面圖 · 示範'
  const p = (x: number, y: number): Point => ({ x, y })
  const line = (layerId: string, ax: number, ay: number, bx: number, by: number): CadEntity => ({ id: uid(), kind: 'line', layerId, start: p(ax, ay), end: p(bx, by) })
  d.entities = [
    line('wall', 0, 0, 6000, 0), line('wall', 6000, 0, 6000, 4200), line('wall', 6000, 4200, 0, 4200), line('wall', 0, 4200, 0, 0),
    line('wall', 150, 150, 5850, 150), line('wall', 5850, 150, 5850, 4050), line('wall', 5850, 4050, 150, 4050), line('wall', 150, 4050, 150, 150),
    line('wall', 3500, 150, 3500, 4050), line('wall', 3500, 2450, 5850, 2450),
    line('door', 3500, 150, 2600, 150),
    { id: uid(), kind: 'circle', layerId: 'door', center: p(3500, 150), radius: 900 },
    { id: uid(), kind: 'rectangle', layerId: 'furniture', start: p(500, 2850), end: p(2100, 3900) },
    { id: uid(), kind: 'rectangle', layerId: 'furniture', start: p(4000, 3000), end: p(5400, 3850) },
    { id: uid(), kind: 'rectangle', layerId: 'furniture', start: p(4200, 550), end: p(5400, 1700) },
  ]
  d.entities.push(
    {id:uid(),kind:'text',layerId:'0',text:'客廳｜LIVING ROOM',position:p(3900,2150),height:135,rotation:0},
    {id:uid(),kind:'dimension',layerId:'dimension',start:p(0,0),end:p(6000,0),
      placement:p(3000,-550),mode:'linear',axis:'horizontal',styleId:'standard'},
    {id:uid(),kind:'dimension',layerId:'dimension',start:p(6000,0),end:p(6000,4200),
      placement:p(6550,2100),mode:'linear',axis:'vertical',styleId:'standard'},
  )
  d.activeLayerId = 'wall'
  return d
}

function downloadDocument(doc: CadDocument) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.name.replace(/[\\/:*?"<>|]/g, '_')}.webcad.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export default function App() {
  const [history, dispatch] = useReducer(documentReducer, undefined, () => ({ past: [], present: loadDocument(), future: [] }))
  const doc = history.present
  const [camera, setCamera] = useState<Camera>({ x: 2400, y: 1500, scale: .16 })
  const [tool, setTool] = useState<Tool>('select')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [edit, setEdit] = useState<{ kind: EditTool; base: Point | null } | null>(null)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [blockCreate, setBlockCreate] = useState<{ ids: string[]; name: string | null } | null>(null)
  const [blockInsert, setBlockInsert] = useState<{ blockId: string } | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string>('')
  const [annotation, setAnnotation] = useState<{kind:'text'|DimensionMode; text:string; points:Point[]} | null>(null)
  const [newTextHeight, setNewTextHeight] = useState(150)
  const [grid, setGrid] = useState(true)
  const [osnap, setOsnap] = useState(true)
  const [ortho, setOrtho] = useState(false)
  const [wallThickness, setWallThickness] = useState(120)
  const [commandText, setCommandText] = useState('')
  const [log, setLog] = useState<string[]>(['Web CAD v0.5.0：支援 DXF 2000 匯入／匯出；先備份 JSON 再交換圖面。'])
  const [panelOpen, setPanelOpen] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [exchangeReport, setExchangeReport] = useState<{title:string;messages:string[]} | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastTool = useRef<Tool>('line')

  const logMessage = useCallback((message: string) => setLog(old => [...old.slice(-4), message]), [])
  function showNotice(message: string) { setNotice(message); logMessage(message) }
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)) } catch { /* storage disabled */ } }, [doc])
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3400)
    return () => clearTimeout(t)
  }, [notice])

  function editDoc(update: (current: CadDocument) => CadDocument) { dispatch({ type: 'edit', update }) }
  function selectSingle(id: string | null) { setSelectedId(id); setSelectedIds(id ? [id] : []) }
  function selectOnCanvas(id: string | null, extend: boolean) {
    if (!extend) { selectSingle(id); return }
    if (!id) return
    const next = selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id]
    setSelectedIds(next); setSelectedId(next.at(-1) ?? null)
  }
  function startBlockCreation() {
    const chosen = doc.entities.filter(e => selectedIds.includes(e.id))
    if (!chosen.length || chosen.some(e => !['line','polyline','rectangle','circle'].includes(e.kind)
      || !doc.layers.find(l => l.id === e.layerId)?.visible
      || doc.layers.find(l => l.id === e.layerId)?.locked)) {
      showNotice('請 Shift+點選一個或多個未鎖定的基本圖元；目前不支援巢狀圖塊。'); return
    }
    setTool('select'); setDraft(null); setEdit(null); setBlockInsert(null)
    setAnnotation(null);setBlockCreate({ ids: chosen.map(e => e.id), name: null })
    logMessage('BLOCK：請輸入圖塊名稱，再指定基準點（mm）。')
    inputRef.current?.focus()
  }
  function finishBlockCreation(base: Point) {
    if (!blockCreate?.name) return
    try {
      const blockId = uid(), insertId = uid()
      const next = createBlockFromSelection(doc, blockCreate.ids, blockCreate.name, base, blockId, insertId)
      editDoc(() => next)
      setActiveBlockId(blockId); selectSingle(insertId); setBlockCreate(null)
      logMessage(`已建立圖塊「${blockCreate.name}」，包含 ${blockCreate.ids.length} 個圖元。`)
    } catch (error) { showNotice(error instanceof Error ? error.message : '建立圖塊失敗') }
  }
  function beginInsert(blockId = activeBlockId) {
    const block = (doc.blocks ?? []).find(b => b.id === blockId) ?? (doc.blocks ?? [])[0]
    const layer = doc.layers.find(l => l.id === doc.activeLayerId)
    if (!block) { showNotice('請先從預設圖塊庫加入圖塊，或使用 B 建立圖塊。'); return }
    if (!layer?.visible || layer.locked) { showNotice('請切換到顯示且未鎖定的圖層。'); return }
    setActiveBlockId(block.id); setTool('select'); setEdit(null); setDraft(null); setBlockCreate(null)
    setAnnotation(null);setBlockInsert({ blockId: block.id }); logMessage(`INSERT：指定「${block.name}」的插入點（mm）。`)
    inputRef.current?.focus()
  }
  function placePreset(preset: LibraryPreset) {
    const layer = doc.layers.find(l => l.id === doc.activeLayerId)
    if (!layer?.visible || layer.locked) { showNotice('請先切換到可編輯圖層。'); return }
    editDoc(current => installPreset(current, preset))
    setActiveBlockId(preset.id); setTool('select'); setDraft(null); setEdit(null); setBlockCreate(null)
    setAnnotation(null);setBlockInsert({ blockId: preset.id }); logMessage(`插入預設「${preset.name}」：指定插入點。`)
    inputRef.current?.focus()
  }
  function finishInsert(point: Point) {
    if (!blockInsert) return
    const layer = doc.layers.find(l => l.id === doc.activeLayerId)
    if (!layer?.visible || layer.locked || !(doc.blocks ?? []).some(b => b.id === blockInsert.blockId)) {
      showNotice('圖塊或目前圖層不可用。'); setBlockInsert(null); return
    }
    const insertId = uid(), blockId = blockInsert.blockId
    editDoc(current => ({ ...current, entities: [...current.entities, {
      id: insertId, kind: 'insert' as const, blockId, position: point, rotation: 0, layerId: current.activeLayerId
    }] }))
    setBlockInsert(null); selectSingle(insertId); logMessage('圖塊已插入。再次輸入 I 可重複插入。')
  }
  function explodeSelected() {
    if (!selectedId) { showNotice('請先選取圖塊參照。'); return }
    try {
      const next = explodeInsert(doc, selectedId, uid)
      editDoc(() => next); selectSingle(null); setEdit(null)
      logMessage('EXPLODE：已分解圖塊，圖塊定義仍保留在圖庫。')
    } catch (error) { showNotice(error instanceof Error ? error.message : '無法分解此圖塊') }
  }
  function startAnnotation(kind:'text'|DimensionMode) {
    const layer=doc.layers.find(l=>l.id===doc.activeLayerId)
    if(!layer?.visible || layer.locked){showNotice('目前圖層已隱藏或鎖定，無法標註。');return}
    setAnnotation({kind,text:'',points:[]})
    setTool('select');setDraft(null);setEdit(null);setBlockCreate(null);setBlockInsert(null);selectSingle(null)
    logMessage(kind==='text'?'TEXT：請輸入文字內容，Enter 後指定插入點。':'DIM：請指定第一個延伸線起點。')
    inputRef.current?.focus()
  }
  function annotationPoint(point:Point) {
    if(!annotation)return
    const layer=doc.layers.find(l=>l.id===doc.activeLayerId)
    if(!layer?.visible || layer.locked){showNotice('目前圖層不可編輯。');setAnnotation(null);return}
    if(annotation.kind==='text'){
      if(!annotation.text.trim()){showNotice('請先輸入文字。');return}
      const item:CadEntity={id:uid(),kind:'text',layerId:doc.activeLayerId,
        position:point,text:annotation.text,height:newTextHeight,rotation:0}
      editDoc(d=>({...d,entities:[...d.entities,item]}))
      selectSingle(item.id);setAnnotation(null);logMessage('已建立文字，可於右側面板編輯字高及內容。')
      return
    }
    if(annotation.points.length<2){
      if(annotation.points.length===1 && distance(annotation.points[0],point)<.001){
        showNotice('兩個標註點不可重合。');return
      }
      setAnnotation({...annotation,points:[...annotation.points,point]})
      logMessage(annotation.points.length?'指定標註線位置。':'指定第二個延伸線起點。')
      return
    }
    const [start,end]=annotation.points
    const dx=Math.abs(end.x-start.x),dy=Math.abs(end.y-start.y)
    const item:CadEntity={id:uid(),kind:'dimension',layerId:doc.activeLayerId,start,end,
      placement:point,mode:annotation.kind,
      axis:dx>=dy?'horizontal':'vertical',styleId:doc.activeDimensionStyleId??'standard'}
    editDoc(d=>({...d,entities:[...d.entities,item]}))
    selectSingle(item.id);setAnnotation(null);logMessage('已建立模型空間尺寸標註。')
  }
  function updateDimensionStyle(changes:Partial<DimensionStyle>){
    const active=doc.activeDimensionStyleId??'standard'
    editDoc(d=>({...d,dimensionStyles:(d.dimensionStyles??DEFAULT_DIMENSION_STYLES).map(style=>
      style.id===active?{...style,...changes}:style)}))
  }
  function updateSelectedEntity(changes:Partial<CadEntity>){
    const e=doc.entities.find(e=>e.id===selectedId),l=e&&doc.layers.find(l=>l.id===e.layerId)
    if(!e || !l?.visible || l.locked)return
    editDoc(d=>({...d,entities:d.entities.map(item=>item.id===selectedId?{...item,...changes} as CadEntity:item)}))
  }
  function startTool(next: Tool) {
    setTool(next); setDraft(null); setEdit(null); setBlockCreate(null); setBlockInsert(null); setAnnotation(null); selectSingle(null)
    if (next !== 'select') lastTool.current = next
    logMessage(next === 'select' ? '選取物件，按 Delete 刪除。' : `${tools.find(t => t.id === next)?.label}：指定第一點。`)
  }
  function startEdit(kind: EditTool) {
    const entity = doc.entities.find(e => e.id === selectedId)
    const sourceLayer = entity && doc.layers.find(l => l.id === entity.layerId)
    if (!entity || !sourceLayer?.visible || sourceLayer.locked) {
      showNotice('請先選取可編輯的物件（圖層須顯示且未鎖定）。'); return
    }
    setTool('select'); setDraft(null); setBlockCreate(null); setBlockInsert(null); setAnnotation(null)
    setEdit({ kind, base: null })
    logMessage(`${editTools.find(t => t.id === kind)?.label}：指定基準點。`)
  }
  function finishEdit(point: Point, degrees?: number) {
    if (!edit || !selectedId) return
    if (!edit.base) {
      setEdit({ ...edit, base: point })
      logMessage(edit.kind === 'rotate' ? '旋轉：指定角度（度），或點選方向。' : '指定第二點（可以輸入 @3000,0）。')
      return
    }
    const source = doc.entities.find(e => e.id === selectedId)
    const sourceLayer = source && doc.layers.find(l => l.id === source.layerId)
    if (!source || !sourceLayer?.visible || sourceLayer.locked) { setEdit(null); showNotice('物件已不存在或圖層已鎖定。'); return }
    const angle = degrees ?? Math.atan2(point.y - edit.base.y, point.x - edit.base.x) * 180 / Math.PI
    const offset = { x: point.x - edit.base.x, y: point.y - edit.base.y }
    const result = edit.kind === 'rotate' ? rotateEntity(source, edit.base, angle) : translateEntity(source, offset)
    if (edit.kind === 'copy') {
      const clone = { ...result, id: uid() }
      editDoc(current => ({ ...current, entities: [...current.entities, clone] }))
      selectSingle(clone.id)
    } else editDoc(current => ({ ...current, entities: current.entities.map(e => e.id === source.id ? result : e) }))
    setEdit(null)
    logMessage(`${editTools.find(t => t.id === edit.kind)?.label}完成。`)
  }
  function editSelectedEntity(changes: Partial<Pick<CadEntity, 'layerId' | 'color' | 'lineweight' | 'linetype'>>) {
    if (!selectedId) return
    const source = doc.entities.find(e => e.id === selectedId)
    const sourceLayer = source && doc.layers.find(l => l.id === source.layerId)
    const destination = changes.layerId && doc.layers.find(l => l.id === changes.layerId)
    if (!source || !sourceLayer?.visible || sourceLayer.locked || (destination && (!destination.visible || destination.locked))) {
      showNotice('來源或目標圖層無法編輯。'); return
    }
    editDoc(current => ({ ...current, entities: current.entities.map(e => e.id === selectedId ? { ...e, ...changes } : e) }))
  }
  function addPoint(p: Point) {
    if (tool === 'select') return
    const layer = doc.layers.find(l => l.id === doc.activeLayerId)
    if (!layer || layer.locked || !layer.visible) { showNotice('目前圖層無法繪製，請解除鎖定或顯示。'); return }
    if (!draft || draft.tool !== tool) { setDraft({ tool, points: [p] }); logMessage(`第一點：${p.x}, ${p.y}`); return }
    const points = draft.points
    if (distance(points.at(-1)!, p) < .0001) { showNotice('請指定不同的位置。'); return }
    if (tool === 'polyline') {
      setDraft({ tool, points: [...points, p] })
      logMessage(`聚合線：${points.length} 段，Enter 結束。`)
      return
    }
    let entity: CadEntity
    if (tool === 'line') entity = { id: uid(), layerId: layer.id, kind: 'line', start: points[0], end: p }
    else if (tool === 'wall') entity = { id: uid(), layerId: layer.id, kind: 'polyline', points: wallOutline(points[0], p, wallThickness) }
    else if (tool === 'rectangle') entity = { id: uid(), layerId: layer.id, kind: 'rectangle', start: points[0], end: p }
    else entity = { id: uid(), layerId: layer.id, kind: 'circle', center: points[0], radius: distance(points[0], p) }
    editDoc(current => ({ ...current, entities: [...current.entities, entity] }))
    setDraft(null)
    logMessage(`${tools.find(t => t.id === tool)?.label}建立完成，繼續指定第一點。`)
  }
  function finishPolyline() {
    if (draft?.tool !== 'polyline' || draft.points.length < 2) { setDraft(null); return }
    const entity: CadEntity = { kind: 'polyline', id: uid(), layerId: doc.activeLayerId, points: draft.points }
    editDoc(current => ({ ...current, entities: [...current.entities, entity] }))
    setDraft(null); logMessage('聚合線已完成。')
  }
  function deleteSelected() {
    if (!selectedId) { showNotice('請先選取物件。'); return }
    const source = doc.entities.find(e => e.id === selectedId)
    const sourceLayer = source && doc.layers.find(l => l.id === source.layerId)
    if (!sourceLayer?.visible || sourceLayer.locked) { showNotice('此物件所在圖層無法編輯。'); return }
    editDoc(current => ({ ...current, entities: current.entities.filter(e => e.id !== selectedId) }))
    selectSingle(null); logMessage('已刪除所選物件。')
  }
  function fitView() {
    if (!doc.entities.length) { setCamera({ x: 0, y: 0, scale: .2 }); return }
    const p: Point[] = []
    expandedDrawing(doc).forEach(e => {
      if (!doc.layers.find(l => l.id === e.layerId)?.visible) return
      if (e.kind === 'line' || e.kind === 'rectangle') p.push(e.start, e.end)
      else if (e.kind === 'polyline') p.push(...e.points)
      else if(e.kind==='circle')p.push({x:e.center.x-e.radius,y:e.center.y-e.radius},{x:e.center.x+e.radius,y:e.center.y+e.radius})
      else p.push(...entityExtentPoints(e,e.kind==='dimension'?getDimensionStyle(doc,e.styleId):getDimensionStyle(doc)))
    })
    if (!p.length) return
    const minX = Math.min(...p.map(v => v.x)), maxX = Math.max(...p.map(v => v.x))
    const minY = Math.min(...p.map(v => v.y)), maxY = Math.max(...p.map(v => v.y))
    const availableWidth = Math.max(250, window.innerWidth - (panelOpen ? 430 : 200))
    const availableHeight = Math.max(250, window.innerHeight - 260)
    setCamera({ x: (minX+maxX)/2, y: (minY+maxY)/2, scale: Math.max(.004, Math.min(2, availableWidth / Math.max(500, (maxX-minX)*1.3), availableHeight / Math.max(500, (maxY-minY)*1.3))) })
  }
  const runCommand = (text: string) => {
    const raw = text.trim()
    if(annotation){
      if(annotation.kind==='text' && !annotation.text){
        if(!raw || raw.length>2048){showNotice('文字內容需為 1–2048 字元。');return}
        setAnnotation({...annotation,text:raw});logMessage('TEXT：請指定文字插入點。')
        return
      }
      const point=parsePointInput(raw,annotation.points.at(-1)??null,cursor)
      if(point){annotationPoint(point);return}
      if(findCommand(raw)==='cancel'){setAnnotation(null);return}
      showNotice('請輸入有效座標，例如 3000,1500 或 @3000,0。');return
    }
    if (blockCreate) {
      if (findCommand(raw) === 'cancel') { setBlockCreate(null); return }
      if (!blockCreate.name) {
        if (!raw || raw.length > 60 || (doc.blocks ?? []).some(b => b.name.toLowerCase() === raw.toLowerCase())) {
          showNotice('請輸入 1–60 字、不與現有圖塊重複的名稱。'); return
        }
        setBlockCreate({ ...blockCreate, name: raw }); logMessage('指定圖塊基準點：滑鼠點選或輸入 X,Y。')
        return
      }
      const point = parsePointInput(raw, null, cursor)
      if (point) { finishBlockCreation(point); return }
      showNotice('請輸入有效的絕對座標，例如 0,0，或在畫布上點選。'); return
    }
    if (blockInsert) {
      if (findCommand(raw) === 'cancel') { setBlockInsert(null); return }
      const point = parsePointInput(raw, null, cursor)
      if (point) { finishInsert(point); return }
      showNotice('請輸入絕對座標 X,Y 或在畫布上點選插入點。'); return
    }
    if (edit) {
      if (!raw) { showNotice('請指定基準點、下一點或旋轉角度。'); return }
      if (edit.base && edit.kind === 'rotate' && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) { finishEdit(edit.base, Number(raw)); return }
      const point = parsePointInput(raw, edit.base, cursor)
      if (point) { finishEdit(point); return }
      if (findCommand(raw) === 'cancel') { setEdit(null); return }
      showNotice(`請輸入有效的座標${edit.kind === 'rotate' ? '或角度' : ''}。`); return
    }
    if (!raw) {
      if (draft?.tool === 'polyline') finishPolyline()
      else if (draft) { setDraft(null); logMessage('已結束目前繪製。') }
      else startTool(lastTool.current)
      return
    }
    const coordinate = parsePointInput(raw, draft?.points.at(-1) ?? null, cursor)
    if (coordinate && tool !== 'select') { addPoint(coordinate); return }
    const command = findCommand(raw)
    if (!command) { showNotice(`未知指令／座標：${raw}`); return }
    switch (command) {
      case 'undo': dispatch({ type: 'undo' }); setDraft(null); selectSingle(null); return
      case 'redo': dispatch({ type: 'redo' }); setDraft(null); selectSingle(null); return
      case 'delete': deleteSelected(); return
      case 'save': downloadDocument(doc); return
      case 'fit': fitView(); return
      case 'cancel': setDraft(null); setEdit(null); startTool('select'); return
      case 'text': startAnnotation('text'); return
      case 'linearDimension': startAnnotation('linear'); return
      case 'alignedDimension': startAnnotation('aligned'); return
      case 'dimstyle': setPanelOpen(true); showNotice('請於右側「標註樣式」設定文字、箭頭及精度。'); return
      case 'block': startBlockCreation(); return
      case 'insert': beginInsert(); return
      case 'explode': explodeSelected(); return
      case 'move': case 'copy': case 'rotate': startEdit(command); return
      default: startTool(command)
    }
  }
  function handleCommandSubmit() { runCommand(commandText); setCommandText('') }
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (ev.isComposing) return
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault(); dispatch({ type: ev.shiftKey ? 'redo' : 'undo' }); setDraft(null); return
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault(); dispatch({ type: 'redo' }); setDraft(null); return
      }
      if (ev.key === 'Escape') { ev.preventDefault(); setDraft(null); setEdit(null); setBlockCreate(null); setBlockInsert(null); setAnnotation(null); setTool('select'); selectSingle(null); logMessage('已取消操作。'); return }
      if (ev.key === 'F3') { ev.preventDefault(); setOsnap(old => !old); return }
      if (ev.key === 'F8') { ev.preventDefault(); setOrtho(old => !old); return }
      if (!editing && ev.key === 'Delete') { ev.preventDefault(); deleteSelected(); return }
      if (!editing && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault(); setCommandText(t => t + ev.key); inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function exportDrawingDxf() {
    try {
      const result=exportDxf(doc)
      if(result.warnings.length && !window.confirm(
        'DXF 匯出會發生以下相容性變更：\n'+result.warnings.join('\n')
        +'\n\n繼續匯出？（建議先備份原生 JSON）'))return
      const blob=new Blob([result.text],{type:'application/dxf'})
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url;a.download=doc.name.replace(/[\\/:*?"<>|]/g,'_')+'.dxf';a.click()
      window.setTimeout(()=>URL.revokeObjectURL(url),1000)
      setExchangeReport({title:'DXF 2000 匯出完成',messages:[
        '這是 ASCII DXF（AC1015）交換子集；尚未經 AutoCAD 實際開檔驗證，請保留原生 JSON 作為主檔。',
        ...result.warnings
      ]})
      logMessage('已匯出 DXF 2000；請在外部 CAD 驗證文字、圖塊與尺寸標註。')
    }catch(error){showNotice(error instanceof Error?error.message:'DXF 匯出失敗')}
  }
  async function importFile(file?: File) {
    if(!file)return
    if(file.size>10*1024*1024){showNotice('本版限制匯入 10 MB 以下的 JSON 或 ASCII DXF。');return}
    const isDxf=/\.dxf$/i.test(file.name)
    try {
      const data=await file.text()
      let parsed:CadDocument
      let warnings:string[]=[]
      let summary=''
      if(isDxf){
        const result=importDxf(data,file.name)
        parsed=result.document
        warnings=result.warnings
        summary=`匯入 ${result.imported} 個物件，略過 ${result.skipped} 個不支援物件。`
      }else{
        parsed=parseDocument(JSON.parse(data) as unknown)
        summary=`已開啟原生圖面：${parsed.name}`
      }
      const preview=[
        '開啟此檔案將取代目前工作區圖面，請先另存原生 JSON 備份。',
        summary,
        ...warnings.slice(0,12),
        ...(warnings.length>12?['其餘警告請見後續交換紀錄。']:[]),
        '確定繼續匯入？'
      ].join('\n')
      if(!window.confirm(preview))return
      dispatch({type:'replace',document:parsed})
      setDraft(null);setEdit(null);setBlockCreate(null);setBlockInsert(null)
      setAnnotation(null);setActiveBlockId('');selectSingle(null);startTool('select')
      setExchangeReport({title:isDxf?'DXF 匯入結果':'原生 JSON 匯入結果',
        messages:[summary,...warnings,...(isDxf?['請檢查比例、圖塊、中文字型及尺寸標註；尚未驗證 DWG／完整 AutoCAD 相容性。']:[])]})
      showNotice(`已開啟：${parsed.name}`)
    }catch(error){showNotice(error instanceof Error?error.message:'無法開啟檔案')}
  }
  function addLayer() {
    const id = uid()
    editDoc(current => ({ ...current, activeLayerId: id, layers: [...current.layers, {
      id, name: `圖層 ${current.layers.length}`, color: '#7db5e9', lineweight: .25, linetype: 'continuous', visible: true, locked: false,
    }] }))
  }
  const selectedEntity = doc.entities.find(e => e.id === selectedId)
  const selectedLayer = doc.layers.find(l => l.id === selectedEntity?.layerId)
  const layer = doc.layers.find(l => l.id === doc.activeLayerId)
  const title = annotation
    ? annotation.kind==='text' ? (annotation.text?'指定文字插入點（X,Y）':'輸入要插入的繁體中文文字')
    : ['指定第一個標註點','指定第二個標註點','指定標註線位置'][annotation.points.length]
    : blockCreate ? blockCreate.name ? '指定圖塊基準點，例如 0,0' : '輸入新圖塊名稱後按 Enter' : blockInsert ? '指定圖塊插入點，例如 1500,1200' : edit ? edit.base ? (edit.kind === 'rotate' ? '輸入旋轉角度（度）或點選方向' : '指定第二點，例如 @3000,0') : '指定基準點' : draft?.tool === 'polyline' && draft.points.length >= 2 ? '指定下一點，按 Enter 完成聚合線' : draft ? '指定下一點 / 輸入距離或座標' : '輸入指令（例如 L、PL、REC、C）'

  return <div className="app">
    <header className="app-header">
      <div className="brand"><div className="brand-emblem"><Ruler size={19}/></div><div><strong>WEB<span>CAD</span></strong><small>DRAWING STUDIO</small></div></div>
      <div className="header-divider"/>
      <div className="document-name"><span className="doc-prefix">目前圖面 / </span><input aria-label="圖面名稱" value={doc.name} onChange={e => editDoc(d => ({...d, name: e.target.value}))}/><span className="unsaved-tag">本機自動儲存</span></div>
      <div className="header-actions">
        <button title="新建圖面" onClick={() => { if (window.confirm('建立新圖面？目前內容仍可從已匯出的 JSON 還原。')) { dispatch({ type: 'replace', document: createDocument() }); selectSingle(null); setDraft(null); startTool('select') } }}><FilePlus2 size={16}/><span>新建</span></button>
        <button title="開啟 JSON / DXF 檔案" onClick={() => fileRef.current?.click()}><FolderOpen size={16}/><span>開啟</span></button>
        <button title="將圖面匯出 ASCII DXF 2000" onClick={exportDrawingDxf}><ArrowDownToLine size={16}/><span>匯出 DXF</span></button>
        <button className="header-primary" title="匯出原生 JSON 主檔" onClick={() => downloadDocument(doc)}><Save size={16}/><span>備份 JSON</span></button>
        <input ref={fileRef} type="file" accept=".dxf,.json,.webcad.json,application/json,application/dxf" hidden onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = '' }}/>
      </div>
    </header>
    <div className="menu-bar"><span className="menu-active">繪圖工作區</span><span>模型空間</span><span className="menu-spacer"/><span className="prototype-indicator"><span className="prototype-dot"/> PROTOTYPE</span><span>v0.5.0</span></div>
    <div className="editor">
      <aside className="tool-rail">
        <div className="rail-heading">工具</div>
        {tools.map(({ id, Icon, label, alias }) => <button key={id} className={`rail-tool ${tool === id ? 'is-active' : ''}`} title={`${label} (${alias})`} aria-label={label} onClick={() => startTool(id)}><Icon size={20}/><span>{label}</span></button>)}
        <div className="rail-separator"/>
        <button className="rail-tool" title="T / TEXT — 插入文字" onClick={()=>startAnnotation('text')}><Type size={20}/><span>文字 T</span></button>
        <button className="rail-tool" title="DLI / DIMLINEAR — 水平／垂直尺寸" onClick={()=>startAnnotation('linear')}><Ruler size={20}/><span>線性 DLI</span></button>
        <button className="rail-tool" title="DAL / DIMALIGNED — 對齊尺寸" onClick={()=>startAnnotation('aligned')}><PencilRuler size={20}/><span>對齊 DAL</span></button>
        <div className="rail-separator"/>
        {editTools.map(({ id, Icon, label, alias }) => <button key={id} className={`rail-tool ${edit?.kind === id ? 'is-active' : ''}`} title={`${label} (${alias})；先選取物件`} aria-label={label} disabled={!selectedEntity || !selectedLayer?.visible || selectedLayer.locked} onClick={() => startEdit(id)}><Icon size={20}/><span>{label}</span></button>)}
        <div className="rail-separator"/>
        <button className="rail-tool" title="B / BLOCK — 將 Shift 多選圖元建立成圖塊" disabled={!selectedIds.length} onClick={startBlockCreation}><Box size={20}/><span>建立圖塊</span></button>
        <button className="rail-tool" title="I / INSERT — 插入圖塊" onClick={() => beginInsert()}><Copy size={20}/><span>插入圖塊</span></button>
        <button className="rail-tool" title="X / EXPLODE — 分解所選圖塊" disabled={selectedEntity?.kind !== 'insert'} onClick={explodeSelected}><Layers3 size={20}/><span>分解圖塊</span></button>
        <div className="rail-separator"/>
        <button className="rail-tool" title="刪除選取物件（Delete）" onClick={deleteSelected}><Trash2 size={20}/><span>刪除</span></button>
        <div className="rail-fill"/>
        <button className="rail-tool" title="指令說明" onClick={() => setHelpOpen(true)}><HelpCircle size={20}/><span>說明</span></button>
      </aside>
      <section className="workspace">
        <div className="context-toolbar">
          <div className="toolbar-set"><button title="復原 Ctrl+Z" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={16}/></button><button title="重做 Ctrl+Y" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={16}/></button></div>
          <div className="toolbar-divider"/>
          <div className="toolbar-set"><button className={grid ? 'pressed' : ''} title="顯示格線" onClick={() => setGrid(!grid)}><Grid3X3 size={16}/> 格線</button><button className={osnap ? 'pressed' : ''} title="物件鎖點 F3" onClick={() => setOsnap(!osnap)}><Scan size={16}/> 鎖點</button><button className={ortho ? 'pressed' : ''} title="正交 F8" onClick={() => setOrtho(!ortho)}><CornerDownLeft size={16}/> 正交</button></div>
          {tool === 'wall' && <label className="wall-thickness">牆厚 <input aria-label="牆厚（mm）" type="number" value={wallThickness} min={1} max={2000} step={10}
            onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 1 && n <= 2000) setWallThickness(n) }}/><span>mm</span></label>}
          <div className="toolbar-divider"/>
          <div className="toolbar-set"><button title="放大" onClick={() => setCamera(c => ({ ...c, scale: Math.min(40, c.scale * 1.3) }))}><ZoomIn size={17}/></button><button title="縮小" onClick={() => setCamera(c => ({ ...c, scale: Math.max(.004, c.scale / 1.3) }))}><ZoomOut size={17}/></button><button title="縮放至圖面範圍" onClick={fitView}><Scan size={16}/> 全圖</button></div>
          <div className="toolbar-fill"/><button className="panel-toggle" title="顯示／隱藏屬性面板" onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}</button>
        </div>
        <div className="canvas-wrapper">
          <CadCanvas doc={doc} tool={tool} camera={camera} onCameraChange={setCamera} draft={draft} selectedId={selectedId} selectedIds={selectedIds} textHeight={newTextHeight} cursor={cursor} onCursorChange={setCursor} onPoint={p => annotation ? annotationPoint(p) : blockCreate ? blockCreate.name ? finishBlockCreation(p) : showNotice('請先在指令列輸入圖塊名稱。') : blockInsert ? finishInsert(p) : edit ? finishEdit(p) : addPoint(p)} onSelect={selectOnCanvas} edit={edit} wallThickness={wallThickness} blockPreview={blockInsert?.blockId ?? null} pointInputMode={!!blockCreate || !!blockInsert || !!annotation} annotation={annotation} grid={grid} osnap={osnap} ortho={ortho}/>
          {notice && <div className="toast" role="status">{notice}</div>}
          {exchangeReport && <aside className="exchange-report" role="status" aria-label="檔案交換結果">
            <header><strong>{exchangeReport.title}</strong>
              <button aria-label="關閉交換紀錄" onClick={()=>setExchangeReport(null)}>×</button></header>
            {exchangeReport.messages.map((message,i)=><p key={i}>{message}</p>)}
          </aside>}
        </div>
        <section className="command-area" aria-label="CAD 指令列">
          <div className="console-history">{log.slice(-2).map((message, i) => <div key={`${i}-${message}`}>{message}</div>)}</div>
          <div className="console-entry"><span className="prompt-icon"><Command size={16}/></span><span className="prompt-label">命令:</span><input ref={inputRef} aria-label="CAD 指令輸入" spellCheck={false} autoComplete="off" placeholder={title} value={commandText} onChange={e => setCommandText(e.target.value)} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); handleCommandSubmit() } }} /><button title="執行指令" onClick={handleCommandSubmit}><CornerDownLeft size={16}/></button></div>
        </section>
      </section>
      {panelOpen && <aside className="property-panel">
        <div className="panel-section-heading"><span><Layers3 size={17}/> 圖層管理</span><button aria-label="新增圖層" title="新增圖層" onClick={addLayer}><Plus size={16}/></button></div>
        <div className="layer-table-head"><span>圖層名稱</span><span>顯示</span><span>鎖定</span></div>
        <div className="layer-list">
          {doc.layers.map(l => <div key={l.id} className={`layer-row ${l.id === doc.activeLayerId ? 'selected' : ''}`}>
            <button className="layer-name" title="設為目前圖層" onClick={() => editDoc(d => ({ ...d, activeLayerId: l.id }))}><span className="layer-dot" style={{ background: l.color }}/><span>{l.name}</span></button>
            <button title={l.visible ? '隱藏圖層' : '顯示圖層'} onClick={() => editDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, visible: !x.visible } : x) }))}>{l.visible ? <Eye size={15}/> : <EyeOff size={15}/>}</button>
            <button title={l.locked ? '解鎖圖層' : '鎖定圖層'} onClick={() => editDoc(d => ({ ...d, layers: d.layers.map(x => x.id === l.id ? { ...x, locked: !x.locked } : x) }))}>{l.locked ? <LockKeyhole size={15}/> : <UnlockKeyhole size={15}/>}</button>
          </div>)}
        </div>
        <div className="panel-divider"/>
        <div className="panel-section-heading"><span><Ruler size={17}/> 目前圖層屬性</span></div>
        <div className="properties">
          <label>圖層名稱<input value={layer?.name ?? ''} onChange={e => editDoc(d => ({ ...d, layers: d.layers.map(l => l.id === d.activeLayerId ? { ...l, name: e.target.value } : l) }))}/></label>
          <label>線條顏色<div className="property-control"><input type="color" aria-label="線條顏色" value={layer?.color ?? '#ffffff'} onChange={e => editDoc(d => ({...d, layers: d.layers.map(l => l.id === d.activeLayerId ? { ...l, color: e.target.value } : l)}))}/><span>{layer?.color.toUpperCase()}</span></div></label>
          <label>線粗（mm）<select value={layer?.lineweight ?? .25} onChange={e => editDoc(d => ({...d, layers: d.layers.map(l => l.id === d.activeLayerId ? { ...l, lineweight: Number(e.target.value) } : l)}))}>{[.09,.13,.18,.25,.35,.5,.7,1,1.4].map(v => <option value={v} key={v}>{v.toFixed(2)} mm</option>)}</select></label>
          <label>線型<select aria-label="目前圖層線型" value={layer?.linetype ?? 'continuous'} onChange={e => editDoc(d => ({...d, layers: d.layers.map(l => l.id === d.activeLayerId ? { ...l, linetype: e.target.value as LineType } : l)}))}>{linetypes.map(x => <option value={x.id} key={x.id}>{x.label}</option>)}</select></label>
          <label>套用原則<div className="read-only-property">ByLayer <span>（預設依圖層）</span></div></label>
        </div>
        <div className="panel-divider"/>
        <div className="panel-section-heading"><span><MousePointer2 size={17}/> 物件資訊</span></div>
        <div className="info-block">{selectedEntity ? <>
          <p>類型　{({ line: '直線', polyline: '聚合線', rectangle: '矩形', circle: '圓形', insert: '圖塊參照', text: '文字', dimension: '尺寸標註' } as Record<string, string>)[selectedEntity.kind]}</p>
          <p>ID　{selectedEntity.id.slice(0, 8)}　{selectedLayer?.locked ? '（已鎖定）' : ''}</p>
          {selectedEntity.kind==='text' && <div className="annotation-entity-controls">
            <label>文字內容<textarea aria-label="編輯文字內容" rows={3} value={selectedEntity.text}
              disabled={selectedLayer?.locked || !selectedLayer?.visible} onChange={e=>{
                const v=e.target.value;if(v.length>2048)return;updateSelectedEntity({text:v||' '})}}/></label>
            <label>文字高度 (mm)<input type="number" aria-label="文字高度（mm）" min={1} max={10000}
              value={selectedEntity.height} disabled={selectedLayer?.locked}
              onChange={e=>{const n=Number(e.target.value);if(n>0&&n<=10000)updateSelectedEntity({height:n})}}/></label>
            <label>旋轉角度 (°)<input type="number" aria-label="文字旋轉角度" value={selectedEntity.rotation}
              disabled={selectedLayer?.locked} onChange={e=>{
                const n=Number(e.target.value);if(Number.isFinite(n))updateSelectedEntity({rotation:n})}}/></label>
          </div>}
          {selectedEntity.kind==='dimension' && <div className="annotation-entity-controls">
            <label>標註樣式<select aria-label="所選尺寸樣式" value={selectedEntity.styleId} disabled={selectedLayer?.locked}
              onChange={e=>updateSelectedEntity({styleId:e.target.value})}>
              {(doc.dimensionStyles??DEFAULT_DIMENSION_STYLES).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
            <label>尺寸方向<select aria-label="尺寸方向" value={selectedEntity.mode==='aligned'?'aligned':selectedEntity.axis}
              disabled={selectedLayer?.locked} onChange={e=>updateSelectedEntity(e.target.value==='aligned'
                ? {mode:'aligned'}:{mode:'linear',axis:e.target.value as 'horizontal'|'vertical'})}>
              <option value="horizontal">水平</option><option value="vertical">垂直</option><option value="aligned">對齊實際長度</option>
            </select></label>
          </div>}
          {selectedEntity.kind === 'insert' && <>
            <p>圖塊　{(doc.blocks ?? []).find(b => b.id === selectedEntity.blockId)?.name ?? '找不到定義'}</p>
            <label className="block-angle">角度（度）<input type="number" step="15" value={selectedEntity.rotation}
              disabled={selectedLayer?.locked || !selectedLayer?.visible}
              onChange={e => { const a = Number(e.target.value); if (!Number.isFinite(a)) return
                editDoc(d => ({ ...d, entities: d.entities.map(item => item.id === selectedEntity.id && item.kind === 'insert' ? { ...item, rotation: a } : item) })) }}/></label>
          </>}
          <div className="entity-properties">
            <label>物件圖層<select aria-label="物件圖層" value={selectedEntity.layerId} disabled={selectedLayer?.locked} onChange={e => editSelectedEntity({ layerId: e.target.value })}>{doc.layers.map(l => <option key={l.id} value={l.id} disabled={!l.visible || l.locked}>{l.name}</option>)}</select></label>
            <label>物件顏色<select aria-label="物件顏色模式" value={selectedEntity.color && selectedEntity.color !== 'ByLayer' ? 'custom' : 'ByLayer'} disabled={selectedLayer?.locked} onChange={e => editSelectedEntity({ color: e.target.value === 'ByLayer' ? 'ByLayer' : selectedLayer?.color ?? '#ffffff' })}><option value="ByLayer">ByLayer — 依圖層</option><option value="custom">指定顏色</option></select></label>
            {selectedEntity.color && selectedEntity.color !== 'ByLayer' && <input aria-label="物件自訂顏色" type="color" value={selectedEntity.color} disabled={selectedLayer?.locked} onChange={e => editSelectedEntity({ color: e.target.value })}/>}
            <label>物件線粗<select aria-label="物件線粗" value={selectedEntity.lineweight ?? 'ByLayer'} disabled={selectedLayer?.locked} onChange={e => editSelectedEntity({ lineweight: e.target.value === 'ByLayer' ? 'ByLayer' : Number(e.target.value) })}><option value="ByLayer">ByLayer — 依圖層</option>{weights.map(v => <option key={v} value={v}>{v.toFixed(2)} mm</option>)}</select></label>
            <label>物件線型<select aria-label="物件線型" value={selectedEntity.linetype ?? 'ByLayer'} disabled={selectedLayer?.locked} onChange={e => editSelectedEntity({ linetype: e.target.value as LineType | 'ByLayer' })}><option value="ByLayer">ByLayer — 依圖層</option>{linetypes.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          </div>
          <button className="delete-action" disabled={selectedLayer?.locked} onClick={deleteSelected}><Trash2 size={14}/> 刪除所選物件</button>
          </> : <p>尚未選取物件。<br/>使用左側選取工具點擊圖形。</p>}</div>
        <div className="panel-divider"/>
        <div className="panel-section-heading"><span><Box size={17}/> 室內設計圖塊庫</span></div>
        <div className="block-library">
          <p>Shift+點選多個圖元 · 已選 {selectedIds.length} 個</p>
          <button className="block-action" disabled={!selectedIds.length} onClick={startBlockCreation}>B — 將所選圖元建立圖塊</button>
          <label>目前圖面圖塊
            <select aria-label="選擇圖塊" value={(doc.blocks ?? []).some(b => b.id === activeBlockId) ? activeBlockId : (doc.blocks ?? [])[0]?.id ?? ''}
              onChange={e => setActiveBlockId(e.target.value)}>
              {!(doc.blocks ?? []).length && <option value="">尚未建立圖塊</option>}
              {(doc.blocks ?? []).map(b => <option key={b.id} value={b.id}>{b.name}（{b.entities.length} 件）</option>)}
            </select>
          </label>
          <button className="block-action" disabled={!(doc.blocks ?? []).length} onClick={() => beginInsert()}>I — 插入選擇的圖塊</button>
          {selectedEntity?.kind === 'insert' && <button className="block-action" onClick={explodeSelected}>X — 分解所選圖塊</button>}
          <div className="block-preset-title">預設平面圖塊（單位 mm）</div>
          {BUILTIN_BLOCKS.map(preset => <div className="block-preset" key={preset.id}>
            <div><strong>{preset.name}</strong><small>{preset.category}</small></div>
            <button title={`插入 ${preset.name}`} onClick={() => placePreset(preset)}>插入</button>
          </div>)}
          <p>預設符號僅為簡化示意，實際門型與家具尺寸請依施工規格調整。</p>
        </div>
        <div className="panel-divider"/>
        <div className="panel-section-heading"><span><PencilRuler size={17}/> 標註樣式</span></div>
        <div className="annotation-style-controls">
          <label>目前樣式<select aria-label="目前標註樣式" value={doc.activeDimensionStyleId??'standard'}
            onChange={e=>editDoc(d=>({...d,activeDimensionStyleId:e.target.value}))}>
            {(doc.dimensionStyles??DEFAULT_DIMENSION_STYLES).map(style=><option key={style.id} value={style.id}>{style.name}</option>)}
          </select></label>
          {([
            ['textHeight','文字高度（mm）'],['arrowSize','箭頭大小（mm）'],['textGap','文字距離（mm）'],
            ['extensionGap','延伸線起始間距（mm）'],['extensionBeyond','延伸線超出距離（mm）'],
          ] as const).map(([key,label])=><label key={key}>{label}
            <input type="number" min={key==='textHeight'||key==='arrowSize'?1:0} max={10000} step={5}
              value={getDimensionStyle(doc)[key]} onChange={e=>{
                const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v<=10000
                  &&(key!=='textHeight'&&key!=='arrowSize'||v>0))updateDimensionStyle({[key]:v})}}/>
          </label>)}
          <label>尺寸小數位數<select aria-label="尺寸精度" value={getDimensionStyle(doc).precision}
            onChange={e=>updateDimensionStyle({precision:Number(e.target.value)})}>
            {[0,1,2,3].map(n=><option key={n} value={n}>{n} 位</option>)}
          </select></label>
          <label>單位後綴（可留空）<input aria-label="尺寸單位後綴" maxLength={16}
            value={getDimensionStyle(doc).suffix} onChange={e=>updateDimensionStyle({suffix:e.target.value})}/></label>
          <label>新增文字高度（mm）<input type="number" min={1} max={10000} value={newTextHeight}
            onChange={e=>{const n=Number(e.target.value);if(n>0&&n<=10000)setNewTextHeight(n)}}/></label>
          <p>標註尺寸由幾何座標計算，標註樣式變更會套用至共用此樣式的尺寸。</p>
        </div>
        <div className="panel-footer"><span className="footer-label">快速開始</span><button onClick={() => { if (doc.entities.length && !window.confirm('載入示範圖面會取代目前內容，確定繼續？')) return; dispatch({ type: 'replace', document: sampleDocument() }); selectSingle(null); setDraft(null); setBlockInsert(null); setBlockCreate(null); setAnnotation(null); setActiveBlockId(''); setCamera({ x: 3000, y: 2100, scale: .12 }); showNotice('已載入可編輯的室內平面示範圖。') }}>載入示範平面圖 <ArrowDownToLine size={15}/></button></div>
      </aside>}
    </div>
    <footer className="status-bar"><div className="status-coordinates"><span className="status-mini-label">座標</span> X {cursor.x.toFixed(1)} <span className="status-sep">·</span> Y {cursor.y.toFixed(1)}</div><div className="status-spacer"/><span>圖元 {doc.entities.length}</span><span className="status-sep">|</span><span>比例 {(camera.scale * 100).toFixed(1)}%</span><span className="status-sep">|</span><span className="unit-tag">毫米 (mm)</span><span className="status-sep">|</span><span>MODEL</span><span className="connection-tag"><span/> LOCAL</span></footer>
    {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-label="操作與指令說明" onClick={e => e.stopPropagation()}><div className="help-head"><div><h2>快捷指令與操作</h2><p>WEB CAD / v0.5.0</p></div><button onClick={() => setHelpOpen(false)} aria-label="關閉說明">✕</button></div><div className="help-grid">{[
      ['檔案交換', '開啟可匯入 ASCII DXF 2000；右上可匯出 DXF 或備份 JSON'],
      ['T / TEXT', '輸入繁體中文文字 → 指定插入點'], ['DLI / DIMLINEAR', '兩點 → 尺寸線位置（水平或垂直）'],
      ['DAL / DIMALIGNED', '兩點 → 尺寸線位置（實際長度）'], ['D / DIMSTYLE', '打開右側標註樣式設定'],
      ['L / LINE', '直線'], ['W / WALL', '單段等厚雙線牆（牆厚工具列設定）'], ['PL / PLINE', '聚合線（Enter 完成）'], ['REC / RECTANG', '矩形'], ['C / CIRCLE', '圓形'],
      ['B / BLOCK', 'Shift+點選多個基本圖元 → 輸入名稱 → 指定基準點'], ['I / INSERT', '插入圖面圖塊庫中的圖塊'], ['X / EXPLODE', '分解已選取圖塊參照'],
      ['Shift+點選', '加入或移除多重選取（B 建立圖塊）'],
      ['M / MOVE', '移動所選物件：基準點 → 目標點'], ['CO / COPY', '複製所選物件：基準點 → 目標點'], ['RO / ROTATE', '旋轉所選物件：中心點 → 角度（度）'], ['E / ERASE', '刪除已選取物件'], ['U / UNDO', '復原'], ['REDO', '重做'], ['Z / ZOOM', '縮放至全圖'], ['SAVE', '匯出原生 JSON'],
      ['100,200', '絕對座標 (mm)'], ['@3000,0', '相對座標 (mm)'], ['@1000<90', '相對極座標'], ['1500', '從上一點沿游標方向指定距離'],
      ['交點鎖點', '線段／聚合線／矩形／圓的有限交點'], ['F3', '切換物件鎖點'], ['F8', '切換正交'], ['Esc', '取消操作'], ['中鍵拖曳', '平移畫布'], ['滾輪', '游標處縮放'], ['Ctrl+Z / Ctrl+Y', '復原／重做'],
    ].map(([cmd, desc]) => <div key={cmd}><code>{cmd}</code><span>{desc}</span></div>)}</div><p className="help-note">目前提供基本精準繪圖、圖層與單物件編輯。僅支援原生 .webcad.json；DWG、完整 DXF 格式相容性與正式施工圖出圖仍在後續規劃中；目前尺寸標註是獨立圖元，尚未與其他圖元建立尺寸關聯；本版圖塊僅支援一層參照、無巢狀及動態圖塊。</p></div></div>}
  </div>
}
