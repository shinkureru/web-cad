import { useState } from 'react'
import { EDITABLE_SHORTCUTS } from '../cad/commands'
import type { CommandOverrides } from '../cad/commands'
import { DEFAULT_PREFERENCES, validateAlias } from '../cad/preferences'
import type { CadPreferences, ConfirmKey } from '../cad/preferences'
import type { InputUnit } from '../cad/commands'

interface Props {
  preferences: CadPreferences
  onApply: (preferences: CadPreferences)=>void
  onClose: ()=>void
}
export default function CadSettingsDialog({preferences,onApply,onClose}:Props){
  const [confirmKey,setConfirmKey]=useState<ConfirmKey>(preferences.confirmKey)
  const [inputUnit,setInputUnit]=useState<InputUnit>(preferences.inputUnit)
  const [draft,setDraft]=useState<Record<string,string>>(()=>
    Object.fromEntries(EDITABLE_SHORTCUTS.map(item=>[
      item.command,preferences.shortcuts[item.command]??item.key
    ]))
  )
  const [error,setError]=useState('')
  function apply(){
    const updated:CommandOverrides={}
    for(const item of EDITABLE_SHORTCUTS){
      const value=(draft[item.command]??item.key).trim().toUpperCase()
      if(!value||value===item.key)continue
      const warning=validateAlias(item.command,value,updated)
      if(warning){
        setError(item.label+'：'+warning)
        return
      }
      updated[item.command]=value
    }
    onApply({confirmKey,inputUnit,shortcuts:updated})
    onClose()
  }
  function reset(){
    setConfirmKey(DEFAULT_PREFERENCES.confirmKey)
    setInputUnit(DEFAULT_PREFERENCES.inputUnit)
    setDraft(Object.fromEntries(EDITABLE_SHORTCUTS.map(item=>[item.command,item.key])))
    setError('')
  }
  return <div className="modal-backdrop settings-overlay" onClick={onClose}>
    <div className="settings-dialog" role="dialog" aria-modal="true"
      aria-label="CAD 鍵盤與單位設定" onClick={e=>e.stopPropagation()}
      onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}}>
      <header className="settings-header">
        <div><h2>鍵盤與單位設定</h2><p>可依個人 CAD 操作習慣調整，儲存在本機瀏覽器</p></div>
        <button aria-label="關閉鍵盤設定" onClick={onClose}>×</button>
      </header>
      <div className="settings-body">
        <section className="settings-section">
          <h3>指令確認鍵</h3>
          <label htmlFor="cad-confirm-key">選擇送出指令時使用的按鍵</label>
          <select id="cad-confirm-key" aria-label="指令確認鍵" value={confirmKey}
            onChange={e=>setConfirmKey(e.target.value as ConfirmKey)}>
            <option value="both">空白鍵＋Enter（推薦）</option>
            <option value="space">只有空白鍵</option>
            <option value="enter">只有 Enter</option>
          </select>
          <p>在 CAD 指令列可用空白鍵送出；輸入一般文字或圖塊名稱時，空白鍵仍會打出空格。輸入法選字期間不會誤送出。</p>
        </section>
        <section className="settings-section">
          <h3>尺寸輸入單位</h3>
          <label htmlFor="cad-input-unit">沒有單位後綴的數字要如何解讀？</label>
          <select id="cad-input-unit" aria-label="尺寸輸入單位" value={inputUnit}
            onChange={e=>setInputUnit(e.target.value as InputUnit)}>
            <option value="mm">毫米 mm（與舊版相同）</option>
            <option value="cm">公分 cm（例如輸入 300 代表 300 cm）</option>
          </select>
          <p>明確輸入 30cm、125mm、1.25m 永遠能自動換算。模型與 DXF 仍保存毫米；改變輸入單位不會修改舊圖。</p>
        </section>
        <section className="settings-section">
          <h3>自訂 CAD 指令簡碼</h3>
          <p>改寫主要指令代碼，英文完整名稱仍有效；不允許和其他 CAD 指令、瀏覽器或系統保留代碼衝突。</p>
          <div className="settings-alias-grid">
            {EDITABLE_SHORTCUTS.map(item=><label key={item.command} className="settings-alias-row">
              <span>{item.label}</span>
              <input aria-label={'自訂指令 '+item.command} maxLength={12}
                value={draft[item.command]??item.key}
                onChange={e=>{setDraft(old=>({...old,[item.command]:e.target.value.toUpperCase()}));setError('')}}
                autoComplete="off" spellCheck={false}/>
            </label>)}
          </div>
        </section>
        <section className="settings-section">
          <h3>瀏覽器快捷鍵保護</h3>
          <p>Ctrl／Command＋L、T、W、R、S、F、P 等由瀏覽器或系統處理，無法在網頁中取得更高權限。CAD 的文字快捷輸入只在畫布焦點／無輸入框焦點時啟用。選取輸入框時，Ctrl／Command＋Z、A、C、V 等仍保留原生文字編輯功能。</p>
          <p>F3／F8 僅在畫布取得焦點時控制鎖點／正交；比例出圖可使用 PLOT 指令或上方工具列，不搶占 Ctrl／Command＋P。</p>
        </section>
      </div>
      {error&&<p className="settings-error" role="alert">{error}</p>}
      <footer className="settings-actions">
        <button onClick={reset}>恢復預設</button>
        <div><button onClick={onClose}>取消</button>
          <button className="settings-primary" onClick={apply}>儲存設定</button></div>
      </footer>
    </div>
  </div>
}
