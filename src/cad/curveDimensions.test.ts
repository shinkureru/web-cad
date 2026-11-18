import {describe,it,expect} from 'vitest'
import {createDocument,parseDocument,documentReducer} from './document'
import {getDimensionStyle} from './annotations'
import {makeCurveDimension,curveDimensionPicture,curveDimensionExtents} from './curveDimensions'
import {resolveDynamicTarget} from './dynamicInput'
import {exportDxf,importDxf} from './dxf'
import {buildPlot,drawingBounds} from './plot'
import {moveGrip,entityGrips} from './grips'
import {translateEntity,rotateEntity} from './editing'
import {arcSweep} from './arcs'
import type {CadEntity,Point} from './types'
const p=(x:number,y:number):Point=>({x,y})
const circle:CadEntity={id:'circle',kind:'circle',layerId:'wall',center:p(0,0),radius:500}
const arc:CadEntity={id:'arc',kind:'arc',layerId:'wall',center:p(0,0),
  radius:100,startAngle:0,endAngle:180}
const base=()=>createDocument()
describe('v1.3.0 cursor-side dynamic input',()=>{
 it('uses cm, mm and cursor heading, resolves to mm without changing document',()=>{
  expect(resolveDynamicTarget(p(100,200),p(100,700),'350cm','90','cm'))
    .toEqual(p(100,3700))
  expect(resolveDynamicTarget(p(0,0),p(0,100),'125mm','','cm'))
    .toEqual(p(0,125))
  expect(resolveDynamicTarget(p(0,0),p(100,0),'350','45','cm'))
    .toEqual(p(2474.874,2474.874))
 })
 it('never commits invalid, empty, zero or extreme values',()=>{
  for(const raw of ['', '0', '-12cm', 'abc', 'Infinity','1e300']) {
    expect(resolveDynamicTarget(p(0,0),p(1,0),raw,'','mm')).toBeNull()
  }
  expect(resolveDynamicTarget(p(0,0),p(1,0),'100mm','NaN','mm')).toBeNull()
  expect(resolveDynamicTarget(p(0,0),p(1,0),'100mm','2000000','mm')).toBeNull()
 })
})
describe('v1.3.0 circle and arc snapshot dimensions',()=>{
 it('creates radius R500 from circle and displays leader/arrow/label',()=>{
  const dim=makeCurveDimension(circle,'radius',p(800,0),'rd','dimension','standard')
  const geo=curveDimensionPicture(dim,getDimensionStyle())
  expect(dim).toMatchObject({kind:'curveDimension',measure:'radius',radius:500,center:p(0,0)})
  expect(geo.measured).toBe(500)
  expect(geo.label.text).toBe('R500')
  expect(geo.lines.length).toBeGreaterThanOrEqual(1)
  expect(geo.arrowheads).toHaveLength(1)
 })
 it('creates diameter Ø1000 with two opposite arrowheads',()=>{
  const dim=makeCurveDimension(circle,'diameter',p(800,0),'dd','dimension','standard')
  const picture=curveDimensionPicture(dim,getDimensionStyle())
  expect(picture.measured).toBe(1000)
  expect(picture.label.text).toBe('Ø1000')
  expect(picture.arrowheads).toHaveLength(2)
 })
 it('measures original radius and CCW 180-degree arc accurately',()=>{
  const angle=makeCurveDimension(arc,'angle',p(0,220),'a','dimension','standard')
  const length=makeCurveDimension(arc,'arcLength',p(0,230),'b','dimension','standard')
  const ang=curveDimensionPicture(angle,getDimensionStyle())
  const len=curveDimensionPicture(length,getDimensionStyle())
  expect(ang.measured).toBe(180)
  expect(ang.label.text).toBe('180°')
  expect(len.measured).toBeCloseTo(Math.PI*100,6)
  expect(len.label.text).toBe('⌒314')
  expect(len.arcs).toHaveLength(1)
  expect(curveDimensionExtents(angle,getDimensionStyle()).length).toBeGreaterThanOrEqual(4)
 })
 it('handles crossing 0 degrees as short positive sweep and correct arc length',()=>{
  const a:CadEntity={...arc,startAngle:350,endAngle:20}
  if(a.kind!=='arc')throw Error('invalid test')
  expect(arcSweep(a)).toBe(30)
  const dim=makeCurveDimension(a,'arcLength',p(170,20),'cross','dimension','detail')
  const picture=curveDimensionPicture(dim,getDimensionStyle(undefined,'detail'))
  expect(picture.measured).toBeCloseTo(100*Math.PI/6,7)
  expect(picture.label.text).toBe('⌒52.4')
 })
 it('rejects angular/arc-length commands on a complete CIRCLE and invalid shape',()=>{
  expect(()=>makeCurveDimension(circle,'angle',p(0,200),'a','dimension','standard'))
    .toThrow('ARC')
  expect(()=>makeCurveDimension(circle,'arcLength',p(0,200),'a','dimension','standard'))
    .toThrow('ARC')
  expect(()=>makeCurveDimension({kind:'line',id:'l',layerId:'wall',
    start:p(0,0),end:p(1,1)},'radius',p(0,200),'a','dimension','standard'))
    .toThrow('圓')
 })
 it('keeps snapshots stable if the measured circle is changed later',()=>{
  const original=makeCurveDimension(circle,'radius',p(650,50),'rd','dimension','standard')
  const grown={...circle,radius:900} as CadEntity
  expect(curveDimensionPicture(original,getDimensionStyle()).measured).toBe(500)
  expect(grown).toMatchObject({radius:900})
  const doc=base();doc.entities=[circle,original]
  expect(parseDocument(JSON.parse(JSON.stringify(doc))).entities[1]).toMatchObject({
    kind:'curveDimension',radius:500
  })
  const bad={...doc,entities:[{...original,radius:-1}]}
  expect(()=>parseDocument(bad)).toThrow()
 })
 it('translates, rotates and grip-adjusts annotations without changing measurements',()=>{
  const dim=makeCurveDimension(arc,'angle',p(200,0),'a','dimension','standard')
  const translated=translateEntity(dim,p(100,200))
  expect(translated).toMatchObject({center:p(100,200),placement:p(300,200)})
  const rotated=rotateEntity(dim,p(0,0),90)
  expect(rotated).toMatchObject({startAngle:90,endAngle:270})
  expect(entityGrips(dim).map(g=>g.id)).toEqual(['placement'])
  const moved=moveGrip(dim,'placement',p(150,50))
  expect(moved).toMatchObject({placement:p(150,50),radius:100})
 })
 it('fits true drawing extents and SVG vector PLOT without rasterizing dimension',()=>{
  const doc=base()
  doc.entities=[arc,makeCurveDimension(arc,'arcLength',p(0,350),'cl','dimension','standard')]
  expect(drawingBounds(doc)).not.toBeNull()
  const result=buildPlot(doc,{
    paper:'A3',orientation:'landscape',scale:50,color:'monochrome',margin:10
  })
  expect(result.svg).toContain('⌒314')
  expect(result.svg).toContain('<path')
  expect(result.svg).toContain('A ')
 })
 it('exports DXF visible primitives with explicit loss warning, JSON remains native',()=>{
  const doc=base()
  const dim=makeCurveDimension(arc,'angle',p(0,230),'ang','dimension','standard')
  doc.entities=[arc,dim]
  const out=exportDxf(doc)
  expect(out.warnings.some(x=>x.includes('展開'))).toBe(true)
  expect(out.text).toContain('ARC')
  expect(out.text).toContain('TEXT')
  const returned=importDxf(out.text)
  expect(returned.document.entities.some(x=>x.kind==='text')).toBe(true)
  expect(returned.document.entities.some(x=>x.kind==='curveDimension')).toBe(false)
  expect(parseDocument(doc).entities[1]).toMatchObject({kind:'curveDimension'})
 })
 it('keeps history undo/redo behavior for creation of a curve dimension',()=>{
  const doc=base();doc.entities=[circle]
  const dim=makeCurveDimension(circle,'radius',p(600,100),'r1','dimension','standard')
  let history={past:[] as typeof doc[],present:doc,future:[] as typeof doc[]}
  history=documentReducer(history,{type:'edit',update:d=>({...d,entities:[...d.entities,dim]})})
  expect(history.present.entities).toHaveLength(2)
  history=documentReducer(history,{type:'undo'})
  expect(history.present.entities).toHaveLength(1)
  history=documentReducer(history,{type:'redo'})
  expect(history.present.entities).toHaveLength(2)
 })
})
