import {describe,it,expect} from 'vitest'
import { createDocument,documentReducer,parseDocument } from './document'
import { cornerGeometry, extendLine, infiniteIntersection, joinLines, windowSelection } from './advancedEditing'
import { findCommand } from './commands'
import type {CadDocument,CadEntity,LineEntity,Point} from './types'
import type {History} from './document'
const p=(x:number,y:number):Point=>({x,y})
const l=(id:string,a:Point,b:Point,layerId='wall'):LineEntity=>({id,kind:'line',layerId,start:a,end:b})
const doc=(entities:CadEntity[]):CadDocument=>({...createDocument(),entities})
describe('EXTEND — finite-boundary precision',()=>{
  it('extends the nearest clicked endpoint to a vertical finite boundary',()=>{
    const d=doc([l('target',p(0,0),p(1000,0)),l('limit',p(2000,-500),p(2000,500))])
    const result=extendLine(d,['limit'],'target',p(980,0))
    expect(result.entities[0]).toMatchObject({start:p(0,0),end:p(2000,0)})
    expect(result.entities[1]).toEqual(d.entities[1])
    expect(d.entities[0]).toMatchObject({end:p(1000,0)})
  })
  it('extends the start endpoint in the negative direction',()=>{
    const d=doc([l('t',p(1000,0),p(3000,0)),l('cutter',p(0,-100),p(0,100))])
    expect(extendLine(d,['cutter'],'t',p(900,0)).entities[0]).toMatchObject({start:p(0,0),end:p(3000,0)})
  })
  it('chooses the closest forward intersection among several cutting boundaries',()=>{
    const d=doc([l('t',p(0,0),p(500,0)),l('far',p(2000,-1000),p(2000,1000)),l('near',p(800,-1000),p(800,1000))])
    expect(extendLine(d,['far','near'],'t',p(500,0)).entities[0]).toMatchObject({end:p(800,0)})
  })
  it('extends to circle boundary and block-transformed edges',()=>{
    const d=doc([l('t',p(0,0),p(500,0)),{id:'c',kind:'circle',layerId:'0',center:p(1400,0),radius:200}])
    expect(extendLine(d,['c'],'t',p(500,0)).entities[0]).toMatchObject({end:p(1200,0)})
    const second=doc([l('t',p(0,0),p(500,0)),
      {id:'inst',kind:'insert',layerId:'0',blockId:'block',position:p(1000,0),rotation:90}])
    second.blocks=[{id:'block',name:'Test',entities:[l('edge',p(-100,0),p(100,0),'0')]}]
    expect(extendLine(second,['inst'],'t',p(500,0)).entities[0]).toMatchObject({end:p(1000,0)})
  })
  it('refuses unbounded, parallel, behind-target and missing boundary geometries',()=>{
    const d=doc([l('t',p(0,0),p(1000,0)),l('parallel',p(0,200),p(1000,200))])
    expect(()=>extendLine(d,['parallel'],'t',p(1000,0))).toThrow('交點')
    expect(()=>extendLine(d,[],'t',p(1000,0))).toThrow('邊界')
    expect(()=>extendLine(d,['parallel'],'parallel',p(500,200))).toThrow()
    const behind=doc([l('t',p(0,0),p(1000,0)),l('edge',p(500,-200),p(500,200))])
    expect(()=>extendLine(behind,['edge'],'t',p(990,0))).toThrow('交點')
  })
  it('protects locked and hidden layers from EXTEND commits',()=>{
    const d=doc([l('t',p(0,0),p(1000,0)),l('edge',p(2000,-100),p(2000,100))])
    d.layers.find(x=>x.id==='wall')!.locked=true
    expect(()=>extendLine(d,['edge'],'t',p(1000,0))).toThrow('鎖定')
    d.layers.find(x=>x.id==='wall')!.locked=false
    d.layers.find(x=>x.id==='wall')!.visible=false
    expect(()=>extendLine(d,['edge'],'t',p(1000,0))).toThrow('隱藏')
  })
})
describe('FILLET and CHAMFER',()=>{
  const a=l('horizontal',p(1000,0),p(0,0))
  const b=l('vertical',p(0,0),p(0,1000))
  it('computes the theoretical intersection of two nonparallel infinite lines',()=>{
    expect(infiniteIntersection(a,b)).toEqual(p(0,0))
    expect(infiniteIntersection(a,l('p',p(0,100),p(1000,100)))).toBeNull()
  })
  it('CHAMFER trims original LINE endpoints and inserts an editable physical bridge',()=>{
    const d=doc([a,b])
    const n=joinLines(d,[a.id,b.id],'chamfer',100,200,'join')
    expect(n.entities).toHaveLength(3)
    expect(n.entities[0]).toMatchObject({id:a.id,start:p(1000,0),end:p(100,0)})
    expect(n.entities[1]).toMatchObject({id:b.id,start:p(0,200),end:p(0,1000)})
    expect(n.entities[2]).toMatchObject({id:'join',kind:'line',start:p(100,0),end:p(0,200)})
    expect(d.entities[0]).toEqual(a)
  })
  it('FILLET creates native analytic ARC with exact radius and tangent points',()=>{
    const n=joinLines(doc([a,b]),[a.id,b.id],'fillet',100,100,'arc')
    expect(n.entities).toHaveLength(3)
    expect(n.entities[0]).toMatchObject({end:p(100,0)})
    expect(n.entities[1]).toMatchObject({start:p(0,100)})
    const arc=n.entities[2]
    if(arc.kind!=='arc')throw new Error('Expected native ARC')
    expect(arc.center).toEqual(p(100,100))
    expect(arc.radius).toBe(100)
    expect(arc.startAngle).toBeCloseTo(180,6)
    expect(arc.endAngle).toBeCloseTo(270,6)
  })
  it('supports zero-radius FILLET and asymmetric chamfers without a zero-length bridge',()=>{
    const fillet=cornerGeometry(a,b,'fillet',0)
    expect(fillet.connector).toBeNull()
    expect(fillet.a.end).toEqual(p(0,0))
    expect(fillet.b.start).toEqual(p(0,0))
    const c=cornerGeometry(a,b,'chamfer',50,150)
    expect(c.connector).toMatchObject({start:p(50,0),end:p(0,150)})
  })
  it('works in different quadrants and for non-connected corners that require extension',()=>{
    const x=l('x',p(400,0),p(1200,0))
    const y=l('y',p(0,400),p(0,1200))
    const q=cornerGeometry(x,y,'chamfer',100,100)
    expect(q.a.start).toEqual(p(100,0))
    expect(q.b.start).toEqual(p(0,100))
    const neg=cornerGeometry(l('nx',p(-2000,0),p(0,0)),l('ny',p(0,-2000),p(0,0)),'fillet',200)
    expect(neg.connector?.kind).toBe('arc')
  })
  it('refuses oversized radius, internally-crossing/parallel lines and invalid ids',()=>{
    expect(()=>cornerGeometry(a,b,'fillet',2000)).toThrow('不足')
    expect(()=>cornerGeometry(a,b,'chamfer',-10)).toThrow()
    const crossA=l('c1',p(-1000,0),p(1000,0))
    const crossB=l('c2',p(0,-1000),p(0,1000))
    expect(()=>cornerGeometry(crossA,crossB,'fillet',100)).toThrow('內部')
    const parallel=l('para',p(0,10),p(1000,10))
    expect(()=>cornerGeometry(a,parallel,'chamfer',100)).toThrow('平行')
    const d=doc([a,b])
    d.layers.find(x=>x.id==='wall')!.locked=true
    expect(()=>joinLines(d,['horizontal','vertical'],'chamfer',100,100,'new')).toThrow('鎖定')
  })
  it('roundtrips through native JSON preserving ARC, Undo/Redo',()=>{
    const initial=doc([a,b])
    const final=joinLines(initial,[a.id,b.id],'fillet',100,100,'arc')
    expect(parseDocument(JSON.parse(JSON.stringify(final)))).toEqual(final)
    let history:History={past:[],present:initial,future:[]}
    history=documentReducer(history,{type:'edit',update:()=>final})
    history=documentReducer(history,{type:'undo'})
    expect(history.present).toEqual(initial)
    history=documentReducer(history,{type:'redo'})
    expect(history.present).toEqual(final)
  })
})
describe('window/crossing drag selection',()=>{
  it('left-to-right selects only fully enclosed entities',()=>{
    const d=doc([
      l('inside',p(0,0),p(1000,0)),
      l('cross',p(-200,300),p(500,300)),
      l('outside',p(3000,100),p(4000,100))
    ])
    expect(windowSelection(d,p(-50,-100),p(1100,400))).toEqual(['inside'])
  })
  it('right-to-left crossing selects partly intersecting linework',()=>{
    const d=doc([l('inside',p(0,0),p(1000,0)),l('cross',p(-500,300),p(500,300))])
    expect(windowSelection(d,p(1100,400),p(-50,-100))).toEqual(['inside','cross'])
  })
  it('supports circle outline crossings and excludes a circle surrounding the box',()=>{
    const d=doc([{id:'c1',kind:'circle',layerId:'0',center:p(150,150),radius:100},
      {id:'c2',kind:'circle',layerId:'0',center:p(1000,1000),radius:200},
      {id:'c3',kind:'circle',layerId:'0',center:p(150,150),radius:10000}])
    expect(windowSelection(d,p(300,300),p(100,100))).toEqual(['c1'])
    expect(windowSelection(d,p(100,100),p(300,300))).toEqual([])
  })
  it('selects multi-segment blocks atomically and respects layer locks/visibility',()=>{
    const d=doc([{id:'block1',kind:'insert',blockId:'b',position:p(500,500),rotation:0,layerId:'door'},
      l('locked',p(100,200),p(800,200),'furniture')])
    d.blocks=[{id:'b',name:'block',entities:[
      l('defA',p(0,0),p(500,0),'0'),l('defB',p(500,0),p(500,250),'0')]}]
    d.layers.find(l=>l.id==='furniture')!.locked=true
    expect(windowSelection(d,p(-100,-100),p(1200,1200))).toEqual(['block1'])
    d.layers.find(l=>l.id==='door')!.visible=false
    expect(windowSelection(d,p(-100,-100),p(1200,1200))).toEqual([])
  })
  it('detects crossing edges with neither endpoint inside the box',()=>{
    const d=doc([l('spanning',p(-1000,150),p(1000,150))])
    expect(windowSelection(d,p(300,300),p(100,100))).toEqual(['spanning'])
    expect(windowSelection(d,p(100,100),p(300,300))).toEqual([])
  })
  it('registers common CAD shortcuts and preserves empty-drag behavior',()=>{
    expect(findCommand('EX')).toBe('extend')
    expect(findCommand('EXTEND')).toBe('extend')
    expect(findCommand('F')).toBe('fillet')
    expect(findCommand('FILLET')).toBe('fillet')
    expect(findCommand('CHA')).toBe('chamfer')
    expect(findCommand('CHAMFER')).toBe('chamfer')
    expect(windowSelection(doc([]),p(0,0),p(0,0))).toEqual([])
  })
})
