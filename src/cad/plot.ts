import { expandedDrawing } from './blocks'
import { dimensionGeometry, entityExtentPoints, getDimensionStyle } from './annotations'
import type { CadDisplayEntity, CadDocument, CadLayer, DimensionEntity, Point } from './types'

export type PaperSize = 'A4' | 'A3'
export type PaperOrientation = 'landscape' | 'portrait'
export type PrintColor = 'monochrome' | 'color'
export interface PlotOptions {
  paper: PaperSize
  orientation: PaperOrientation
  scale: 20 | 50 | 100 | 200 | 500
  color: PrintColor
  margin: number
}
export interface Bounds { minX:number; minY:number; maxX:number; maxY:number }
export interface PlotResult {
  svg: string
  pageWidth: number
  pageHeight: number
  contentWidth: number
  contentHeight: number
  modelBounds: Bounds
  modelViewport: Bounds
  fits: boolean
  warnings: string[]
}
export const DEFAULT_PLOT_OPTIONS: PlotOptions = {
  paper:'A3',orientation:'landscape',scale:50,color:'monochrome',margin:10
}
const PAPER:Record<PaperSize,[number,number]>={A4:[210,297],A3:[297,420]}
const titleHeight=23
const esc=(v:string):string => v.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
const n=(v:number)=>Number(v.toFixed(5)).toString()
const tag=(name:string,props:Record<string,string|number>,inner='')=>
  '<'+name+Object.entries(props).map(([key,value])=>' '+key+'="'+esc(String(value))+'"').join('')+
  (inner? '>'+esc(inner)+'</'+name+'>':' />')
