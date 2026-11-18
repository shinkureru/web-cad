import {describe,it,expect} from 'vitest'
import { createDocument, parseDocument, documentReducer } from './document'
import { circlePrimitiveIntersections, trimCircle, arcSweep } from './arcs'
import {trimDocument} from './precisionEdit'
import {exportDxf,importDxf} from './dxf'
import {windowSelection} from './advancedEditing'
import type {CadEntity,CircleEntity,CadPrimitive,Point} from './types'
import type {History} from './document'
const P=(x:number,y:number):Point=>({x,y})
const circle=(id='circle'):CircleEntity=>({
  id,kind:'circle',layerId:'wall',center:P(0,0),radius:100,
  color:'#faab34',lineweight:.35,linetype:'dashed'
})
const line=(id:string,x:number):CadPrimitive=>({
  id,kind:'line',layerId:'0',start:P(x,-200),end:P(x,200)
})
const doc=(entities:CadEntity[])=>({...createDocument(),entities})
describe('v1.0.0 CIRCLE → native ARC TRIM',()=>{
  it('collects two exact bounded line intersections with a full circle',()=>{
    const hits=circlePrimitiveIntersections(circle(),line('cutter',50))
    expect(hits).toHaveLength(2)
    expect(hits.every(h=>Math.abs(h.x-50)<.001)).toBe(true)
    expect(hits.map(p=>p.y).sort((a,b)=>a-b)).toEqual([-86.603,86.603])
  })
  it('requires a true finite segment crossing, not an infinite supporting line',()=>{
    const far:CadPrimitive={
      id:'far',kind:'line',layerId:'0',start:P(50,150),end:P(50,200)
    }
    expect(circlePrimitiveIntersections(circle(),far)).toEqual([])
    expect(()=>trimCircle(circle(),[far],P(100,0))).toThrow('兩個')
  })
  it('removes the clicked upper span and converts remainder to one CCW analytic ARC',()=>{
    const original=circle(),left=line('left',-50),right=line('right',50)
    const result=trimDocument(doc([original,left,right]),['left','right'],'circle',P(0,100),()=> 'new')
    expect(result.entities).toHaveLength(3)
    const arc=result.entities[0]
    if(arc.kind!=='arc')throw Error('Expected native ARC')
    expect(arc.id).toBe(original.id)
    expect(arc).toMatchObject({
      center:P(0,0),radius:100,
      startAngle:120,endAngle:60,
      layerId:'wall',color:'#faab34',lineweight:.35,linetype:'dashed'
    })
    expect(arcSweep(arc)).toBe(300)
    expect(result.entities[1]).toEqual(left)
    expect(result.entities[2]).toEqual(right)
    expect(original.kind).toBe('circle')
  })
  it('with one cutter intersecting twice, removes the clockwise 120° side',()=>{
    const result=trimCircle(circle(),[line('cutter',50)],P(100,0))
    expect(result).toHaveLength(1)
    expect(result[0].startAngle).toBe(60)
    expect(result[0].endAngle).toBe(300)
    expect(arcSweep(result[0])).toBe(240)
  })
  it('can remove upper large interval and preserve the shorter ARC',()=>{
    const result=trimCircle(circle(),[line('cutter',50)],P(0,100))
    expect(result[0]).toMatchObject({startAngle:300,endAngle:60})
    expect(arcSweep(result[0])).toBe(120)
  })
  it('handles two crossing finite circles analytically without fake full-arc gaps',()=>{
    const cutter:CadPrimitive={id:'cc',kind:'circle',layerId:'0',center:P(100,0),radius:100}
    expect(circlePrimitiveIntersections(circle(),cutter)).toHaveLength(2)
    const result=trimCircle(circle(),[cutter],P(100,0))
    expect(result[0].kind).toBe('arc')
    expect(arcSweep(result[0])).toBeCloseTo(240,3)
  })
  it('rejects tangent, missing or coincident cutters and misses near center',()=>{
    const tangent=line('tangent',100)
    expect(circlePrimitiveIntersections(circle(),tangent)).toHaveLength(1)
    expect(()=>trimCircle(circle(),[tangent],P(100,0))).toThrow('兩個')
    const concentric:CadPrimitive={id:'same',kind:'circle',layerId:'0',center:P(0,0),radius:100}
    expect(()=>trimCircle(circle(),[concentric],P(100,0))).toThrow('兩個')
    expect(()=>trimCircle(circle(),[line('c',50)],P(0,0))).toThrow('圓周')
  })
  it('rejects locked or hidden target and hidden cutting boundaries',()=>{
    const c=circle(),cut=line('cutter',50)
    const d=doc([c,cut])
    d.layers.find(l=>l.id==='wall')!.locked=true
    expect(()=>trimDocument(d,['cutter'],'circle',P(100,0),()=> 'x')).toThrow('鎖定')
    d.layers.find(l=>l.id==='wall')!.locked=false
    d.layers.find(l=>l.id==='wall')!.visible=false
    expect(()=>trimDocument(d,['cutter'],'circle',P(100,0),()=> 'x')).toThrow('隱藏')
    d.layers.find(l=>l.id==='wall')!.visible=true
    d.layers.find(l=>l.id==='0')!.visible=false
    expect(()=>trimDocument(d,['cutter'],'circle',P(100,0),()=> 'x')).toThrow('隱藏')
  })
  it('preserves circle→arc geometry through JSON, DXF and visible window selection',()=>{
    const d=doc([circle(),line('cut',50)])
    const next=trimDocument(d,['cut'],'circle',P(100,0),()=> 'x')
    expect(parseDocument(JSON.parse(JSON.stringify(next)))).toEqual(next)
    const exported=exportDxf(next)
    expect(exported.text).toContain('0\r\nARC\r\n')
    const roundtrip=importDxf(exported.text)
    expect(roundtrip.skipped).toBe(0)
    const a=roundtrip.document.entities.find(e=>e.kind==='arc')
    expect(a).toMatchObject({kind:'arc',center:P(0,0),radius:100,startAngle:60,endAngle:300})
    expect(windowSelection(next,P(-110,110),P(110,-110))).toContain('circle')
  })
  it('is one undo step and can redo without losing entity style or id',()=>{
    const start=doc([circle(),line('cut',50)])
    const after=trimDocument(start,['cut'],'circle',P(100,0),()=> 'new')
    let state:History={past:[],present:start,future:[]}
    state=documentReducer(state,{type:'edit',update:()=>after})
    state=documentReducer(state,{type:'undo'})
    expect(state.present).toEqual(start)
    state=documentReducer(state,{type:'redo'})
    expect(state.present).toEqual(after)
  })
  it('does not alter the document when there is no valid cutter',()=>{
    const d=doc([circle(),line('off',400)])
    expect(()=>trimDocument(d,['off'],'circle',P(100,0),()=> 'x')).toThrow('兩個')
    expect(d.entities[0].kind).toBe('circle')
  })
})
