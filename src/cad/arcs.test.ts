import {describe,it,expect} from 'vitest'
import {createDocument,documentReducer,parseDocument} from './document'
import {arcFromThreePoints,arcPoint,arcSweep,arcContainsAngle,arcExtents,
  arcSegmentIntersections,arcCircleIntersections,normalizeAngle} from './arcs'
import {hitTest,entitySnaps,nearestIntersection} from './geometry'
import {translateEntity,rotateEntity} from './editing'
import {createBlockFromSelection,expandInsert} from './blocks'
import {exportDxf,importDxf} from './dxf'
import {buildPlot,DEFAULT_PLOT_OPTIONS,drawingBounds} from './plot'
import {trimDocument,offsetEntity} from './precisionEdit'
import {joinLines,windowSelection,extendLine} from './advancedEditing'
import type {ArcEntity,CadEntity,LineEntity} from './types'
import type {History} from './document'
const P=(x:number,y:number)=>({x,y})
const arc=(id='arc',startAngle=0,endAngle=180):ArcEntity=>({
  id,kind:'arc',layerId:'wall',center:P(0,0),radius:100,startAngle,endAngle
})
const line=(id:string,ax:number,ay:number,bx:number,by:number):LineEntity=>({
  id,kind:'line',layerId:'wall',start:P(ax,ay),end:P(bx,by)
})
const doc=(entities:CadEntity[])=>({...createDocument(),entities})
describe('v0.9.0 true ARC geometry',()=>{
 it('uses three-point circular construction rather than faceted straight segments',()=>{
   const value=arcFromThreePoints(P(100,0),P(0,100),P(-100,0),'a','wall')
   expect(value).toMatchObject({kind:'arc',center:P(0,0),radius:100,startAngle:0,endAngle:180})
   expect(arcPoint(value,.5).y).toBeCloseTo(100,5)
   expect(arcPoint(value,0)).toEqual(P(100,0))
 })
 it('reverses clockwise input order to a CCW lower semicircle without changing geometry',()=>{
   const value=arcFromThreePoints(P(100,0),P(0,-100),P(-100,0),'a','wall')
   expect(value.startAngle).toBe(180)
   expect(value.endAngle).toBe(0)
   expect(arcSweep(value)).toBe(180)
   expect(arcPoint(value,.5).y).toBeCloseTo(-100,5)
 })
 it('represents arcs crossing 0 degrees with exact normalized sweep',()=>{
   const a=arc('wrapped',350,20)
   expect(arcSweep(a)).toBe(30)
   expect(arcContainsAngle(a,0)).toBe(true)
   expect(arcContainsAngle(a,10)).toBe(true)
   expect(arcContainsAngle(a,170)).toBe(false)
   const p=arcPoint(a,.5)
   expect(Math.atan2(p.y,p.x)*180/Math.PI).toBeCloseTo(5,5)
   expect(normalizeAngle(-10)).toBe(350)
 })
 it('finds cardinal bounding points without including absent half of the circle',()=>{
   expect(arcExtents(arc('top',0,180)).some(p=>p.y>99)).toBe(true)
   const b=drawingBounds(doc([arc('narrow',0,90)]))
   expect(b).toMatchObject({minX:0,minY:0,maxX:100,maxY:100})
 })
 it('rejects collinear points and invalid native angles in JSON',()=>{
   expect(()=>arcFromThreePoints(P(0,0),P(100,0),P(200,0),'a','0')).toThrow()
   expect(()=>parseDocument(doc([arc('invalid',30,30)]))).toThrow()
   expect(()=>parseDocument(doc([{...arc(),radius:-1}]))).toThrow()
   expect(()=>parseDocument(doc([{...arc(),startAngle:360}]))).toThrow()
 })
 it('uses bounded arc hit-testing, center snaps, endpoints and mid-arc snap',()=>{
   const a=arc('top',0,180)
   expect(hitTest(P(0,100),a)).toBeLessThan(.001)
   expect(hitTest(P(0,-100),a)).toBeGreaterThan(100)
   const snaps=entitySnaps(a)
   expect(snaps).toHaveLength(4)
   expect(snaps[1].point.x).toBeCloseTo(-100,5)
   expect(snaps[2].point.y).toBeCloseTo(100,5)
 })
 it('intersects only actual finite arc and segment portions',()=>{
   const a=arc('semicircle',0,180)
   const hits=arcSegmentIntersections(a,P(50,-200),P(50,200))
   expect(hits).toHaveLength(1)
   expect(hits[0]).toMatchObject({x:50})
   expect(hits[0].y).toBeCloseTo(Math.sqrt(7500),3)
   expect(arcSegmentIntersections(a,P(50,-200),P(50,-10))).toEqual([])
   expect(arcCircleIntersections(a,P(100,0),100)).toHaveLength(1)
   const d=doc([a,line('vertical',50,-200,50,200)])
   const snap=nearestIntersection(P(50,87),d.entities,new Set(['wall']),5)
   expect(snap?.kind).toBe('交點')
 })
 it('trims clicked interior span to two analytic arc pieces with original style',()=>{
   const a=arc('target',0,180)
   const c1=line('left',-50,-200,-50,200),c2=line('right',50,-200,50,200)
   const before=doc([a,c1,c2])
   const after=trimDocument(before,[c1.id,c2.id],a.id,P(0,100),()=> 'remnant')
   expect(after.entities).toHaveLength(4)
   expect(after.entities[0]).toMatchObject({kind:'arc',id:'target',startAngle:0,endAngle:60})
   expect(after.entities[1]).toMatchObject({kind:'arc',id:'remnant',startAngle:120,endAngle:180})
   expect(after.entities[2]).toEqual(c1)
   expect(after.entities[3]).toEqual(c2)
   expect(before.entities[0]).toEqual(a)
 })
 it('rejects trim when no bounded crossing and honors locked layers',()=>{
   const a=arc()
   const b=line('far',500,0,500,100)
   const d=doc([a,b])
   expect(()=>trimDocument(d,['far'],'arc',P(0,100),()=> 'a')).toThrow('交點')
   d.layers.find(l=>l.id==='wall')!.locked=true
   expect(()=>trimDocument(d,['far'],'arc',P(0,100),()=> 'a')).toThrow('鎖定')
 })
 it('accepts ARC as trim cutter of LINE and as EXTEND boundary',()=>{
   const a=arc('boundary',0,180)
   const d=doc([a,line('horizontal',-150,50,150,50)])
   const next=trimDocument(d,[a.id],'horizontal',P(0,50),()=> 'two')
   expect(next.entities.filter(e=>e.kind==='line')).toHaveLength(2)
   const ext=doc([arc('b',0,180),line('target',0,0,0,50)])
   expect(extendLine(ext,['b'],'target',P(0,50)).entities[1]).toMatchObject({end:P(0,100)})
 })
 it('radially offsets arcs retaining start/end angles and source layer',()=>{
   const a=arc('a',350,20)
   expect(offsetEntity(a,20,P(130,0))).toMatchObject({radius:120,startAngle:350,endAngle:20})
   expect(offsetEntity(a,20,P(80,0))).toMatchObject({radius:80,startAngle:350,endAngle:20})
 })
 it('supports rotate/translate and copy as native ARC with exact independent angles',()=>{
   const a=arc('a',350,20)
   expect(translateEntity(a,P(300,-400))).toMatchObject({center:P(300,-400)})
   expect(rotateEntity(a,P(0,0),20)).toMatchObject({startAngle:10,endAngle:40,center:P(0,0)})
 })
 it('can be included in basic blocks and expanded as rotated analytic arc',()=>{
   let d=doc([arc('a',0,90)])
   d=createBlockFromSelection(d,['a'],'弧形家具',P(0,0),'block','insert')
   const ins=d.entities[0]
   if(ins.kind!=='insert')throw Error('Expected INSERT')
   const parts=expandInsert(ins,d.blocks??[])
   expect(parts).toHaveLength(1)
   expect(parts[0]).toMatchObject({kind:'arc',radius:100,startAngle:0,endAngle:90})
 })
 it('produces true SVG A-path and accurate paper extents for a wrapped arc',()=>{
   const d=doc([arc('a',350,20)])
   const svg=buildPlot(d,{...DEFAULT_PLOT_OPTIONS,scale:50})
   expect(svg.fits).toBe(true)
   expect(svg.svg).toContain('<path')
   expect(svg.svg).toContain(' A 2 2 0 0 0 ')
   expect(svg.modelBounds.maxX).toBeCloseTo(100,5)
 })
 it('roundtrips DXF ARC including angular wrap and native BLOCK ARC',()=>{
   const d=doc([arc('native',350,20)])
   const dx=exportDxf(d)
   expect(dx.warnings).toEqual([])
   expect(dx.text).toContain('0\r\nARC')
   expect(dx.text).toContain('100\r\nAcDbArc')
   const imported=importDxf(dx.text)
   expect(imported.skipped).toBe(0)
   expect(imported.document.entities[0]).toMatchObject({kind:'arc',radius:100,
     startAngle:350,endAngle:20})
   let withBlock=doc([arc('b',0,90)])
   withBlock=createBlockFromSelection(withBlock,['b'],'弧圖塊',P(0,0),'block','ins')
   const external=importDxf(exportDxf(withBlock).text)
   expect(external.skipped).toBe(0)
   expect(external.document.blocks?.[0].entities[0]).toMatchObject({kind:'arc',radius:100})
 })
 it('preserves native JSON and historical edits after arc trims',()=>{
   const original=doc([arc(),line('cutter',50,-200,50,200)])
   const next=trimDocument(original,['cutter'],'arc',P(90,40),()=> 'id')
   expect(parseDocument(JSON.parse(JSON.stringify(next)))).toEqual(next)
   let history:History={past:[],present:original,future:[]}
   history=documentReducer(history,{type:'edit',update:()=>next})
   history=documentReducer(history,{type:'undo'})
   expect(history.present).toEqual(original)
   history=documentReducer(history,{type:'redo'})
   expect(history.present).toEqual(next)
 })
 it('window selects an analytic arc only when its actual curved extent qualifies',()=>{
   const d=doc([arc('top',0,180)])
   expect(windowSelection(d,P(-120,120),P(120,-20))).toEqual(['top'])
   expect(windowSelection(d,P(120,120),P(-120,-20))).toEqual(['top'])
   expect(windowSelection(d,P(-120,-120),P(120,20))).toEqual([])
 })
 it('FILLET now produces native true ARC, not a multi-segment LWPOLYLINE',()=>{
   const d=doc([line('horizontal',1000,0,0,0),line('vertical',0,0,0,1000)])
   const out=joinLines(d,['horizontal','vertical'],'fillet',100,100,'fillet')
   expect(out.entities[2]).toMatchObject({kind:'arc',center:P(100,100),radius:100})
   const dx=exportDxf(out)
   expect((dx.text.match(/0\r\nARC\r\n/g)||[])).toHaveLength(1)
 })
})
