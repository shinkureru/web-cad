import { describe,expect,it } from 'vitest'
import { DEFAULT_DIMENSION_STYLES,dimensionGeometry,formatDimension,getDimensionStyle } from './annotations'
import { createDocument,parseDocument,documentReducer } from './document'
import { rotateEntity,translateEntity } from './editing'
import { createBlockFromSelection } from './blocks'
import { findCommand } from './commands'
import type { DimensionEntity,TextEntity } from './types'
import type { History } from './document'
const p=(x:number,y:number)=>({x,y})
const linear:DimensionEntity={id:'d1',kind:'dimension',layerId:'dimension',start:p(0,0),
  end:p(3000,1000),placement:p(1000,500),mode:'linear',axis:'horizontal',styleId:'standard'}
describe('model-space annotation dimensions',()=>{
  it('computes horizontal linear projection, not the diagonal distance',()=>{
    const g=dimensionGeometry(linear,DEFAULT_DIMENSION_STYLES[0])
    expect(g.measured).toBe(3000)
    expect(g.label.text).toBe('3000')
    expect(g.dimensionStart).toEqual(p(0,500))
    expect(g.dimensionEnd).toEqual(p(3000,500))
    expect(g.lines).toHaveLength(3)
    expect(g.arrowheads).toHaveLength(2)
  })
  it('supports vertical linear and true aligned measurement',()=>{
    const vert={...linear,axis:'vertical' as const,placement:p(200,500)}
    expect(dimensionGeometry(vert,DEFAULT_DIMENSION_STYLES[0]).measured).toBe(1000)
    const aligned={...linear,end:p(3000,4000),mode:'aligned' as const}
    expect(dimensionGeometry(aligned,DEFAULT_DIMENSION_STYLES[0]).measured).toBe(5000)
  })
  it('uses the style precision and optional suffix without changing geometry',()=>{
    const style={...DEFAULT_DIMENSION_STYLES[1],precision:2,suffix:' mm'}
    expect(formatDimension(5000.125,style)).toBe('5000.13 mm')
    expect(dimensionGeometry(linear,style).label.height).toBe(style.textHeight)
  })
  it('legacy v0.3 documents without style fields can be loaded',()=>{
    const doc=createDocument()
    delete doc.dimensionStyles
    delete doc.activeDimensionStyleId
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    expect(getDimensionStyle(doc).id).toBe('standard')
  })
  it('rejects unsafe text sizes, invalid styles and orphan style references',()=>{
    const d=createDocument()
    d.entities.push({id:'t',kind:'text',layerId:'0',position:p(0,0),text:'繁體中文',height:150,rotation:0})
    expect(parseDocument(d)).toEqual(d)
    expect(()=>parseDocument({...d,entities:[{...d.entities[0],height:-1}]})).toThrow()
    expect(()=>parseDocument({...d,dimensionStyles:[{...DEFAULT_DIMENSION_STYLES[0],precision:9}]})).toThrow()
    expect(()=>parseDocument({...d,entities:[linear],dimensionStyles:[]})).toThrow()
    expect(()=>parseDocument({...d,entities:[{...linear,styleId:'missing'}]})).toThrow()
  })
  it('moves and rotates both text and dimensions in mm',()=>{
    const t:TextEntity={id:'text',kind:'text',layerId:'0',position:p(500,200),text:'廚房',height:150,rotation:0}
    expect(translateEntity(t,p(300,500))).toMatchObject({position:p(800,700)})
    expect(rotateEntity(t,p(0,0),90)).toMatchObject({position:p(-200,500),rotation:90})
    const shifted=translateEntity(linear,p(100,0))
    expect(shifted).toMatchObject({start:p(100,0),end:p(3100,1000)})
    expect(rotateEntity(linear,p(0,0),90)).toMatchObject({axis:'vertical',start:p(0,0),end:p(-1000,3000)})
    expect(rotateEntity(linear,p(0,0),30)).toMatchObject({mode:'aligned'})
  })
  it('preserves annotations in a JSON round trip and undo history',()=>{
    const original=createDocument()
    original.entities=[linear,{id:'t1',kind:'text',layerId:'0',position:p(0,0),text:'浴室',height:100,rotation:0}]
    expect(parseDocument(JSON.parse(JSON.stringify(original)))).toEqual(original)
    let state:History={past:[],present:createDocument(),future:[]}
    state=documentReducer(state,{type:'edit',update:()=>original})
    state=documentReducer(state,{type:'undo'})
    expect(state.present.entities).toHaveLength(0)
    state=documentReducer(state,{type:'redo'})
    expect(state.present.entities).toHaveLength(2)
  })
  it('prevents nesting annotation entities inside the primitive-only block system',()=>{
    const d=createDocument()
    d.entities=[linear]
    expect(()=>createBlockFromSelection(d,['d1'],'錯誤圖塊',p(0,0),'b','i')).toThrow()
  })
  it('registers CAD text and dimension command aliases',()=>{
    expect(findCommand('T')).toBe('text')
    expect(findCommand('DIMLINEAR')).toBe('linearDimension')
    expect(findCommand('DAL')).toBe('alignedDimension')
    expect(findCommand('D')).toBe('dimstyle')
  })
})
