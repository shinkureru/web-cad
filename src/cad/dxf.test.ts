import { describe,expect,it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { createDocument, parseDocument } from './document'
import { createBlockFromSelection } from './blocks'
import { exportDxf,importDxf } from './dxf'
import type { CadEntity } from './types'
const P=(x:number,y:number)=>({x,y})
const line=(id:string,layerId:string,a:number,b:number,c:number,d:number):CadEntity=>
  ({id,kind:'line',layerId,start:P(a,b),end:P(c,d)})
const dxf=(...data:(string|number)[])=>data.join('\n')+'\n'
describe('DXF 2000 interchange',()=>{
  it('exports section order, model units, layers, linework and close flags',()=>{
    const doc=createDocument()
    doc.entities=[line('line','wall',0,0,3000,0),
      {kind:'rectangle',id:'rect',layerId:'furniture',start:P(100,200),end:P(900,700)},
      {kind:'circle',id:'c',layerId:'0',center:P(-300,100),radius:120}]
    const output=exportDxf(doc)
    expect(output.warnings).toHaveLength(0)
    expect(output.text).toContain('9\r\n$ACADVER\r\n1\r\nAC1015')
    expect(output.text).toContain('9\r\n$INSUNITS\r\n70\r\n4')
    expect(output.text).toContain('0\r\nLWPOLYLINE')
    expect(output.text).toContain('0\r\nCIRCLE')
    expect(output.text).toContain('0\r\nBLOCK_RECORD')
    expect(output.text).toContain('0\r\nDICTIONARY')
    const result=importDxf(output.text,'施工圖.dxf')
    expect(result.warnings).toEqual([])
    expect(result.imported).toBe(3)
    expect(result.document.name).toBe('施工圖')
    expect(result.document.entities.find(e=>e.kind==='line')).toMatchObject({start:P(0,0),end:P(3000,0)})
    expect(result.document.entities.find(e=>e.kind==='circle')).toMatchObject({center:P(-300,100),radius:120})
    const closed=result.document.entities.find(e=>e.kind==='polyline')
    if(closed?.kind!=='polyline')throw new Error('Missing imported rectangle')
    expect(closed.points[0]).toEqual(closed.points.at(-1))
    expect(result.document.layers.find(l=>l.name==='牆體')?.lineweight).toBe(.5)
  })
  it('writes and restores true block definitions, independent INSERT references and placement',()=>{
    let doc=createDocument()
    doc.entities=[line('a','0',0,0,1500,0),line('b','0',1500,0,1500,650)]
    doc=createBlockFromSelection(doc,['a','b'],'門片示意',P(0,0),'original-block','insert-a')
    doc.entities.push({kind:'insert',id:'insert-b',layerId:'door',blockId:'original-block',
      position:P(3600,2500),rotation:90})
    const exported=exportDxf(doc)
    const imported=importDxf(exported.text)
    expect(imported.warnings).toEqual([])
    expect(imported.document.blocks).toHaveLength(1)
    expect(imported.document.blocks![0].name).toBe('門片示意')
    expect(imported.document.blocks![0].entities).toHaveLength(2)
    const inserts=imported.document.entities.filter(e=>e.kind==='insert')
    expect(inserts).toHaveLength(2)
    expect(inserts[0].kind==='insert' && inserts[1].kind==='insert' &&
      inserts[0].blockId===inserts[1].blockId).toBe(true)
    expect(inserts[1]).toMatchObject({position:P(3600,2500),rotation:90})
  })
  it('preserves editable aligned and linear dimension definitions plus styles',()=>{
    const doc=createDocument()
    doc.dimensionStyles![0].suffix=' mm'
    doc.dimensionStyles![0].precision=1
    doc.entities=[
      {id:'d1',kind:'dimension',layerId:'dimension',start:P(0,0),end:P(3000,0),
        placement:P(1500,500),mode:'linear',axis:'horizontal',styleId:'standard'},
      {id:'d2',kind:'dimension',layerId:'dimension',start:P(0,0),end:P(3000,4000),
        placement:P(200,3000),mode:'aligned',axis:'horizontal',styleId:'detail'},
    ]
    const encoded=exportDxf(doc)
    expect(encoded.text).toContain('0\r\nDIMENSION')
    expect(encoded.text).toContain('0\r\nDIMSTYLE')
    expect(encoded.text).toContain('100\r\nAcDbDimension')
    const result=importDxf(encoded.text)
    expect(result.skipped).toBe(0)
    expect(result.document.entities.filter(e=>e.kind==='dimension')).toHaveLength(2)
    expect(result.document.entities[0]).toMatchObject({kind:'dimension',start:P(0,0),
      end:P(3000,0),mode:'linear',axis:'horizontal'})
    expect(result.document.entities[1]).toMatchObject({kind:'dimension',start:P(0,0),
      end:P(3000,4000),mode:'aligned'})
    expect(result.document.dimensionStyles?.some(s=>s.suffix==='mm' && s.precision===1)).toBe(true)
    expect(parseDocument(result.document)).toEqual(result.document)
  })
  it('uses escaped unicode for Traditional Chinese text and name strings',()=>{
    const doc=createDocument()
    doc.entities.push({id:'text',kind:'text',layerId:'0',text:'廚房設備 繁體中文',
      position:P(-20,30),height:150,rotation:35})
    const encoded=exportDxf(doc)
    expect(encoded.text).toContain('\\U+5EDA')
    expect(encoded.text).toContain('\\U+623F')
    const result=importDxf(encoded.text)
    const text=result.document.entities.find(e=>e.kind==='text')
    expect(text).toMatchObject({text:'廚房設備 繁體中文',position:P(-20,30),rotation:35,height:150})
  })
  it('splits multiline TEXT with a warning instead of silent loss',()=>{
    const doc=createDocument()
    doc.entities.push({id:'multi',kind:'text',layerId:'0',text:'第一行\n第二行',
      position:P(0,0),height:100,rotation:0})
    const exported=exportDxf(doc)
    expect(exported.warnings.some(w=>w.includes('多行文字'))).toBe(true)
    const imported=importDxf(exported.text)
    expect(imported.document.entities.filter(e=>e.kind==='text')).toHaveLength(2)
  })
  it('converts external imperial coordinates to millimetres and exposes absent units',()=>{
    const fixture=dxf(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,1,0,'ENDSEC',
      0,'SECTION',2,'ENTITIES',0,'LINE',8,'0',10,1,20,2,11,3,21,2,
      0,'ENDSEC',0,'EOF')
    const read=importDxf(fixture)
    expect(read.warnings).toHaveLength(0)
    expect(read.document.entities[0]).toMatchObject({start:P(25.4,50.8),end:P(76.19999999999999,50.8)})
    const noUnits=dxf(0,'SECTION',2,'ENTITIES',0,'LINE',8,'0',10,0,20,0,11,1,21,0,0,'ENDSEC',0,'EOF')
    expect(importDxf(noUnits).warnings.some(w=>w.includes('假設'))).toBe(true)
  })
  it('warns and skips unsupported ARC and splined/bulged entities instead of corrupting them',()=>{
    const fixture=dxf(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',
      0,'SECTION',2,'ENTITIES',0,'ARC',8,'0',10,0,20,0,40,500,50,0,51,90,
      0,'LWPOLYLINE',8,'0',90,2,70,0,10,0,20,0,42,.414213562,
      10,100,20,100,
      0,'LINE',8,'0',10,0,20,0,11,1200,21,0,
      0,'ENDSEC',0,'EOF')
    const read=importDxf(fixture)
    expect(read.imported).toBe(1)
    expect(read.skipped).toBe(2)
    expect(read.warnings.some(w=>w.includes('ARC'))).toBe(true)
    expect(read.warnings.some(w=>w.includes('bulge'))).toBe(true)
  })
  it('skips unsupported scaled INSERT references and tells the user',()=>{
    const doc=createDocument()
    doc.entities=[line('a','0',0,0,200,0)]
    const block=createBlockFromSelection(doc,['a'],'Test',P(0,0),'b','inst')
    const exported=exportDxf(block).text.replace('41\r\n1\r\n42\r\n1\r\n43\r\n1','41\r\n2\r\n42\r\n1\r\n43\r\n1')
    const read=importDxf(exported)
    expect(read.imported).toBe(0)
    expect(read.skipped).toBe(1)
    expect(read.warnings.some(w=>w.includes('縮放'))).toBe(true)
  })
  it('emits an independent parser smoke fixture when requested by CI',()=>{
    const destination=process.env.DXF_SMOKE_FILE
    if(!destination)return
    let doc=createDocument()
    doc.entities=[
      line('L1','wall',0,0,3000,0),
      line('L2','wall',3000,0,3000,2400),
      {id:'TXT',kind:'text',layerId:'0',position:P(200,500),text:'廚房設備',height:150,rotation:0},
      {id:'DIM',kind:'dimension',layerId:'dimension',start:P(0,0),end:P(3000,0),
        placement:P(1500,-450),mode:'linear',axis:'horizontal',styleId:'standard'},
      {id:'DA',kind:'dimension',layerId:'dimension',start:P(0,0),end:P(3000,4000),
        placement:P(200,3000),mode:'aligned',axis:'horizontal',styleId:'detail'},
    ]
    doc=createBlockFromSelection(doc,['L1','L2'],'家具圖塊',P(0,0),'smoke-block','smoke-insert')
    doc.entities.push({id:'another',kind:'insert',layerId:'furniture',
      blockId:'smoke-block',position:P(4800,2600),rotation:90})
    const exported=exportDxf(doc)
    expect(exported.warnings).toEqual([])
    writeFileSync(destination,exported.text,'utf8')
  })
  it('imports independently generated ezdxf geometry and blocks (CI reverse direction)',()=>{
    const fixture=process.env.DXF_EXTERNAL_FILE
    if(!fixture)return
    const text=readFileSync(fixture,'utf8')
    const result=importDxf(text,'independent.dxf')
    expect(result.imported).toBe(5)
    expect(result.skipped, JSON.stringify(result.warnings)).toBe(0)
    expect(result.document.entities.find(e=>e.kind==='line'))
      .toMatchObject({start:P(0,0),end:P(3000,0)})
    expect(result.document.entities.find(e=>e.kind==='circle'))
      .toMatchObject({center:P(1500,900),radius:450})
    expect(result.document.entities.find(e=>e.kind==='text'))
      .toMatchObject({text:'廚房',height:180})
    expect(result.document.blocks?.some(b=>b.name==='窗型')).toBe(true)
    expect(result.document.entities.find(e=>e.kind==='insert'))
      .toMatchObject({rotation:90,position:P(1500,200)})
  })
  it('does not allow malicious or truncated input to replace a drawing',()=>{
    const invalid=['', 'Binary DXF','0\nSECTION\n2\nENTITIES\n0\nENDSEC',
      dxf(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,1234,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'ENDSEC',0,'EOF')]
    for(const value of invalid)expect(()=>importDxf(value)).toThrow()
    expect(()=>importDxf('0\n'.repeat(6*1024*1024))).toThrow()
  })
})
