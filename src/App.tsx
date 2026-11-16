import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  ArrowDownToLine, Circle, Command, CornerDownLeft, FilePlus2, FolderOpen, Grid3X3,
  HelpCircle, Layers3, LockKeyhole, Minus, MousePointer2, PanelRightClose, PanelRightOpen,
  PenLine, Plus, Redo2, Ruler, Save, Scan, Square, Trash2, Undo2,
  UnlockKeyhole, Eye, EyeOff, ZoomIn, ZoomOut,
} from 'lucide-react'
import CadCanvas from './components/CadCanvas'
import { findCommand, parsePointInput } from './cad/commands'
import { createDocument, documentReducer, parseDocument, STORAGE_KEY, uid } from './cad/document'
import { distance } from './cad/geometry'
import type { CadDocument, CadEntity, Camera, Draft, Point, Tool } from './cad/types'

const tools: { id: Tool; label: string; alias: string; Icon: typeof Minus }[] = [
  { id: 'select', label: '選取', alias: 'SELECT', Icon: MousePointer2 },
  { id: 'line', label: '直線', alias: 'L', Icon: Minus },
  { id: 'polyline', label: '聚合線', alias: 'PL', Icon: PenLine },
  { id: 'rectangle', label: '矩形', alias: 'REC', Icon: Square },
  { id: 'circle', label: '圓形', alias: 'C', Icon: Circle },
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
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [grid, setGrid] = useState(true)
  const [osnap, setOsnap] = useState(true)
  const [ortho, setOrtho] = useState(false)
  const [commandText, setCommandText] = useState('')
  const [log, setLog] = useState<string[]>(['Web CAD v0.1.0 已啟動。輸入 L 或 PL 開始繪圖。'])
  const [panelOpen, setPanelOpen] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
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
  function startTool(next: Tool) {
    setTool(next); setDraft(null); setSelectedId(null)
    if (next !== 'select') lastTool.current = next
    logMessage(next === 'select' ? '選取物件，按 Delete 刪除。' : `${tools.find(t => t.id === next)?.label}：指定第一點。`)
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
    editDoc(current => ({ ...current, entities: current.entities.filter(e => e.id !== selectedId) }))
    setSelectedId(null); logMessage('已刪除所選物件。')
  }
  function fitView() {
    if (!doc.entities.length) { setCamera({ x: 0, y: 0, scale: .2 }); return }
    const p: Point[] = []
    doc.entities.forEach(e => {
      if (!doc.layers.find(l => l.id === e.layerId)?.visible) return
      if (e.kind === 'line' || e.kind === 'rectangle') p.push(e.start, e.end)
      else if (e.kind === 'polyline') p.push(...e.points)
      else p.push({ x: e.center.x-e.radius, y: e.center.y-e.radius }, { x: e.center.x+e.radius, y: e.center.y+e.radius })
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
      case 'undo': dispatch({ type: 'undo' }); setDraft(null); setSelectedId(null); return
      case 'redo': dispatch({ type: 'redo' }); setDraft(null); setSelectedId(null); return
      case 'delete': deleteSelected(); return
      case 'save': downloadDocument(doc); return
      case 'fit': fitView(); return
      case 'cancel': setDraft(null); startTool('select'); return
      default: startTool(command)
    }
  }
  function handleCommandSubmit() { runCommand(commandText); setCommandText('') }
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault(); dispatch({ type: ev.shiftKey ? 'redo' : 'undo' }); setDraft(null); return
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault(); dispatch({ type: 'redo' }); setDraft(null); return
      }
      if (ev.key === 'Escape') { ev.preventDefault(); setDraft(null); setTool('select'); setSelectedId(null); logMessage('已取消操作。'); return }
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

  async function importFile(file?: File) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { showNotice('本版僅接受 10 MB 以下的原生 JSON 圖面。'); return }
    try {
      const parsed = parseDocument(JSON.parse(await file.text()) as unknown)
      dispatch({ type: 'replace', document: parsed }); setDraft(null); setSelectedId(null); startTool('select')
      showNotice(`已開啟：${parsed.name}`)
    } catch (error) { showNotice(error instanceof Error ? error.message : '無法開啟此檔案') }
  }
  function addLayer() {
    const id = uid()
    editDoc(current => ({ ...current, activeLayerId: id, layers: [...current.layers, {
      id, name: `圖層 ${current.layers.length}`, color: '#7db5e9', lineweight: .25, visible: true, locked: false,
    }] }))
  }
  const selectedEntity = doc.entities.find(e => e.id === selectedId)
  const layer = doc.layers.find(l => l.id === doc.activeLayerId)
  const title = draft?.tool === 'polyline' && draft.points.length >= 2 ? '指定下一點，按 Enter 完成聚合線' : draft ? '指定下一點 / 輸入距離或座標' : '輸入指令（例如 L、PL、REC、C）'

  return <div className="app">
    <header className="app-header">
      <div className="brand"><div className="brand-emblem"><Ruler size={19}/></div><div><strong>WEB<span>CAD</span></strong><small>DRAWING STUDIO</small></div></div>
      <div className="header-divider"/>
      <div className="document-name"><span className="doc-prefix">目前圖面 / </span><input aria-label="圖面名稱" value={doc.name} onChange={e => editDoc(d => ({...d, name: e.target.value}))}/><span className="unsaved-tag">本機自動儲存</span></div>
      <div className="header-actions">
        <button title="新建圖面" onClick={() => { if (window.confirm('建立新圖面？目前內容仍可從已匯出的 JSON 還原。')) { dispatch({ type: 'replace', document: createDocument() }); setSelectedId(null); setDraft(null); startTool('select') } }}><FilePlus2 size={16}/><span>新建</span></button>
        <button title="開啟原生圖面 JSON" onClick={() => fileRef.current?.click()}><FolderOpen size={16}/><span>開啟</span></button>
        <button className="header-primary" title="匯出 JSON 圖面" onClick={() => downloadDocument(doc)}><Save size={16}/><span>儲存圖面</span></button>
        <input ref={fileRef} type="file" accept=".json,.webcad.json,application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = '' }}/>
      </div>
    </header>
    <div className="menu-bar"><span className="menu-active">繪圖工作區</span><span>模型空間</span><span className="menu-spacer"/><span className="prototype-indicator"><span className="prototype-dot"/> PROTOTYPE</span><span>v0.1.0</span></div>
    <div className="editor">
      <aside className="tool-rail">
        <div className="rail-heading">工具</div>
        {tools.map(({ id, Icon, label, alias }) => <button key={id} className={`rail-tool ${tool === id ? 'is-active' : ''}`} title={`${label} (${alias})`} aria-label={label} onClick={() => startTool(id)}><Icon size={20}/><span>{label}</span></button>)}
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
          <div className="toolbar-divider"/>
          <div className="toolbar-set"><button title="放大" onClick={() => setCamera(c => ({ ...c, scale: Math.min(40, c.scale * 1.3) }))}><ZoomIn size={17}/></button><button title="縮小" onClick={() => setCamera(c => ({ ...c, scale: Math.max(.004, c.scale / 1.3) }))}><ZoomOut size={17}/></button><button title="縮放至圖面範圍" onClick={fitView}><Scan size={16}/> 全圖</button></div>
          <div className="toolbar-fill"/><button className="panel-toggle" title="顯示／隱藏屬性面板" onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}</button>
        </div>
        <div className="canvas-wrapper">
          <CadCanvas doc={doc} tool={tool} camera={camera} onCameraChange={setCamera} draft={draft} selectedId={selectedId} cursor={cursor} onCursorChange={setCursor} onPoint={addPoint} onSelect={setSelectedId} grid={grid} osnap={osnap} ortho={ortho}/>
          {notice && <div className="toast" role="status">{notice}</div>}
        </div>
        <section className="command-area" aria-label="CAD 指令列">
          <div className="console-history">{log.slice(-2).map((message, i) => <div key={`${i}-${message}`}>{message}</div>)}</div>
          <div className="console-entry"><span className="prompt-icon"><Command size={16}/></span><span className="prompt-label">命令:</span><input ref={inputRef} aria-label="CAD 指令輸入" spellCheck={false} autoComplete="off" placeholder={title} value={commandText} onChange={e => setCommandText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCommandSubmit() } }} /><button title="執行指令" onClick={handleCommandSubmit}><CornerDownLeft size={16}/></button></div>
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
          <label>套用原則<div className="read-only-property">ByLayer <span>（依圖層）</span></div></label>
        </div>
        <div className="panel-divider"/>
        <div className="panel-section-heading"><span><MousePointer2 size={17}/> 物件資訊</span></div>
        <div className="info-block">{selectedEntity ? <><p>類型　{({ line: '直線', polyline: '聚合線', rectangle: '矩形', circle: '圓形' } as Record<string, string>)[selectedEntity.kind]}</p><p>ID　{selectedEntity.id.slice(0, 8)}</p><button className="delete-action" onClick={deleteSelected}><Trash2 size={14}/> 刪除所選物件</button></> : <p>尚未選取物件。<br/>使用左側選取工具點擊圖形。</p>}</div>
        <div className="panel-footer"><span className="footer-label">快速開始</span><button onClick={() => { if (doc.entities.length && !window.confirm('載入示範圖面會取代目前內容，確定繼續？')) return; dispatch({ type: 'replace', document: sampleDocument() }); setSelectedId(null); setDraft(null); setCamera({ x: 3000, y: 2100, scale: .12 }); showNotice('已載入可編輯的室內平面示範圖。') }}>載入示範平面圖 <ArrowDownToLine size={15}/></button></div>
      </aside>}
    </div>
    <footer className="status-bar"><div className="status-coordinates"><span className="status-mini-label">座標</span> X {cursor.x.toFixed(1)} <span className="status-sep">·</span> Y {cursor.y.toFixed(1)}</div><div className="status-spacer"/><span>圖元 {doc.entities.length}</span><span className="status-sep">|</span><span>比例 {(camera.scale * 100).toFixed(1)}%</span><span className="status-sep">|</span><span className="unit-tag">毫米 (mm)</span><span className="status-sep">|</span><span>MODEL</span><span className="connection-tag"><span/> LOCAL</span></footer>
    {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-label="操作與指令說明" onClick={e => e.stopPropagation()}><div className="help-head"><div><h2>快捷指令與操作</h2><p>WEB CAD / v0.1.0</p></div><button onClick={() => setHelpOpen(false)} aria-label="關閉說明">✕</button></div><div className="help-grid">{[
      ['L / LINE', '直線'], ['PL / PLINE', '聚合線（Enter 完成）'], ['REC / RECTANG', '矩形'], ['C / CIRCLE', '圓形'],
      ['E / ERASE', '刪除已選取物件'], ['U / UNDO', '復原'], ['REDO', '重做'], ['Z / ZOOM', '縮放至全圖'], ['SAVE', '匯出原生 JSON'],
      ['100,200', '絕對座標 (mm)'], ['@3000,0', '相對座標 (mm)'], ['@1000<90', '相對極座標'], ['1500', '從上一點沿游標方向指定距離'],
      ['F3', '切換物件鎖點'], ['F8', '切換正交'], ['Esc', '取消操作'], ['中鍵拖曳', '平移畫布'], ['滾輪', '游標處縮放'], ['Ctrl+Z / Ctrl+Y', '復原／重做'],
    ].map(([cmd, desc]) => <div key={cmd}><code>{cmd}</code><span>{desc}</span></div>)}</div><p className="help-note">注意：目前僅支援本專案的 .webcad.json 檔案。DWG、DXF、圖塊、標註與施工圖出圖仍在後續規劃中。</p></div></div>}
  </div>
}
