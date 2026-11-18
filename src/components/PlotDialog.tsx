import { useEffect, useMemo, useState } from 'react'
import { Download, Printer, X, FileText, AlertTriangle } from 'lucide-react'
import { buildPlot, DEFAULT_PLOT_OPTIONS, printMarkup } from '../cad/plot'
import type { PaperOrientation, PaperSize, PlotOptions, PrintColor } from '../cad/plot'
import type { CadDocument } from '../cad/types'

interface Props { doc: CadDocument; onClose: () => void }
const SCALES=[20,50,100,200,500] as const
const cleanFile=(s:string)=>s.replace(/[\\/:*?"<>|]/g,'_').trim()||'未命名圖面'

export default function PlotDialog({doc,onClose}:Props){
  const [options,setOptions]=useState<PlotOptions>(DEFAULT_PLOT_OPTIONS)
  const [previewUrl,setPreviewUrl]=useState('')
  const [error,setError]=useState('')
  const update=<K extends keyof PlotOptions>(key:K,value:PlotOptions[K])=>
    setOptions(prev=>({...prev,[key]:value}))
  const plot=useMemo(()=>{
    try{return {result:buildPlot(doc,options),error:''}}
    catch(e){return {result:null,error:e instanceof Error?e.message:'無法產生出圖預覽'}}
  },[doc,options])
  useEffect(()=>{
    if(!plot.result){setPreviewUrl('');return}
    const url=URL.createObjectURL(new Blob([plot.result.svg],{type:'image/svg+xml;charset=utf-8'}))
    setPreviewUrl(url)
    return ()=>URL.revokeObjectURL(url)
  },[plot.result])
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose()}
    }
    window.addEventListener('keydown',onKey,true)
    return ()=>window.removeEventListener('keydown',onKey,true)
  },[onClose])
  const saveSvg=()=>{
    const result=plot.result
    if(!result||!result.fits)return
    const url=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}))
    const link=document.createElement('a')
    link.href=url;link.download=cleanFile(doc.name)+'_1-'+options.scale+'_'+options.paper+'.svg'
    document.body.appendChild(link);link.click();link.remove()
    window.setTimeout(()=>URL.revokeObjectURL(url),1200)
  }
  const print=()=>{
    const result=plot.result
    if(!result||!result.fits)return
    const tab=window.open('','_blank')
    if(!tab){setError('瀏覽器已封鎖列印視窗，請允許網站開啟新視窗。');return}
    tab.document.open();tab.document.write(printMarkup(result));tab.document.close()
    tab.document.title='WEB CAD｜'+cleanFile(doc.name)+'｜1:'+options.scale
    const go=()=>{tab.focus();tab.print()}
    void tab.document.fonts.ready.then(go).catch(go)
  }
  const result=plot.result
  return <div className="plot-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="plot-dialog" role="dialog" aria-modal="true" aria-label="比例出圖設定">
      <header className="plot-header">
        <div><span className="plot-eyebrow">PRINT / PLOT STUDIO</span><h2>定比例出圖</h2>
          <p>向量 SVG · 瀏覽器列印／另存 PDF · 模型單位 mm</p></div>
        <button aria-label="關閉出圖預覽" title="關閉" onClick={onClose}><X size={19}/></button>
      </header>
      <div className="plot-content">
        <aside className="plot-controls">
          <label>紙張尺寸
            <select aria-label="紙張尺寸" value={options.paper} onChange={e=>update('paper',e.target.value as PaperSize)}>
              <option value="A3">A3 · 297 × 420 mm</option><option value="A4">A4 · 210 × 297 mm</option>
            </select>
          </label>
          <label>紙張方向
            <select aria-label="紙張方向" value={options.orientation} onChange={e=>update('orientation',e.target.value as PaperOrientation)}>
              <option value="landscape">橫向</option><option value="portrait">直向</option>
            </select>
          </label>
          <label>出圖比例（固定，不自動縮放）
            <select aria-label="出圖比例" value={options.scale} onChange={e=>update('scale',Number(e.target.value) as PlotOptions['scale'])}>
              {SCALES.map(scale=><option key={scale} value={scale}>1 : {scale}</option>)}
            </select>
          </label>
          <label>線條模式
            <select aria-label="列印顏色" value={options.color} onChange={e=>update('color',e.target.value as PrintColor)}>
              <option value="monochrome">黑白線條（推薦施工圖）</option>
              <option value="color">保留圖層／物件顏色</option>
            </select>
          </label>
          <label>頁面外框邊界（mm）
            <input aria-label="出圖邊界" type="number" min={5} max={25} step={1}
              value={options.margin} onChange={e=>{
                const num=Number(e.target.value)
                if(Number.isFinite(num)&&num>=5&&num<=25)update('margin',num)
              }}/>
          </label>
          <div className="plot-metrics">
            <div><span>紙張</span><strong>{result?(result.pageWidth+' × '+result.pageHeight+' mm'):'—'}</strong></div>
            <div><span>有效繪圖區</span><strong>{result?(result.contentWidth+' × '+result.contentHeight+' mm'):'—'}</strong></div>
            <div><span>模型容納範圍</span><strong>{result?(Math.round(result.contentWidth*options.scale)+' × '+Math.round(result.contentHeight*options.scale)+' mm'):'—'}</strong></div>
            <div><span>實際比例</span><strong>1 : {options.scale}</strong></div>
          </div>
          {result?.warnings.map((warning,i)=><p className="plot-alert" key={i}><AlertTriangle size={15}/>{warning}</p>)}
          {plot.error&&<p className="plot-alert"><AlertTriangle size={15}/>{plot.error}</p>}
          {error&&<p className="plot-alert"><AlertTriangle size={15}/>{error}</p>}
          <p className="plot-disclaimer">PDF 由瀏覽器「列印 → 儲存為 PDF」產生；請設定比例 100%、邊界無、不要符合頁面大小。不同印表機與字型可能影響物理精度，出圖後務必核對 1000 mm 比例尺。</p>
        </aside>
        <div className="plot-preview-pane">
          <div className="plot-preview-top"><span><FileText size={15}/> 預覽圖紙（向量）</span>
            <span>{result?.fits?'圖面完整落在圖框內':'待調整出圖設定'}</span></div>
          <div className="plot-preview-board">
            {result&&previewUrl?<img className="plot-svg" alt={'CAD '+options.paper+' 1:'+options.scale+' 圖紙預覽'} src={previewUrl}
              style={{aspectRatio:String(result.pageWidth)+' / '+String(result.pageHeight)}}/>:
              <div className="plot-empty">目前沒有可供預覽的圖面</div>}
          </div>
          <footer className="plot-footer">
            <button onClick={onClose}>返回畫布</button>
            <button disabled={!result?.fits} onClick={saveSvg}><Download size={15}/> 匯出 SVG</button>
            <button className="plot-primary" disabled={!result?.fits} onClick={print}><Printer size={15}/> 列印／儲存 PDF</button>
          </footer>
        </div>
      </div>
    </section>
  </div>
}
