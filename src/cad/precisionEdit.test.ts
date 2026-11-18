import { describe, expect, it } from 'vitest'
import { createDocument, documentReducer, parseDocument } from './document'
import { offsetDocument, offsetEntity, trimDocument } from './precisionEdit'
import { findCommand } from './commands'
import type { CadEntity } from './types'
import type { History } from './document'
const p=(x:number,y:number)=>({x,y})
const line=(id:string,a:number,b:number,c:number,d:number,layerId='wall'):CadEntity=>({
  id,kind:'line',layerId,start:p(a,b),end:p(c,d),
})
const make=(entities:CadEntity[])=>({...createDocument(),entities})
describe('OFFSET — exact 2D model-space geometry',()=>{
  it('offsets horizontal lines left/right by specified millimetres, preserving source',()=>{
    const d=make([line('wall',0,0,3000,0)])
    const next=offsetDocument(d,'wall',120,p(1500,400),'offset-1')
    expect(next.entities).toHaveLength(2)
    expect(next.entities[0]).toEqual(d.entities[0])
    expect(next.entities[1]).toMatchObject({start:p(0,120),end:p(3000,120),layerId:'wall'})
    const below=offsetEntity(d.entities[0],120,p(1500,-400))
    expect(below).toMatchObject({start:p(0,-120),end:p(3000,-120)})
  })
  it('offsets a vertical line and a diagonal line perpendicular to source',()=>{
    const vertical=line('vertical',0,0,0,2000)
    expect(offsetEntity(vertical,100,p(-200,1000))).toMatchObject({start:p(-100,0),end:p(-100,2000)})
    const diagonal=line('diagonal',0,0,1000,1000)
    const shifted=offsetEntity(diagonal,Math.sqrt(2)*100,p(0,500))
    expect(shifted).toMatchObject({start:p(-100,100),end:p(900,1100)})
  })
  it('offsets a circle inward/outward with radius guards',()=>{
    const circle:CadEntity={id:'circle',kind:'circle',layerId:'0',center:p(0,0),radius:500}
    expect(offsetEntity(circle,50,p(800,0))).toMatchObject({radius:550})
    expect(offsetEntity(circle,50,p(0,100))).toMatchObject({radius:450})
    expect(()=>offsetEntity(circle,550,p(100,100))).toThrow('半徑')
  })
  it('uses joined miter segments for open polylines without losing endcaps',()=>{
    const polyline:CadEntity={id:'p',kind:'polyline',layerId:'0',points:[p(0,0),p(1000,0),p(1000,1000)]}
    const result=offsetEntity(polyline,100,p(500,200))
    expect(result).toMatchObject({kind:'polyline',points:[p(0,100),p(900,100),p(900,1000)]})
    expect(polyline.points[1]).toEqual(p(1000,0))
  })
  it('offsets rectangles as closed polylines and keeps their construction layer',()=>{
    const rect:CadEntity={id:'r',kind:'rectangle',layerId:'wall',start:p(0,0),end:p(3000,2000)}
    const result=offsetEntity(rect,100,p(3500,1000))
    expect(result).toMatchObject({kind:'polyline',layerId:'wall'})
    if(result.kind!=='polyline')throw Error('polyline expected')
    expect(result.points[0]).toEqual(p(-100,-100))
    expect(result.points[2]).toEqual(p(3100,2100))
    expect(result.points.at(-1)).toEqual(result.points[0])
  })
  it('rejects zero lengths, impossible inward circles, self-overlaps, locked and unsupported objects',()=>{
    const d=make([line('l',0,0,1000,0)])
    d.layers.find(x=>x.id==='wall')!.locked=true
    expect(()=>offsetDocument(d,'l',100,p(0,500),'n')).toThrow('鎖定')
    expect(()=>offsetEntity(d.entities[0],0,p(0,10))).toThrow()
    expect(()=>offsetEntity(line('zero',0,0,0,0),100,p(500,0))).toThrow()
    const zigzag:CadEntity={id:'q',layerId:'0',kind:'polyline',
      points:[p(0,0),p(1000,0),p(0,0)]}
    expect(()=>offsetEntity(zigzag,100,p(50,300))).toThrow()
    const text:CadEntity={id:'t',kind:'text',layerId:'0',position:p(0,0),text:'測',height:150,rotation:0}
    expect(()=>offsetEntity(text,100,p(0,200))).toThrow('僅支援')
  })
})
describe('TRIM — finite cutting edges',()=>{
  it('cuts a middle span between two selected boundaries, leaving separate original-style lines',()=>{
    const d=make([
      line('target',0,0,3000,0),
      line('edge1',1000,-500,1000,500),
      line('edge2',2000,-500,2000,500)])
    const result=trimDocument(d,['edge1','edge2'],'target',p(1500,0),()=> 'tail')
    expect(result.entities).toHaveLength(4)
    expect(result.entities[0]).toMatchObject({id:'target',start:p(0,0),end:p(1000,0)})
    expect(result.entities[1]).toMatchObject({id:'tail',start:p(2000,0),end:p(3000,0)})
    expect(result.entities[2]).toEqual(d.entities[1])
    expect(result.entities[3]).toEqual(d.entities[2])
    expect(d.entities).toHaveLength(3)
  })
  it('trims only one end when a single cutting edge crosses a target',()=>{
    const d=make([line('target',0,0,3000,0),line('boundary',1400,-50,1400,80)])
    const next=trimDocument(d,['boundary'],'target',p(250,0),()=> 'unused')
    expect(next.entities[0]).toMatchObject({start:p(1400,0),end:p(3000,0)})
    expect(next.entities[1]).toEqual(d.entities[1])
  })
  it('supports circle cutters while preserving circles and source layers',()=>{
    const d=make([line('target',-1000,0,1000,0),{
      id:'circle',kind:'circle',layerId:'door',center:p(0,0),radius:300}])
    const next=trimDocument(d,['circle'],'target',p(0,0),()=> 'segment2')
    expect(next.entities[0]).toMatchObject({start:p(-1000,0),end:p(-300,0)})
    expect(next.entities[1]).toMatchObject({start:p(300,0),end:p(1000,0)})
    expect(next.entities[2]).toEqual(d.entities[1])
  })
  it('trims an open polyline by path distance without losing joined geometry',()=>{
    const poly:CadEntity={kind:'polyline',id:'poly',layerId:'wall',
      points:[p(0,0),p(1000,0),p(1000,1000)]}
    const d=make([poly,line('edge',500,-100,500,100),line('edge2',900,-100,900,100)])
    const next=trimDocument(d,['edge','edge2'],'poly',p(700,0),()=> 'new')
    expect(next.entities[0]).toMatchObject({kind:'polyline',points:[p(0,0),p(500,0)]})
    expect(next.entities[1]).toMatchObject({kind:'polyline',points:[p(900,0),p(1000,0),p(1000,1000)]})
  })
  it('supports block cutters through expanded single-level geometry',()=>{
    const d=make([line('target',0,0,3000,0),
      {kind:'insert',id:'instance',layerId:'wall',blockId:'block',position:p(1500,0),rotation:0}])
    d.blocks=[{id:'block',name:'刀線',entities:[line('definition',0,-300,0,300,'0') as Extract<CadEntity,{kind:'line'}>]}]
    const next=trimDocument(d,['instance'],'target',p(2500,0),()=> 'unused')
    expect(next.entities[0]).toMatchObject({start:p(0,0),end:p(1500,0)})
  })
  it('rejects nonintersecting, closed-loop, missing-edge, target cutter, hidden and locked cases',()=>{
    const d=make([line('target',0,0,3000,0),line('edge',1000,100,1000,200)])
    expect(()=>trimDocument(d,['edge'],'target',p(250,0),()=> 'x')).toThrow('交點')
    expect(()=>trimDocument(d,['target'],'target',p(250,0),()=> 'x')).toThrow()
    expect(()=>trimDocument(d,['missing'],'target',p(250,0),()=> 'x')).toThrow('不存在')
    const closed:CadEntity={id:'closed',kind:'polyline',layerId:'wall',
      points:[p(0,0),p(200,0),p(200,200),p(0,0)]}
    expect(()=>trimDocument({...d,entities:[...d.entities,closed]},['edge'],'closed',p(100,0),()=> 'x')).toThrow('封閉')
    d.layers.find(l=>l.id==='wall')!.locked=true
    expect(()=>trimDocument(d,['edge'],'target',p(100,0),()=> 'x')).toThrow('鎖定')
    d.layers.find(l=>l.id==='wall')!.locked=false
    d.layers.find(l=>l.id==='wall')!.visible=false
    expect(()=>trimDocument(d,['edge'],'target',p(100,0),()=> 'x')).toThrow('隱藏')
  })
  it('supports undo/redo and native JSON preservation after trims and offsets',()=>{
    const initial=make([line('line',0,0,3000,0),line('edge',1500,-300,1500,300)])
    const offset=offsetDocument(initial,'line',100,p(1000,500),'parallel')
    const after=trimDocument(offset,['edge'],'line',p(100,0),()=> 'trimmed')
    expect(parseDocument(JSON.parse(JSON.stringify(after)))).toEqual(after)
    let state:History={past:[],present:initial,future:[]}
    state=documentReducer(state,{type:'edit',update:()=>offset})
    state=documentReducer(state,{type:'edit',update:()=>after})
    state=documentReducer(state,{type:'undo'})
    expect(state.present).toEqual(offset)
    state=documentReducer(state,{type:'redo'})
    expect(state.present).toEqual(after)
  })
  it('registers the common AutoCAD keyboard aliases',()=>{
    expect(findCommand('O')).toBe('offset')
    expect(findCommand('OFFSET')).toBe('offset')
    expect(findCommand('TR')).toBe('trim')
    expect(findCommand('TRIM')).toBe('trim')
  })
})
