import { describe,it,expect } from 'vitest'
import { createDocument,documentReducer,parseDocument } from './document'
import { commitGrip,commitGeometry,editGeometry,entityGrips,moveGrip } from './grips'
import { parsePointInput } from './commands'
import { nearestSnap,entitySnaps,roundPoint } from './geometry'
import { exportDxf,importDxf } from './dxf'
import type { CadEntity,Point } from './types'
import type { History } from './document'
const p=(x:number,y:number):Point=>({x,y})
const ln=(id='L'):Extract<CadEntity,{kind:'line'}>=>({id,kind:'line',layerId:'wall',
  start:p(0,0),end:p(3000,0),color:'#ffaacc',lineweight:.35})
const doc=(items:CadEntity[])=>({...createDocument(),entities:items})
describe('v1.2.0 precise dynamic distances and angles',()=>{
  it('takes explicit cm distance-angle without requiring @ when a base point exists',()=>{
    expect(parsePointInput('350cm<0',p(500,600),p(0,0))).toEqual(p(4000,600))
    expect(parsePointInput('350cm<90',p(500,600),p(0,0))).toEqual(p(500,4100))
    expect(parsePointInput('@350cm<180',p(500,600),p(0,0))).toEqual(p(-3000,600))
    expect(parsePointInput('350<0',p(500,600),p(0,0),'cm')).toEqual(p(4000,600))
    expect(parsePointInput('350cm<45',p(0,0),p(0,0))).toEqual(p(2474.874,2474.874))
    expect(parsePointInput('350cm<45',null,p(0,0))).toBeNull()
  })
  it('retains cursor-direction scalar, absolute and relative coordinate semantics',()=>{
    expect(parsePointInput('350cm',p(0,0),p(0,1))).toEqual(p(0,3500))
    expect(parsePointInput('350cm,200mm',null,p(0,0))).toEqual(p(3500,200))
    expect(parsePointInput('@350cm,10cm',p(500,600),p(0,0))).toEqual(p(4000,700))
  })
})
describe('v1.2.0 editable grip geometry and model protection',()=>{
  it('exposes line endpoint and middle grips, moving middle translates both endpoints',()=>{
    const l=ln()
    expect(entityGrips(l).map(g=>g.id)).toEqual(['start','end','mid'])
    expect(moveGrip(l,'end',p(3500,100))).toMatchObject({start:p(0,0),end:p(3500,100)})
    expect(moveGrip(l,'mid',p(2500,1000))).toMatchObject({
      start:p(1000,1000),end:p(4000,1000)
    })
    expect(l.end).toEqual(p(3000,0))
  })
  it('moves line endpoint by exact mm and refuses degeneracy',()=>{
    expect(()=>moveGrip(ln(),'end',p(0,0))).toThrow('長度')
    expect(()=>moveGrip(ln(),'nonsense',p(1,2))).toThrow('未知')
    expect(()=>moveGrip(ln(),'start',p(Infinity,0))).toThrow()
    expect(moveGrip(ln(),'start',p(125.1234,20))).toMatchObject({
      start:p(125.123,20)
    })
  })
  it('keeps a closed polyline closed when either repeated endpoint moves',()=>{
    const poly:CadEntity={kind:'polyline',id:'closed',layerId:'wall',points:[
      p(0,0),p(100,0),p(100,100),p(0,100),p(0,0)
    ]}
    const moved=moveGrip(poly,'point:0',p(-25,50))
    expect(moved.kind).toBe('polyline')
    if(moved.kind==='polyline'){
      expect(moved.points[0]).toEqual(p(-25,50))
      expect(moved.points.at(-1)).toEqual(p(-25,50))
    }
    const last=moveGrip(poly,'point:4',p(-30,40))
    if(last.kind==='polyline')expect(last.points[0]).toEqual(p(-30,40))
    expect(()=>moveGrip(poly,'point:1',p(0,0))).toThrow('重合')
  })
  it('moves rectangle corners with opposite corner fixed and keeps finite height',()=>{
    const rect:CadEntity={kind:'rectangle',id:'rect',layerId:'wall',start:p(0,0),end:p(3000,2000)}
    expect(entityGrips(rect)).toHaveLength(4)
    const moved=moveGrip(rect,'corner:0',p(500,200))
    expect(moved).toMatchObject({start:p(500,200),end:p(3000,2000)})
    expect(()=>moveGrip(rect,'corner:0',p(3000,200))).toThrow('寬高')
  })
  it('supports circle/arc center, radius and endpoint angle drags without approximating',()=>{
    const c:CadEntity={id:'circle',kind:'circle',layerId:'wall',center:p(100,100),radius:100}
    expect(moveGrip(c,'radius',p(350,100))).toMatchObject({radius:250,center:p(100,100)})
    expect(moveGrip(c,'center',p(200,300))).toMatchObject({center:p(200,300),radius:100})
    expect(()=>moveGrip(c,'radius',p(100,100))).toThrow('半徑')
    const arc:CadEntity={id:'a',kind:'arc',layerId:'wall',center:p(0,0),radius:100,
      startAngle:0,endAngle:180}
    expect(moveGrip(arc,'startAngle',p(0,-100))).toMatchObject({startAngle:270,endAngle:180})
    expect(moveGrip(arc,'endAngle',p(0,100))).toMatchObject({endAngle:90})
    expect(()=>moveGrip(arc,'endAngle',p(100,0))).toThrow('跨度')
  })
  it('protects locked/hidden targets and commits as one reducer undo step',()=>{
    const original=doc([ln()])
    const updated=commitGrip(original,'L','end',p(3500,200))
    expect(updated.entities[0]).toMatchObject({end:p(3500,200)})
    let state:History={past:[],present:original,future:[]}
    state=documentReducer(state,{type:'edit',update:()=>updated})
    state=documentReducer(state,{type:'undo'})
    expect(state.present).toEqual(original)
    state=documentReducer(state,{type:'redo'})
    expect(state.present).toEqual(updated)
    const locked=doc([ln()])
    locked.layers.find(l=>l.id==='wall')!.locked=true
    expect(()=>commitGrip(locked,'L','end',p(3500,200))).toThrow('鎖定')
    locked.layers.find(l=>l.id==='wall')!.locked=false
    locked.layers.find(l=>l.id==='wall')!.visible=false
    expect(()=>commitGrip(locked,'L','end',p(3500,200))).toThrow('隱藏')
  })
})
describe('v1.2.0 precise geometry property editing',()=>{
  it('length 350 cm keeps first point and direction in model mm',()=>{
    expect(editGeometry(ln(),'length',3500)).toMatchObject({start:p(0,0),end:p(3500,0)})
    expect(editGeometry(ln(),'angle',90)).toMatchObject({start:p(0,0),end:p(0,3000)})
    expect(()=>editGeometry(ln(),'length',0)).toThrow('長度')
  })
  it('edits exact XY coordinates and preserves material properties',()=>{
    const modified=editGeometry(ln(),'endX',3550.1234)
    expect(modified).toMatchObject({kind:'line',end:p(3550.123,0),
      color:'#ffaacc',lineweight:.35,layerId:'wall'})
    expect(editGeometry(ln(),'startY',-1200)).toMatchObject({start:p(0,-1200)})
  })
  it('sets rectangle width/height and circle center/radius without mutating source',()=>{
    const rect:CadEntity={id:'rect',kind:'rectangle',layerId:'wall',start:p(1000,1000),end:p(0,0)}
    expect(editGeometry(rect,'width',3500)).toMatchObject({end:p(-2500,0)})
    expect(editGeometry(rect,'height',2000)).toMatchObject({end:p(0,-1000)})
    const c:CadEntity={id:'c',kind:'circle',layerId:'wall',center:p(0,0),radius:100}
    expect(editGeometry(c,'radius',125.5)).toMatchObject({radius:125.5})
    expect(editGeometry(c,'centerX',50)).toMatchObject({center:p(50,0)})
    expect(()=>editGeometry(c,'radius',0)).toThrow('半徑')
  })
  it('geometry edit protected, roundtrips through JSON and DXF',()=>{
    const first=doc([ln()])
    const next=commitGeometry(first,'L','length',3500)
    expect(parseDocument(JSON.parse(JSON.stringify(next)))).toEqual(next)
    const dx=importDxf(exportDxf(next).text)
    expect(dx.document.entities[0]).toMatchObject({kind:'line',end:p(3500,0)})
    first.layers.find(l=>l.id==='wall')!.locked=true
    expect(()=>commitGeometry(first,'L','length',3500)).toThrow('鎖定')
  })
})
describe('v1.2.0 more accurate object snaps',()=>{
  it('offers circle quadrant and genuine ARC quadrant only within sweep',()=>{
    const c:CadEntity={id:'c',kind:'circle',layerId:'wall',center:p(1000,1000),radius:100}
    expect(entitySnaps(c).filter(x=>x.kind==='象限點')).toHaveLength(4)
    const arc:CadEntity={id:'a',kind:'arc',layerId:'wall',
      center:p(0,0),radius:100,startAngle:350,endAngle:100}
    const quadrants=entitySnaps(arc).filter(x=>x.kind==='象限點')
    expect(quadrants).toHaveLength(2)
    expect(quadrants.some(x=>Math.abs(x.point.y-100)<.001)).toBe(true)
  })
  it('perpendicular snap respects finite segment and needs a drawing base',()=>{
    const l=ln()
    const entities:CadEntity[]=[l]
    const found=nearestSnap(p(1000,9),entities,new Set(['wall']),30,p(1000,1000))
    expect(found).toMatchObject({kind:'垂足',point:p(1000,0)})
    expect(nearestSnap(p(1000,9),entities,new Set(['wall']),30)?.kind).not.toBe('垂足')
    expect(nearestSnap(p(4000,0),entities,new Set(['wall']),20,p(4000,1000))).toBeNull()
    expect(nearestSnap(p(1000,9),entities,new Set([]),30,p(1000,1000))).toBeNull()
  })
  it('rounds world grip/snap points to stable 0.001 mm',()=>{
    expect(roundPoint(p(1.23456,-1.23456))).toEqual(p(1.235,-1.235))
  })
})
