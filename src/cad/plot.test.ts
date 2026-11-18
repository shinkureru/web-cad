import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildPlot, drawingBounds, printMarkup, DEFAULT_PLOT_OPTIONS } from './plot'
import { createDocument } from './document'
import type { CadDocument, CadEntity } from './types'

const P=(x:number,y:number)=>({x,y})
const line=(id:string,layerId:string,x1:number,y1:number,x2:number,y2:number):CadEntity=>
  ({id,kind:'line',layerId,start:P(x1,y1),end:P(x2,y2)})
const opts=DEFAULT_PLOT_OPTIONS
const plotWith=(doc:CadDocument,overrides:Partial<typeof opts>={})=>buildPlot(doc,{...opts,...overrides})

describe('v0.6 model-space to physical paper plotting',()=>{
  it('has physically accurate A3 and A4 paper dimensions and respects orientation',()=>{
    const d=createDocument();d.entities=[line('x','wall',0,0,3000,0)]
    const a=plotWith(d)
    expect([a.pageWidth,a.pageHeight]).toEqual([420,297])
    expect(a.svg).toContain('width="420mm" height="297mm"')
    expect(a.contentWidth).toBe(396)
    expect(a.fits).toBe(true)
    const b=plotWith(d,{paper:'A4',orientation:'portrait',scale:100})
    expect([b.pageWidth,b.pageHeight]).toEqual([210,297])
    expect(b.contentWidth).toBe(186)
    expect(b.svg).toContain('width="210mm" height="297mm"')
  })
  it('maps a 6000 mm line to exactly 120 paper mm at 1:50 and 60 mm at 1:100',()=>{
    const d=createDocument();d.entities=[line('long','wall',-500,100,5500,100)]
    const a=plotWith(d,{scale:50}),b=plotWith(d,{scale:100})
    const start=a.svg.indexOf('<g clip-path="url(#print-area)">')
    const poly=a.svg.slice(start).match(/<polyline points="([^"]+)"/)
    expect(poly).not.toBeNull()
    const xs=poly![1].split(' ').map(s=>Number(s.split(',')[0]))
    expect(xs[1]-xs[0]).toBeCloseTo(120,5)
    const polyB=b.svg.slice(b.svg.indexOf('<g clip-path="url(#print-area)">'))
      .match(/<polyline points="([^"]+)"/)
    const xsB=polyB![1].split(' ').map(s=>Number(s.split(',')[0]))
    expect(xsB[1]-xsB[0]).toBeCloseTo(60,5)
  })
  it('prevents output when geometry cannot fit at the fixed ratio, without scaling to fit',()=>{
    const d=createDocument();d.entities=[line('wide','wall',0,0,50000,0)]
    const output=plotWith(d,{paper:'A4',orientation:'portrait',scale:20})
    expect(output.fits).toBe(false)
    expect(output.warnings.join('')).toContain('超過圖框')
    expect(output.modelViewport.maxX-output.modelViewport.minX).toBe(186*20)
  })
  it('centers negative coordinates with invisible entities excluded from extents and output',()=>{
    const d=createDocument()
    d.entities=[line('visible','wall',-3000,-4000,-1000,-2000),
      line('invisible','furniture',200000,200000,300000,300000)]
    d.layers.find(l=>l.id==='furniture')!.visible=false
    expect(drawingBounds(d)).toEqual({minX:-3000,maxX:-1000,minY:-4000,maxY:-2000})
    const r=plotWith(d)
    expect(r.fits).toBe(true)
    expect((r.svg.match(/<polyline /g)||[])).toHaveLength(1)
  })
  it('expands nested-free block references into printable vector geometry',()=>{
    const d=createDocument()
    d.blocks=[{id:'test-block',name:'Wall',entities:[
      line('source','0',0,0,1600,0) as Extract<CadEntity,{kind:'line'}>
    ]}]
    d.entities=[{kind:'insert',id:'instance',layerId:'wall',blockId:'test-block',
      position:P(600,500),rotation:90}]
    const r=plotWith(d)
    expect(r.fits).toBe(true)
    expect(r.svg).toContain('polyline points=')
    expect(r.modelBounds.minX).toBeCloseTo(600)
    expect(r.modelBounds.maxY).toBeCloseTo(2100)
  })
  it('renders true physical lineweights and dashed linetypes, in B/W or layer colors',()=>{
    const d=createDocument()
    d.entities=[{...line('l','wall',0,0,1000,0),lineweight:0.5,linetype:'dashed'}]
    const bw=plotWith(d)
    expect(bw.svg).toContain('stroke-width="0.5"')
    expect(bw.svg).toContain('stroke-dasharray="4 2"')
    expect(bw.svg).toContain('stroke="#111111"')
    const color=plotWith(d,{color:'color'})
    expect(color.svg).toContain('stroke="'+d.layers.find(l=>l.id==='wall')!.color+'"')
  })
  it('keeps text and dimensions in vector SVG with physical heights and arrows',()=>{
    const d=createDocument()
    d.entities=[
      {id:'txt',kind:'text',layerId:'0',text:'廚房設備',position:P(1000,800),height:150,rotation:0},
      {id:'dim',kind:'dimension',layerId:'dimension',start:P(0,0),end:P(3000,0),
        placement:P(1500,-500),mode:'linear',axis:'horizontal',styleId:'standard'},
    ]
    const r=plotWith(d,{scale:50})
    expect(r.svg).toContain('廚房設備')
    expect(r.svg).toContain('font-size="3"')
    expect(r.svg).toContain('>3000</text>')
    expect(r.svg).toContain('<polygon')
    expect(r.fits).toBe(true)
  })
  it('escapes user-controlled drawing names and text, no executable SVG markup',()=>{
    const d=createDocument()
    d.name='A&B <script>alert(1)</script>'
    d.entities=[{id:'txt',kind:'text',layerId:'0',text:'<image href="javascript:alert(1)">',
      position:P(0,0),height:100,rotation:0}]
    const svg=plotWith(d).svg
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<image')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('A&amp;B')
  })
  it('produces print CSS that forbids browser margins and declares exact mm page size',()=>{
    const d=createDocument();d.entities=[line('a','wall',0,0,2000,0)]
    const plot=plotWith(d,{paper:'A4',orientation:'portrait',scale:100})
    const html=printMarkup(plot)
    expect(html).toContain('@page{size:210mm 297mm;margin:0}')
    expect(html).toContain('height:297mm')
    expect(html).toContain('role="img"')
  })
  it('emits a deterministic A3 1:50 plot for independent PDF media-box check',()=>{
    const dest=process.env.PLOT_SMOKE_FILE
    if(!dest)return
    const d=createDocument()
    d.name='出圖物理尺寸驗證'
    d.entities=[
      line('calibration','wall',0,0,6000,0),
      {id:'room',kind:'text',layerId:'0',position:P(1500,700),text:'客廳',height:150,rotation:0},
      {id:'measure',kind:'dimension',layerId:'dimension',start:P(0,0),end:P(6000,0),
        placement:P(3000,-700),mode:'linear',axis:'horizontal',styleId:'standard'},
    ]
    const result=plotWith(d,{paper:'A3',orientation:'landscape',scale:50})
    expect(result.fits).toBe(true)
    writeFileSync(dest,result.svg,'utf8')
  })
  it('rejects empty drawings and invalid page settings',()=>{
    const empty=createDocument()
    expect(()=>plotWith(empty)).toThrow()
    empty.entities=[line('l','wall',0,0,100,0)]
    expect(()=>plotWith(empty,{margin:2})).toThrow()
    expect(()=>plotWith(empty,{scale:13 as 20})).toThrow()
  })
})
