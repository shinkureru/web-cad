/**
 * DXF AC1015 (AutoCAD 2000) 2D interchange subset.
 * The native .webcad.json remains lossless; DXF is an interoperable, audited subset.
 * All internal coordinates are millimetres. Never silently discard unsupported geometry.
 */
import { createDocument, parseDocument, uid } from './document'
import { dimensionGeometry, DEFAULT_DIMENSION_STYLES, getDimensionStyle } from './annotations'
import type { CadDocument, CadEntity, CadPrimitive, DimensionEntity, DimensionStyle, LineType, Point } from './types'

export interface DxfTransfer { text: string; warnings: string[] }
export interface DxfImport { document: CadDocument; warnings: string[]; imported: number; skipped: number }
type Pair = { code: number; value: string }
type RecordData = { type: string; pairs: Pair[] }
const MAX_SIZE = 10 * 1024 * 1024
const MAX_PAIRS = 180000
const near = (a: Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y)<.0001
const numeric = (n:number) => {
  if(!Number.isFinite(n))throw new Error('DXF 座標包含無效數值')
  return Number(n.toPrecision(14)).toString()
}
const safeName=(s:string,fallback:string) =>
  (s.replace(/[<>/\\":;?*|=,\x00-\x1f]/g,'_').trim().slice(0,110)||fallback)
const mapNames=(items:{id:string;name:string}[], fallback:string)=>{
  const result=new Map<string,string>(),used=new Set<string>()
  for(const item of items){
    const base=safeName(item.name,fallback)
    let name=base,i=1
    while(used.has(name.toUpperCase()))name=base+'_'+(++i)
    used.add(name.toUpperCase());result.set(item.id,name)
  }
  return result
}
const encode=(input:string)=>[...input].map(ch=>{
  const u=ch.codePointAt(0)!
  if(u===10 || u===13)return ' '
  if(u>=32 && u<=126)return ch
  if(u<=65535)return '\\U+'+u.toString(16).toUpperCase().padStart(4,'0')
  const cp=u-65536
  return '\\U+'+(0xd800+(cp>>10)).toString(16).toUpperCase()
    +'\\U+'+(0xdc00+(cp&1023)).toString(16).toUpperCase()
}).join('')
const decode=(s:string)=>s.replace(/(?:\\U\+[0-9A-Fa-f]{4})+/g,token=>{
  const codes=[...token.matchAll(/\\U\+([0-9A-Fa-f]{4})/g)].map(m=>parseInt(m[1],16))
  return String.fromCharCode(...codes)
})
const rgbInt=(hex:string)=>parseInt(hex.slice(1),16)
const intRgb=(i:number)=>'#'+(i&0xffffff).toString(16).padStart(6,'0')
const ACI=['#e7edf3','#ff3333','#ffff00','#00ff00','#00ffff','#3333ff','#ff00ff','#e7edf3','#808080','#c0c0c0']
const aciColor=(x:number)=>ACI[Math.abs(x)]||'#e7edf3'
const ltypeName=(v:string|undefined)=>v==='dashed'?'DASHED':v==='center'?'CENTER':'CONTINUOUS'
const lineType=(s:string)=>s.toUpperCase()==='DASHED'?'dashed':s.toUpperCase()==='CENTER'?'center':'continuous'
const tableEntry = (values: Pair[],code:number)=>values.find(p=>p.code===code)?.value
const group=(r:RecordData,code:number,defaultVal='')=>tableEntry(r.pairs,code)??defaultVal
const numberGroup=(r:RecordData,code:number,fallback=0)=> {
  const value=group(r,code)
  if(value==='')return fallback
  const n=Number(value)
  if(!Number.isFinite(n))throw new Error('DXF 群組碼 '+code+' 包含無效數字')
  return n
}
const pointGroup=(r:RecordData,code:number,multiplier=1):Point=>({
  x:numberGroup(r,code)*multiplier,y:numberGroup(r,code+10)*multiplier
})
const nonZeroElevation=(r:RecordData)=> Math.abs(numberGroup(r,30))>1e-6
  ||(group(r,210)!=='' && (Math.abs(numberGroup(r,210))>1e-6
    || Math.abs(numberGroup(r,220))>1e-6 || Math.abs(numberGroup(r,230,1)-1)>1e-6))
const commonFromRecord=(r:RecordData, layerId:string) => {
  const color=group(r,420)
  const aci=group(r,62)
  const weight=numberGroup(r,370,-1)
  const lt=group(r,6)
  return {
    layerId,
    ...(color?{color:intRgb(Number(color))}
      : aci && Number(aci)!==256 && Number(aci)!==0?{color:aciColor(Number(aci))}:{}),
    ...(weight>=0?{lineweight:weight/100}:{}),
    ...(lt&&lt.toUpperCase()!=='BYLAYER'?{linetype:lineType(lt)}:{})
  }
}

/** Export standard 2D entities, real INSERT/BLOCK references, and native 2D DIMENSION records. */
export function exportDxf(doc:CadDocument):DxfTransfer {
  const drawing=parseDocument(doc)
  const warnings:string[]=[]
  const lines:string[]=[]
  const out=(code:number,val:string|number)=>{lines.push(String(code),typeof val==='number'?numeric(val):val)}
  let handle=0x100
  const h=()=> (++handle).toString(16).toUpperCase()
  const rec=(kind:string)=>{out(0,kind);out(5,h())}
  const sec=(name:string)=>{out(0,'SECTION');out(2,name)}
  const end=()=>out(0,'ENDSEC')
  const xy=(n:number,p:Point)=>{out(n,p.x);out(n+10,p.y);out(n+20,0)}
  const layerNames=mapNames(drawing.layers,'Layer')
  const blockNames=mapNames(drawing.blocks??[],'BLOCK')
  const layer=(id:string)=>layerNames.get(id)??'0'
  const styles=drawing.dimensionStyles?.length?drawing.dimensionStyles:DEFAULT_DIMENSION_STYLES
  const styleNames=mapNames(styles,'DIMSTYLE')
  const dimNames=new Map<string,string>()
  let dimIndex=0
  for(const entity of drawing.entities)if(entity.kind==='dimension')dimNames.set(entity.id,'*D'+(++dimIndex))
  const names=['*Model_Space','*Paper_Space',...(drawing.blocks??[]).map(b=>blockNames.get(b.id)!),...dimNames.values()]
  function common(entity:CadEntity,forceLayer?:string){
    out(100,'AcDbEntity');out(8,encode(forceLayer??layer(entity.layerId)))
    if(entity.color && entity.color!=='ByLayer'){out(420,rgbInt(entity.color));out(62,7)}
    if(typeof entity.lineweight==='number')out(370,Math.round(entity.lineweight*100))
    if(entity.linetype && entity.linetype!=='ByLayer')out(6,ltypeName(entity.linetype))
  }
  function drawable(entity:CadPrimitive|Extract<CadEntity,{kind:'text'}>,forcedLayer?:string){
    if(entity.kind==='line'){
      rec('LINE');common(entity,forcedLayer);out(100,'AcDbLine');xy(10,entity.start);xy(11,entity.end)
    }else if(entity.kind==='circle'){
      rec('CIRCLE');common(entity,forcedLayer);out(100,'AcDbCircle')
      xy(10,entity.center);out(40,entity.radius)
    }else if(entity.kind==='polyline' || entity.kind==='rectangle'){
      let points=entity.kind==='polyline'?[...entity.points]:[
        entity.start,{x:entity.end.x,y:entity.start.y},entity.end,
        {x:entity.start.x,y:entity.end.y}]
      const closed=entity.kind==='rectangle' || (points.length>2 && near(points[0],points[points.length-1]))
      if(closed && points.length>2)points=points.slice(0,-1)
      rec('LWPOLYLINE');common(entity,forcedLayer);out(100,'AcDbPolyline')
      out(90,points.length);out(70,closed?1:0)
      for(const p of points){out(10,p.x);out(20,p.y)}
    }else if(entity.kind==='text'){
      // A native multiline TEXT object is represented as multiple single-line TEXT objects.
      const chunks=entity.text.split('\n')
      if(chunks.length>1)warnings.push('多行文字已拆分為 '+chunks.length+' 個 TEXT 圖元，重新匯入後不再是單一物件。')
      const rad=entity.rotation*Math.PI/180
      for(let i=0;i<chunks.length;i++){
        if(!chunks[i])continue
        const pos={x:entity.position.x+Math.sin(rad)*i*entity.height*1.3,
          y:entity.position.y-Math.cos(rad)*i*entity.height*1.3}
        rec('TEXT');common(entity,forcedLayer);out(100,'AcDbText')
        xy(10,pos);out(40,entity.height);out(1,encode(chunks[i]));out(50,entity.rotation);out(7,'STANDARD')
      }
    }
  }
  function drawDimensionPicture(dim:DimensionEntity){
    const geom=dimensionGeometry(dim,getDimensionStyle(drawing,dim.styleId))
    for(const [i,{a,b}] of geom.lines.entries())drawable({
      id:dim.id+'_line'+i,kind:'line',layerId:dim.layerId,start:a,end:b,
      color:dim.color,lineweight:dim.lineweight,linetype:dim.linetype
    },'0')
    for(const [i,pts] of geom.arrowheads.entries())drawable({
      id:dim.id+'_arrow'+i,kind:'polyline',layerId:dim.layerId,
      points:[...pts,pts[0]],color:dim.color,lineweight:dim.lineweight,linetype:dim.linetype
    },'0')
    drawable({id:dim.id+'_label',kind:'text',layerId:dim.layerId,
      position:geom.label.position,height:geom.label.height,rotation:geom.label.rotation,
      text:geom.label.text,color:dim.color,lineweight:dim.lineweight,linetype:dim.linetype},'0')
  }

  sec('HEADER')
  out(9,'$ACADVER');out(1,'AC1015')
  out(9,'$HANDSEED');out(5,'FFFFFF')
  out(9,'$DWGCODEPAGE');out(3,'ANSI_1252')
  out(9,'$INSUNITS');out(70,4)
  out(9,'$MEASUREMENT');out(70,1)
  out(9,'$LUNITS');out(70,2)
  out(9,'$LUPREC');out(70,3)
  end()
  sec('CLASSES');end()
  sec('TABLES')
  for(const name of ['VPORT','VIEW','UCS']){
    out(0,'TABLE');out(2,name);out(70,0);out(0,'ENDTAB')
  }
  out(0,'TABLE');out(2,'LTYPE');out(70,5)
  for(const [name,segments,total] of [
    ['BYBLOCK',[],0],['BYLAYER',[],0],['CONTINUOUS',[],0],['DASHED',[9,-6],15],['CENTER',[16,-5,3,-5],29],
  ] as [string,number[],number][]){
    rec('LTYPE');out(100,'AcDbSymbolTableRecord');out(100,'AcDbLinetypeTableRecord')
    out(2,name);out(70,0);out(3,name);out(72,65);out(73,segments.length);out(40,total)
    for(const v of segments)out(49,v)
  }
  out(0,'ENDTAB')
  out(0,'TABLE');out(2,'LAYER');out(70,drawing.layers.length)
  for(const l of drawing.layers){
    rec('LAYER');out(100,'AcDbSymbolTableRecord');out(100,'AcDbLayerTableRecord')
    out(2,encode(layer(l.id)));out(70,l.locked?4:0);out(62,l.visible?7:-7)
    out(420,rgbInt(l.color));out(6,ltypeName(l.linetype));out(370,Math.round(l.lineweight*100))
  }
  out(0,'ENDTAB')
  out(0,'TABLE');out(2,'STYLE');out(70,1)
  rec('STYLE');out(100,'AcDbSymbolTableRecord');out(100,'AcDbTextStyleTableRecord')
  out(2,'STANDARD');out(70,0);out(40,0);out(41,1);out(50,0);out(71,0);out(42,1)
  out(3,'txt');out(4,'')
  out(0,'ENDTAB')
  out(0,'TABLE');out(2,'APPID');out(70,1)
  rec('APPID');out(100,'AcDbSymbolTableRecord');out(100,'AcDbRegAppTableRecord')
  out(2,'ACAD');out(70,0)
  out(0,'ENDTAB')
  const allStyles=[...styles]
  if(![...styleNames.values()].some(name=>name.toUpperCase()==='STANDARD')){
    allStyles.push({...DEFAULT_DIMENSION_STYLES[0],id:'dxf-default-standard',name:'STANDARD'})
    styleNames.set('dxf-default-standard','STANDARD')
  }
  out(0,'TABLE');out(2,'DIMSTYLE');out(70,allStyles.length)
  for(const s of allStyles){
    out(0,'DIMSTYLE');out(105,h());out(100,'AcDbSymbolTableRecord');out(100,'AcDbDimStyleTableRecord')
    out(2,encode(styleNames.get(s.id)!));out(70,0)
    out(3,s.suffix?'<> '+encode(s.suffix).trim():'<>')
    out(40,1);out(41,s.arrowSize);out(42,s.extensionGap);out(44,s.extensionBeyond)
    out(140,s.textHeight);out(147,s.textGap);out(271,s.precision);out(277,2)
  }
  out(0,'ENDTAB')
  out(0,'TABLE');out(2,'BLOCK_RECORD');out(70,names.length)
  for(const name of names){rec('BLOCK_RECORD');out(100,'AcDbSymbolTableRecord')
    out(100,'AcDbBlockTableRecord');out(2,encode(name));out(70,0)}
  out(0,'ENDTAB')
  end()
  sec('BLOCKS')
  function startBlock(name:string){
    rec('BLOCK');out(100,'AcDbEntity');out(8,'0');out(100,'AcDbBlockBegin')
    out(2,encode(name));out(70,0);xy(10,{x:0,y:0});out(3,encode(name));out(1,'')
  }
  function endBlock(){rec('ENDBLK');out(100,'AcDbEntity');out(8,'0');out(100,'AcDbBlockEnd')}
  for(const name of names.slice(0,2)){startBlock(name);endBlock()}
  for(const b of drawing.blocks??[]){
    startBlock(blockNames.get(b.id)!)
    for(const entity of b.entities)drawable(entity,'0')
    endBlock()
  }
  for(const entity of drawing.entities)if(entity.kind==='dimension'){
    startBlock(dimNames.get(entity.id)!)
    drawDimensionPicture(entity)
    endBlock()
  }
  end()
  sec('ENTITIES')
  for(const entity of drawing.entities){
    if(entity.kind==='insert'){
      rec('INSERT');common(entity);out(100,'AcDbBlockReference')
      out(2,encode(blockNames.get(entity.blockId)??'UNKNOWN'));xy(10,entity.position);out(41,1);out(42,1)
      out(43,1);out(50,entity.rotation)
    }else if(entity.kind==='dimension'){
      const geom=dimensionGeometry(entity,getDimensionStyle(drawing,entity.styleId))
      rec('DIMENSION');common(entity);out(100,'AcDbDimension')
      out(2,dimNames.get(entity.id)!);xy(10,geom.dimensionEnd);xy(11,geom.label.position)
      out(70,entity.mode==='aligned'?33:32)
      out(3,encode(styleNames.get(entity.styleId)??styleNames.get(styles[0].id)!))
      out(100,'AcDbAlignedDimension');xy(13,entity.start);xy(14,entity.end)
      if(entity.mode==='linear'){
        out(50,entity.axis==='horizontal'?0:90)
        out(100,'AcDbRotatedDimension')
      }
    }else drawable(entity)
  }
  end()
  sec('OBJECTS')
  const root=h(),groupDict=h()
  out(0,'DICTIONARY');out(5,root);out(100,'AcDbDictionary');out(281,1)
  out(3,'ACAD_GROUP');out(350,groupDict)
  out(0,'DICTIONARY');out(5,groupDict);out(330,root);out(100,'AcDbDictionary');out(281,1)
  end()
  out(0,'EOF')
  return {text:lines.join('\r\n')+'\r\n',warnings}
}

function parsePairs(text:string):Pair[]{
  if(text.length>MAX_SIZE)throw new Error('DXF 超過 10 MB 上限')
  const rows=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/g)
  if(rows.length%2===1 && rows.at(-1)==='')rows.pop()
  if(rows.length%2!==0)throw new Error('DXF 群組碼／數值配對不完整')
  if(rows.length/2>MAX_PAIRS)throw new Error('DXF 圖元數據過大')
  const pairs:Pair[]=[]
  for(let i=0;i<rows.length;i+=2){
    const c=Number(rows[i].trim())
    if(!Number.isInteger(c) || c<0 || c>2000)throw new Error('DXF 群組碼無效')
    pairs.push({code:c,value:rows[i+1].trimEnd()})
  }
  return pairs
}
function records(pairs:Pair[]){
  const section:{name:string;rows:RecordData[]}[]=[]
  let current='',table='',record:RecordData|null=null
  const layers:RecordData[]=[], styles:RecordData[]=[],blocks:{header:RecordData;entities:RecordData[]}[]=[]
  const entities:RecordData[]=[]
  let activeBlock:{header:RecordData;entities:RecordData[]}|null=null
  for(const pair of pairs){
    if(pair.code!==0){if(record)record.pairs.push(pair);continue}
    if(record){
      const r=record
      if(r.type==='SECTION'){current=group(r,2).toUpperCase();section.push({name:current,rows:[]})}
      else if(r.type==='ENDSEC'){current='';table='';activeBlock=null}
      else if(r.type==='TABLE'){table=group(r,2).toUpperCase()}
      else if(r.type==='ENDTAB')table=''
      else if(current==='TABLES' && r.type==='LAYER' && table==='LAYER')layers.push(r)
      else if(current==='TABLES' && r.type==='DIMSTYLE' && table==='DIMSTYLE')styles.push(r)
      else if(current==='BLOCKS' && r.type==='BLOCK'){
        activeBlock={header:r,entities:[]};blocks.push(activeBlock)
      }else if(current==='BLOCKS' && r.type==='ENDBLK'){activeBlock=null}
      else if(current==='BLOCKS' && activeBlock){activeBlock.entities.push(r)}
      else if(current==='ENTITIES' && r.type!=='EOF')entities.push(r)
    }
    record={type:pair.value,pairs:[]}
  }
  if(!pairs.some(p=>p.code===0&&p.value==='EOF'))throw new Error('DXF 缺少 EOF，可能不是完整的 ASCII DXF')
  // Empty sections are legal, but SECTION records and ENTITIES must exist.
  if(!section.some(s=>s.name==='ENTITIES'))throw new Error('DXF 缺少 ENTITIES 區段')
  return {layers,styles,blocks,entities}
}
export function importDxf(source:string,fileName='匯入圖面'):DxfImport {
  const pairs=parsePairs(source)
  const data=records(pairs)
  const warnings:string[]=[]
  const skippedCounts=new Map<string,number>()
  const skip=(type:string)=>skippedCounts.set(type,(skippedCounts.get(type)??0)+1)
  let units:number|undefined
  for(let i=0;i<pairs.length;i++){
    if(pairs[i].code===9 && pairs[i].value==='$INSUNITS'){
      for(let j=i+1;j<Math.min(i+6,pairs.length);j++){
        if(pairs[j].code===9 || pairs[j].code===0)break
        if(pairs[j].code===70){units=Number(pairs[j].value);break}
      }
    }
  }
  const unitsToMm:Record<number,number>={0:1,1:25.4,2:304.8,4:1,5:10,6:1000,14:100}
  if(units===undefined||units===0)warnings.push('DXF 未指定單位，已假設座標為 mm；請確認原圖比例。')
  if(units!==undefined && !(units in unitsToMm))throw new Error('DXF 單位不支援（INSUNITS='+units+'），已中止以避免錯誤比例')
  const scale=unitsToMm[units??0]
  const doc=createDocument()
  doc.name=fileName.replace(/\.dxf$/i,'')||'DXF 匯入圖面'
  doc.entities=[];doc.blocks=[];doc.layers=[];doc.dimensionStyles=[]
  const idByName=new Map<string,string>()
  const resolveLayer=(original:string)=>{
    const name=decode(original||'0')
    const key=name.toUpperCase()
    let id=idByName.get(key)
    if(!id){
      id=name==='0'?'0':'dxf-layer-'+uid()
      doc.layers.push({id,name,color:'#e7edf3',lineweight:.25,linetype:'continuous',visible:true,locked:false})
      idByName.set(key,id)
    }
    return id
  }
  for(const r of data.layers){
    const id=resolveLayer(group(r,2,'0')),l=doc.layers.find(x=>x.id===id)!
    const aci=numberGroup(r,62,7)
    l.visible=aci>=0
    l.locked=(numberGroup(r,70)&4)!==0
    l.color=group(r,420)?intRgb(numberGroup(r,420)):aciColor(aci)
    l.lineweight=Math.max(0,numberGroup(r,370,25)/100)
    l.linetype=lineType(group(r,6,'CONTINUOUS'))
  }
  doc.activeLayerId=resolveLayer('0')
  const dimStyleByName=new Map<string,string>()
  for(const r of data.styles){
    const name=decode(group(r,2))
    if(!name)continue
    const id='dxf-style-'+uid()
    const post=decode(group(r,3,'<>'))
    const suffix=post.startsWith('<>')?post.slice(2).trimStart():''
    const style:DimensionStyle={
      id,name,textHeight:numberGroup(r,140,150)*scale,arrowSize:numberGroup(r,41,70)*scale,
      textGap:numberGroup(r,147,60)*scale,extensionGap:numberGroup(r,42,35)*scale,
      extensionBeyond:numberGroup(r,44,65)*scale,
      precision:Math.min(3,Math.max(0,Math.round(numberGroup(r,271,0)))),
      suffix:suffix.slice(0,16)
    }
    doc.dimensionStyles.push(style);dimStyleByName.set(name.toUpperCase(),id)
  }
  if(!doc.dimensionStyles.length){doc.dimensionStyles=DEFAULT_DIMENSION_STYLES.map(s=>({...s}))}
  doc.activeDimensionStyleId=doc.dimensionStyles[0].id
  function properties(r:RecordData,forceLayer?:string){
    return commonFromRecord(r,forceLayer??resolveLayer(group(r,8,'0')))
  }
  const blocked=new Map<string,{id:string;name:string;base:Point;entities:CadPrimitive[]}>()
  // Definition names are referenced by INSERT records (case-insensitive).
  for(const b of data.blocks){
    const name=decode(group(b.header,2))
    if(!name || name.startsWith('*') || blocked.has(name.toUpperCase()))continue
    const id='dxf-block-'+uid()
    blocked.set(name.toUpperCase(),{id,name,base:pointGroup(b.header,10,scale),entities:[]})
  }
  function parseBasic(r:RecordData, insideBlock=false):CadEntity|null {
    const kind=r.type
    try{
      if(nonZeroElevation(r)){skip(kind+'（非 2D）');return null}
      const common=properties(r,insideBlock ? '0' : undefined)
      if(kind==='LINE'){
        return {kind:'line',id:uid(),...common,
          start:pointGroup(r,10,scale),end:pointGroup(r,11,scale)}
      }
      if(kind==='CIRCLE'){
        const radius=numberGroup(r,40)*scale
        if(radius<=0){skip('CIRCLE（半徑無效）');return null}
        return {kind:'circle',id:uid(),...common,center:pointGroup(r,10,scale),radius}
      }
      if(kind==='LWPOLYLINE'){
        const points:Point[]=[]
        let index=-1
        for(const pair of r.pairs){
          if(pair.code===42 && Math.abs(Number(pair.value))>1e-9){skip('LWPOLYLINE（bulge 圓弧）');return null}
          if(pair.code===10){points.push({x:Number(pair.value)*scale,y:0});index++}
          if(pair.code===20 && index>=0)points[index].y=Number(pair.value)*scale
        }
        if(points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){
          skip('LWPOLYLINE（座標不完整）');return null
        }
        if((numberGroup(r,70)&1)!==0 && !near(points[0],points.at(-1)!))points.push({...points[0]})
        return {kind:'polyline',id:uid(),...common,points}
      }
      if(kind==='TEXT'){
        const text=decode(group(r,1)),height=numberGroup(r,40,150)*scale
        if(!text||height<=0){skip('TEXT（內容無效）');return null}
        return {kind:'text',id:uid(),...common,position:pointGroup(r,10,scale),
          text,height,rotation:numberGroup(r,50)}
      }
      if(kind==='INSERT'){
        const name=decode(group(r,2)),block=blocked.get(name.toUpperCase())
        if(!block){skip('INSERT（找不到定義）');return null}
        if(Math.abs(numberGroup(r,41,1)-1)>1e-9||Math.abs(numberGroup(r,42,1)-1)>1e-9
          ||Math.abs(numberGroup(r,43,1)-1)>1e-9 || numberGroup(r,70,1)!==1
          || numberGroup(r,71,1)!==1){skip('INSERT（縮放／陣列）');return null}
        return {kind:'insert',id:uid(),...common,blockId:block.id,
          position:pointGroup(r,10,scale),rotation:numberGroup(r,50)}
      }
      if(kind==='DIMENSION'){
        const t=numberGroup(r,70)&7
        if(t!==0 && t!==1){skip('DIMENSION（非線性／對齊）');return null}
        if(!r.pairs.some(p=>p.code===13)||!r.pairs.some(p=>p.code===14)){
          skip('DIMENSION（缺少標註點）');return null}
        const start=pointGroup(r,13,scale),end=pointGroup(r,14,scale)
        const angle=((numberGroup(r,50)%180)+180)%180
        if(t===0 && Math.min(Math.abs(angle),Math.abs(angle-90),Math.abs(angle-180))>1e-6){
          skip('DIMENSION（旋轉角度非水平／垂直）');return null
        }
        const axis=angle<45||angle>135?'horizontal':'vertical'
        const sName=decode(group(r,3,'STANDARD'))
        const styleId=dimStyleByName.get(sName.toUpperCase())??doc.dimensionStyles![0].id
        return {kind:'dimension',id:uid(),...common,
          start,end,placement:pointGroup(r,10,scale),mode:t===1?'aligned':'linear',axis,styleId}
      }
      skip(kind)
      return null
    }catch{
      skip(kind+'（解析無效）')
      return null
    }
  }
  for(const b of data.blocks){
    const name=decode(group(b.header,2)),block=blocked.get(name.toUpperCase())
    if(!block)continue
    for(const rec of b.entities){
      const e=parseBasic(rec,true)
      if(e && ['line','polyline','rectangle','circle'].includes(e.kind)){
        const item=e as CadPrimitive
        if(item.kind==='line')block.entities.push({...item,
          start:{x:item.start.x-block.base.x,y:item.start.y-block.base.y},
          end:{x:item.end.x-block.base.x,y:item.end.y-block.base.y}})
        else if(item.kind==='circle')block.entities.push({...item,
          center:{x:item.center.x-block.base.x,y:item.center.y-block.base.y}})
        else if(item.kind==='polyline')block.entities.push({...item,
          points:item.points.map(p=>({x:p.x-block.base.x,y:p.y-block.base.y}))})
      }else if(e)skip('BLOCK（不支援的內部圖元）')
    }
  }
  doc.blocks=[...blocked.values()].filter(b=>b.entities.length>0)
    .map(b=>({id:b.id,name:b.name,entities:b.entities}))
  for(const rec of data.entities){
    const entity=parseBasic(rec)
    if(entity && entity.kind==='insert' && !doc.blocks.some(b=>b.id===entity.blockId)){
      skip('INSERT（空圖塊）');continue
    }
    if(entity)doc.entities.push(entity)
    if(doc.entities.length>40000)throw new Error('DXF 圖元數量超過安全上限')
  }
  for(const [type,count] of skippedCounts)warnings.push('已略過 '+count+' 個 '+type+' 圖元；原圖可能不完整。')
  if(doc.blocks.length!==blocked.size)warnings.push('部分空白／複雜圖塊未匯入。')
  if(!doc.entities.length && skippedCounts.size)warnings.push('沒有可匯入的 2D 圖元。')
  return {document:parseDocument(doc),warnings,imported:doc.entities.length,
    skipped:[...skippedCounts.values()].reduce((sum,n)=>sum+n,0)}
}