const point=(x:number,y:number):Point=>({x,y})
const extend=(bounds:Bounds,p:Point):void=>{
  bounds.minX=Math.min(bounds.minX,p.x);bounds.minY=Math.min(bounds.minY,p.y)
  bounds.maxX=Math.max(bounds.maxX,p.x);bounds.maxY=Math.max(bounds.maxY,p.y)
}
function textBox(text:string,height:number,rotation:number,pos:Point,align:'center'|'start'):Point[]{
  const length=Math.max(1,...text.split('\n').map(line=>[...line].length))
  const width=length*height*.75, rows=text.split('\n').length
  const left=align==='center'?-width/2:0
  const yBottom=-(rows-1)*height*1.3-height/2,yTop=height/2
  const a=rotation*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a)
  return [
    point(left,yBottom),point(left+width,yBottom),point(left,yTop),point(left+width,yTop)
  ].map(p=>point(pos.x+p.x*cos-p.y*sin,pos.y+p.x*sin+p.y*cos))
}
function entityBounds(entity:CadDisplayEntity,doc:CadDocument):Point[]{
  switch(entity.kind){
    case 'line':return [entity.start,entity.end]
    case 'rectangle':return [entity.start,entity.end]
    case 'polyline':return entity.points
    case 'circle':return [
      point(entity.center.x-entity.radius,entity.center.y-entity.radius),
      point(entity.center.x+entity.radius,entity.center.y+entity.radius)]
    case 'text':return entityExtentPoints(entity,getDimensionStyle(doc))
    case 'dimension':{
      const geo=dimensionGeometry(entity,getDimensionStyle(doc,entity.styleId))
      return [...geo.lines.flatMap(line=>[line.a,line.b]),
        ...geo.arrowheads.flat(),...textBox(geo.label.text,geo.label.height,geo.label.rotation,geo.label.position,'center')]
    }
  }
}
/** Actual visible ink extents; hidden layers do not affect centering or clipping. */
export function drawingBounds(doc:CadDocument):Bounds|null{
  const layers=new Set(doc.layers.filter(layer=>layer.visible).map(layer=>layer.id))
  const bounds:Bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
  for(const entity of expandedDrawing(doc)){
    if(!layers.has(entity.layerId))continue
    for(const p of entityBounds(entity,doc))extend(bounds,p)
  }
  return Number.isFinite(bounds.minX)?bounds:null
}
function style(entity:CadDisplayEntity,doc:CadDocument,opts:PlotOptions){
  const layer=doc.layers.find(l=>l.id===entity.layerId) as CadLayer
  const color=(entity.color && entity.color!=='ByLayer'?entity.color:layer.color)
  const lineweight=typeof entity.lineweight==='number'?entity.lineweight:layer.lineweight
  const lt=entity.linetype&&entity.linetype!=='ByLayer'?entity.linetype:(layer.linetype??'continuous')
  return {
    stroke:opts.color==='monochrome'?'#111111':color,
    strokeWidth:n(Math.min(2.11,Math.max(.05,lineweight))),
    strokeDasharray:lt==='dashed'?'4 2':lt==='center'?'9 2 2 2':'none'
  }
}
export function buildPlot(doc:CadDocument,options:PlotOptions):PlotResult{
  const opts={...options}
  if(![20,50,100,200,500].includes(opts.scale))throw new Error('不支援的輸出比例')
  if(!PAPER[opts.paper]||!['portrait','landscape'].includes(opts.orientation)
    ||!['color','monochrome'].includes(opts.color)
    ||!Number.isFinite(opts.margin)||opts.margin<5||opts.margin>25)throw new Error('紙張或邊界設定無效')
  const dims=PAPER[opts.paper],pageWidth=opts.orientation==='landscape'?dims[1]:dims[0]
  const pageHeight=opts.orientation==='landscape'?dims[0]:dims[1]
  const drawingArea={
    x:opts.margin+2,y:opts.margin+2,
    w:pageWidth-2*opts.margin-4,h:pageHeight-2*opts.margin-titleHeight-4
  }
  if(drawingArea.w<=0||drawingArea.h<=0)throw new Error('可用的紙張面積不足')
  const actual=drawingBounds(doc)
  if(!actual)throw new Error('圖面沒有可輸出的可見物件')
  const center=point((actual.minX+actual.maxX)/2,(actual.minY+actual.maxY)/2)
  const viewWidth=drawingArea.w*opts.scale,viewHeight=drawingArea.h*opts.scale
  const bounds:Bounds={
    minX:center.x-viewWidth/2,maxX:center.x+viewWidth/2,
    minY:center.y-viewHeight/2,maxY:center.y+viewHeight/2
  }
  const fits=actual.minX>=bounds.minX-1e-6 && actual.maxX<=bounds.maxX+1e-6
    && actual.minY>=bounds.minY-1e-6 && actual.maxY<=bounds.maxY+1e-6
  const warnings:string[]=[]
  if(!fits)warnings.push('目前選擇的固定比例超過圖框有效繪圖區域。請更改紙張方向、尺寸或比例；本版禁止截斷出圖。')
  const lines:string[]=[]
  const tx=(x:number)=>n(drawingArea.x+(x-bounds.minX)/opts.scale)
  const ty=(y:number)=>n(drawingArea.y+(bounds.maxY-y)/opts.scale)
  const at=(p:Point)=>tx(p.x)+','+ty(p.y)
  const trace=(points:Point[],closed=false,attributes:Record<string,string|number>={})=>{
    if(points.length<2)return
    lines.push(tag('polyline',{points:points.map(at).join(' '),
      fill:'none',...attributes,...(closed?{'data-closed':'true'}:{})}))
  }
  const renderText=(text:string,position:Point,height:number,rotation:number,
    attributes:Record<string,string|number>,align:'start'|'middle')=>{
    const fontHeight=Math.max(.01,height/opts.scale)
    text.split('\n').forEach((value,index)=>{
      const a=rotation*Math.PI/180
      const x=position.x+Math.sin(a)*index*height*1.3
      const y=position.y-Math.cos(a)*index*height*1.3
      const xPaper=tx(x),yPaper=ty(y)
      lines.push('<text x="'+xPaper+'" y="'+yPaper+'" font-size="'+n(fontHeight)+
        '" text-anchor="'+align+'" dominant-baseline="middle" font-family="Arial, Noto Sans TC, Microsoft JhengHei, sans-serif"'+
        ' transform="rotate('+n(-rotation)+' '+xPaper+' '+yPaper+')"'+
        Object.entries(attributes).map(([k,v])=>' '+k+'="'+esc(String(v))+'"').join('')+
        '>'+esc(value)+'</text>')
    })
  }
  for(const entity of expandedDrawing(doc)){
    const layer=doc.layers.find(l=>l.id===entity.layerId)
    if(!layer?.visible)continue
    const ink=style(entity,doc,opts)
    const attrs={stroke:ink.stroke,'stroke-width':ink.strokeWidth,'stroke-dasharray':ink.strokeDasharray,
      'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'none'}
    if(entity.kind==='line')trace([entity.start,entity.end],false,attrs)
    else if(entity.kind==='rectangle'){
      trace([entity.start,point(entity.end.x,entity.start.y),entity.end,
        point(entity.start.x,entity.end.y),entity.start],true,attrs)
    }
    else if(entity.kind==='polyline')trace(entity.points,false,attrs)
    else if(entity.kind==='circle'){
      lines.push(tag('circle',{cx:tx(entity.center.x),cy:ty(entity.center.y),
        r:n(entity.radius/opts.scale),fill:'none',...attrs}))
    }else if(entity.kind==='text'){
      renderText(entity.text,entity.position,entity.height,entity.rotation,
        {fill:ink.stroke},'start')
    }else if(entity.kind==='dimension'){
      const dim=entity as DimensionEntity
      const geo=dimensionGeometry(dim,getDimensionStyle(doc,dim.styleId))
      for(const seg of geo.lines)trace([seg.a,seg.b],false,attrs)
      for(const triangle of geo.arrowheads){
        lines.push(tag('polygon',{points:triangle.map(at).join(' '),fill:ink.stroke,stroke:'none'}))
      }
      // The white backing prevents the dimension line from running behind a dimension label.
      const fontSize=geo.label.height/opts.scale
      const textWidth=geo.label.text.length*fontSize*.75
      const mid=geo.label.position
      const x=tx(mid.x),y=ty(mid.y)
      lines.push(tag('rect',{x:n(Number(x)-textWidth/2-.5),y:n(Number(y)-fontSize*.65),
        width:n(textWidth+1),height:n(fontSize*1.3),fill:'white',stroke:'none'}))
      renderText(geo.label.text,mid,geo.label.height,geo.label.rotation,{fill:ink.stroke},'middle')
    }
  }
  const header='<svg xmlns="http://www.w3.org/2000/svg" width="'+pageWidth+'mm" height="'+pageHeight+
    'mm" viewBox="0 0 '+pageWidth+' '+pageHeight+'" role="img" aria-label="CAD 定比例出圖">'
  const fX=opts.margin,fY=opts.margin
  const usableW=pageWidth-opts.margin*2,usableH=pageHeight-opts.margin*2
  const lineY=fY+usableH-titleHeight
  const titleX=fX+usableW*.53
  const scaleBar=1000/opts.scale
  const scaleBarX=fX+6,scaleBarY=lineY+12
  const graphicBar=scaleBar*2 <=usableW*.4 ? [
    tag('rect',{x:n(scaleBarX),y:n(scaleBarY),width:n(scaleBar),height:3,fill:'#101010'}),
    tag('rect',{x:n(scaleBarX+scaleBar),y:n(scaleBarY),width:n(scaleBar),height:3,fill:'#fff',stroke:'#101010','stroke-width':.2}),
    tag('text',{x:n(scaleBarX),y:n(scaleBarY-1.3),'font-size':2.5,fill:'#111'},'0'),
    tag('text',{x:n(scaleBarX+scaleBar),y:n(scaleBarY-1.3),'font-size':2.5,fill:'#111'},'1000'),
    tag('text',{x:n(scaleBarX+scaleBar*2),y:n(scaleBarY-1.3),'font-size':2.5,fill:'#111','text-anchor':'end'},'2000 mm')
  ].join(''):''
  const shapes=[
    tag('rect',{width:pageWidth,height:pageHeight,fill:'#fff'}),
    tag('rect',{x:fX,y:fY,width:usableW,height:usableH,fill:'none',stroke:'#111','stroke-width':.25}),
    tag('line',{x1:fX,y1:lineY,x2:fX+usableW,y2:lineY,stroke:'#111','stroke-width':.25}),
    tag('line',{x1:titleX,y1:lineY,x2:titleX,y2:fY+usableH,stroke:'#111','stroke-width':.25}),
    tag('text',{x:fX+6,y:lineY+7.5,'font-size':3.7,'font-family':'Arial, sans-serif',fill:'#111'},'MODEL SPACE / SCALE BAR'),
    graphicBar,
    tag('text',{x:titleX+5,y:lineY+8,'font-size':4.2,'font-family':'Arial, sans-serif',fill:'#111'},doc.name),
    tag('text',{x:titleX+5,y:lineY+17,'font-size':3,'font-family':'Arial, sans-serif',fill:'#333'},
      opts.paper+' '+opts.orientation+'   /   1:'+opts.scale+'   /   mm'),
    '<defs><clipPath id="print-area"><rect x="'+drawingArea.x+'" y="'+drawingArea.y+
      '" width="'+drawingArea.w+'" height="'+drawingArea.h+'"/></clipPath></defs>',
    '<g clip-path="url(#print-area)">'+lines.join('')+'</g>'
  ]
  return {svg:header+shapes.join('')+'</svg>',pageWidth,pageHeight,
    contentWidth:drawingArea.w,contentHeight:drawingArea.h,modelBounds:actual,
    modelViewport:bounds,fits,warnings}
}
/** Print in browser using an mm-sized SVG. PDF output depends on user choosing "Save as PDF". */
export function printMarkup(result:PlotResult):string{
  return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/>'+
    '<title>WEB CAD 定比例列印</title><style>@page{size:'+result.pageWidth+'mm '+
    result.pageHeight+'mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:'+
    result.pageWidth+'mm;height:'+result.pageHeight+'mm;overflow:hidden}svg{display:block;width:'+
    result.pageWidth+'mm;height:'+result.pageHeight+
    'mm} @media screen{body{background:#eee}}</style></head><body>'+
    result.svg+'</body></html>'
}
