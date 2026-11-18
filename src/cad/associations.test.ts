import { describe,it,expect } from 'vitest'
import { createDocument,documentReducer,parseDocument } from './document'
import type {History} from './document'
import type { CadDocument,CadEntity,CurveDimensionEntity } from './types'
import {curveDimensionPicture,makeCurveDimension} from './curveDimensions'
import {getDimensionStyle} from './annotations'
import {copyAssociationSourceIds,linkCurveDimension,linkCurveDimensionInDocument,
  unlinkCurveDimension,reconcileCurveAssociations} from './associations'
import {editGeometry} from './grips'
import {rotateEntity,translateEntity} from './editing'
import {buildPlot} from './plot'
import {exportDxf,importDxf} from './dxf'
const p=(x:number,y:number)=>({x,y})
const circle:CadEntity={id:'source-circle',kind:'circle',layerId:'wall',
  center:p(100,200),radius:500}
const arc:CadEntity={id:'source-arc',kind:'arc',layerId:'wall',
  center:p(0,0),radius:500,startAngle:0,endAngle:180}
function oldDim(source:CadEntity=circle,measure:'radius'|'diameter'|'angle'|'arcLength'='radius') {
  return makeCurveDimension(source,measure,p(750,200),'dimension-id','dimension','standard')
}
const doc=(entities:CadEntity[]):CadDocument=>({...createDocument(),entities})
function step(old:CadDocument,fn:(d:CadDocument)=>CadDocument):CadDocument{
  const h:History={past:[],present:old,future:[]}
  return documentReducer(h,{type:'edit',update:fn}).present
}
function linkedDoc(source:CadEntity=circle,measure:'radius'|'diameter'|'angle'|'arcLength'='radius'){
  const d=linkCurveDimension(oldDim(source,measure),source)
  return doc([source,d])
}
function findLabel(d:CadDocument):CurveDimensionEntity{
  const entity=d.entities.find(e=>e.kind==='curveDimension')
  if(entity?.kind!=='curveDimension')throw new Error('No label')
  return entity
}
describe('v1.4.0 associative curve dimensions',()=>{
 it('new links carry stable source ID while legacy v1.3 snapshots remain independent',()=>{
  const legacy=oldDim()
  expect(legacy.sourceId).toBeUndefined()
  const linked=linkCurveDimension(legacy,circle)
  expect(linked).toMatchObject({sourceId:'source-circle',radius:500,orphaned:false})
  expect(legacy.sourceId).toBeUndefined()
  const saved=doc([circle,legacy])
  const grown=step(saved,d=>({...d,entities:d.entities.map(e=>e.id===circle.id?
    {...e,radius:650}:e) as CadEntity[]}))
  expect(findLabel(grown)).toMatchObject({radius:500})
 })
 it('updates radius and diameter in the same undo step as a source radius edit',()=>{
  const original=linkedDoc()
  const state:History={past:[],present:original,future:[]}
  const updated=documentReducer(state,{type:'edit',update:d=>({...d,entities:d.entities.map(e=>e.id===circle.id?
    editGeometry(e,'radius',600):e)})})
  const label=findLabel(updated.present)
  expect(label).toMatchObject({radius:600,sourceId:'source-circle',center:p(100,200)})
  expect(label.placement).toEqual(p(850,200)) // R500+250 clearance => R600+250
  expect(curveDimensionPicture(label,getDimensionStyle()).label.text).toBe('R600')
  expect(updated.past).toHaveLength(1)
  expect(findLabel(documentReducer(updated,{type:'undo'}).present).radius).toBe(500)
  expect(findLabel(documentReducer(documentReducer(updated,{type:'undo'}),{type:'redo'}).present).radius).toBe(600)
  const diameter=linkCurveDimension(oldDim(circle,'diameter'),circle)
  const withDiameter=doc([circle,diameter])
  expect(curveDimensionPicture(findLabel(step(withDiameter,d=>({...d,
    entities:d.entities.map(e=>e.id===circle.id?{...e,radius:600}:e)}))),
    getDimensionStyle()).label.text).toBe('Ø1200')
 })
 it('tracks source circle translation while preserving original radial clearance',()=>{
  const original=linkedDoc()
  const updated=step(original,d=>({...d,entities:d.entities.map(e=>e.id===circle.id?
    translateEntity(e,p(150,75)):e)}))
  expect(findLabel(updated)).toMatchObject({center:p(250,275),placement:p(900,275)})
  expect(original.entities[1]).toMatchObject({center:p(100,200),placement:p(750,200)})
 })
 it('tracks native ARC sweep, angular measurement and arc length after edits',()=>{
  const a=linkCurveDimension(oldDim(arc,'angle'),arc)
  const l=linkCurveDimension({...oldDim(arc,'arcLength'),id:'arc-length'},arc)
  const original=doc([arc,a,l])
  const changed=step(original,d=>({...d,entities:d.entities.map(e=>
    e.id===arc.id?{...arc,startAngle:350,endAngle:20}:e)}))
  const angle=changed.entities.find(e=>e.id===a.id)
  const length=changed.entities.find(e=>e.id==='arc-length')
  if(angle?.kind!=='curveDimension'||length?.kind!=='curveDimension')throw Error('Missing')
  expect(angle).toMatchObject({startAngle:350,endAngle:20,radius:500})
  expect(curveDimensionPicture(angle,getDimensionStyle()).label.text).toBe('30°')
  expect(curveDimensionPicture(length,getDimensionStyle()).measured).toBeCloseTo(500*Math.PI/6,7)
  expect(curveDimensionPicture(length,getDimensionStyle()).label.text).toBe('⌒262')
 })
 it('follows arc rotation with non-zero mid-angle, including placement',()=>{
  const old=linkCurveDimension(makeCurveDimension(arc,'angle',p(0,750),
    'a','dimension','standard'),arc)
  const before=doc([arc,old])
  const after=step(before,d=>({...d,entities:d.entities.map(e=>
    e.id===arc.id?rotateEntity(e,p(0,0),90):e)}))
  expect(findLabel(after)).toMatchObject({startAngle:90,endAngle:270})
  expect(findLabel(after).placement).toEqual(p(-750,0))
 })
 it('does not doubly move a linked label when source and label were both selected for MOVE',()=>{
  const before=linkedDoc()
  const updated=step(before,d=>({...d,entities:d.entities.map(e=>
    translateEntity(e,p(100,100)))}))
  expect(findLabel(updated)).toMatchObject({center:p(200,300),placement:p(850,300)})
 })
 it('permits independently moving a linked label without moving source',()=>{
  const before=linkedDoc()
  const updated=step(before,d=>({...d,entities:d.entities.map(e=>e.kind==='curveDimension'?
    translateEntity(e,p(50,75)):e)}))
  expect(findLabel(updated)).toMatchObject({center:p(100,200),placement:p(800,275),sourceId:'source-circle'})
  expect(updated.entities[0]).toMatchObject({center:p(100,200)})
 })
 it('deleting source freezes last measured value and marks orphan with undo recovery',()=>{
  const before=linkedDoc()
  const state:History={past:[],present:before,future:[]}
  const updated=documentReducer(state,{type:'edit',update:d=>({...d,entities:d.entities.filter(e=>e.id!==circle.id)})})
  expect(updated.present.entities).toHaveLength(1)
  expect(findLabel(updated.present)).toMatchObject({radius:500,orphaned:true})
  expect(findLabel(updated.present).sourceId).toBeUndefined()
  expect(parseDocument(updated.present)).toEqual(updated.present)
  const undone=documentReducer(updated,{type:'undo'})
  expect(findLabel(undone.present).sourceId).toBe('source-circle')
  const redone=documentReducer(undone,{type:'redo'})
  expect(findLabel(redone.present).orphaned).toBe(true)
 })
 it('changing an angular ARC to an incompatible CIRCLE safely freezes the angle',()=>{
  const before=linkedDoc(arc,'angle')
  const updated=step(before,d=>({...d,entities:d.entities.map(e=>e.id===arc.id?
    {kind:'circle',id:arc.id,layerId:arc.layerId,center:p(0,0),radius:200}:e)}))
  expect(findLabel(updated)).toMatchObject({orphaned:true,radius:500,startAngle:0,endAngle:180})
  expect(findLabel(updated).sourceId).toBeUndefined()
 })
 it('remaps references when a linked circle and its label are copied together',()=>{
  const original=linkedDoc()
  const clones=copyAssociationSourceIds([
    {...original.entities[0],id:'new-circle'},
    {...original.entities[1],id:'new-label'}
  ],['source-circle','dimension-id'])
  expect(clones[1]).toMatchObject({sourceId:'new-circle'})
  const result=step(original,d=>({...d,entities:[...d.entities,...clones]}))
  expect(result.entities.find(e=>e.id==='new-label')).toMatchObject({sourceId:'new-circle'})
  expect(parseDocument(result)).toEqual(result)
  const res=step(result,d=>({...d,entities:d.entities.map(e=>e.id==='new-circle'?
    {...e,radius:650}:e)}))
  expect(res.entities.find(e=>e.id==='new-label')).toMatchObject({radius:650})
  expect(findLabel(res)).toMatchObject({radius:500})
 })
 it('copying only a label retains association to original source',()=>{
  const before=linkedDoc()
  const copy=copyAssociationSourceIds([{...findLabel(before),id:'copy'}],['dimension-id'])
  expect(copy[0]).toMatchObject({sourceId:'source-circle'})
 })
 it('re-linking a legacy or orphaned snapshot restores dynamic source measurement',()=>{
  const original=doc([circle,oldDim()])
  const linked=linkCurveDimensionInDocument(original,'dimension-id','source-circle')
  expect(findLabel(linked).sourceId).toBe('source-circle')
  const grown=step(linked,d=>({...d,entities:d.entities.map(e=>e.id===circle.id?
    {...e,radius:750}:e)}))
  expect(findLabel(grown).radius).toBe(750)
  expect(linkCurveDimensionInDocument(grown,'dimension-id','source-circle')).toMatchObject({entities:expect.any(Array)})
  const detached=unlinkCurveDimension(findLabel(grown))
  expect(detached.sourceId).toBeUndefined()
  expect(detached.orphaned).toBe(false)
  const frozen=step(grown,d=>({...d,entities:d.entities.map(e=>e.id===detached.id?detached:e)}))
  expect(findLabel(frozen).radius).toBe(750)
  expect(findLabel(step(frozen,d=>({...d,entities:d.entities.map(e=>
    e.id===circle.id?{...e,radius:850}:e)}))).radius).toBe(750)
 })
 it('rejects linking incompatible sources, protected label layers and bad JSON references',()=>{
  const line:CadEntity={id:'line',layerId:'wall',kind:'line',start:p(0,0),end:p(100,0)}
  expect(()=>linkCurveDimension(oldDim(),line)).toThrow('不相容')
  expect(()=>linkCurveDimension(oldDim(arc,'angle'),circle)).toThrow('不相容')
  const bad=doc([circle,{...oldDim(),sourceId:'missing'}])
  expect(()=>parseDocument(bad)).toThrow('來源參照')
  const mismatched=doc([circle,{...oldDim(arc,'angle'),sourceId:'source-circle'}])
  expect(()=>parseDocument(mismatched)).toThrow('來源參照')
  const locked=doc([circle,oldDim()])
  locked.layers.find(l=>l.id==='dimension')!.locked=true
  expect(()=>linkCurveDimensionInDocument(locked,'dimension-id','source-circle')).toThrow('圖層')
 })
 it('source mutation updates labels in saved native JSON, SVG plot and expanded DXF',()=>{
  const original=linkedDoc()
  const updated=step(original,d=>({...d,entities:d.entities.map(e=>e.id===circle.id?
    {...e,radius:600}:e)}))
  expect(parseDocument(JSON.parse(JSON.stringify(updated)))).toEqual(updated)
  const plotted=buildPlot(updated,{paper:'A3',orientation:'landscape',scale:50,
    color:'monochrome',margin:10})
  expect(plotted.svg).toContain('R600')
  const exported=exportDxf(updated)
  expect(exported.warnings.some(w=>w.includes('展開'))).toBe(true)
  expect(exported.text).toContain('R600')
  expect(importDxf(exported.text).document.entities.some(e=>e.kind==='curveDimension')).toBe(false)
 })
 it('recovers a stale linked model when re-opening externally modified native JSON',()=>{
  const original=linkedDoc()
  const edited=JSON.parse(JSON.stringify(original)) as CadDocument
  edited.entities[0]={...edited.entities[0],radius:760} as CadEntity
  // Only the SOURCE was edited outside CAD; the persisted label was not.
  const imported=parseDocument(edited)
  expect(findLabel(imported)).toMatchObject({radius:760,sourceId:'source-circle'})
  expect(findLabel(imported).placement).toEqual(p(750,200))
  expect(findLabel(original)).toMatchObject({radius:500})
 })
 it('PLOT and DXF warn about frozen orphan measurements instead of silently displaying them',()=>{
  const before=linkedDoc()
  const deleted=step(before,d=>({...d,entities:d.entities.filter(e=>e.id!==circle.id)}))
  const output=buildPlot(deleted,{paper:'A3',orientation:'landscape',
    scale:50,color:'monochrome',margin:10})
  expect(output.warnings.some(w=>w.includes('來源已遺失'))).toBe(true)
  const transfer=exportDxf(deleted)
  expect(transfer.warnings.some(w=>w.includes('凍結'))).toBe(true)
  const linked=exportDxf(before)
  expect(linked.warnings.some(w=>w.includes('來源追蹤'))).toBe(true)
 })
 it('noop document edits preserve original snapshots and compatibility',()=>{
  const original=linkedDoc()
  const state={past:[],present:original,future:[]}
  const updated=documentReducer(state,{type:'edit',update:d=>d})
  expect(updated).toBe(state)
  expect(reconcileCurveAssociations(original,original)).toBe(original)
 })
})
