import { EDITABLE_SHORTCUTS, findCommand } from './commands'
import type { CommandOverrides, EditableCommand, InputUnit } from './commands'

export type ConfirmKey = 'both'|'enter'|'space'
export interface CadPreferences {
  confirmKey: ConfirmKey
  inputUnit: InputUnit
  shortcuts: CommandOverrides
}
export const PREF_STORAGE_KEY = 'web-cad:v1:preferences'
export const DEFAULT_PREFERENCES: CadPreferences = {
  confirmKey:'both',inputUnit:'mm',shortcuts:{}
}
const RESERVED = new Set(['SPACE','ENTER','RETURN','ESC','ESCAPE','TAB','BACKSPACE',
  'DELETE','SHIFT','CTRL','CONTROL','ALT','META','CMD','COMMAND','OPTION',
  'CAPSLOCK','HOME','END','PAGEUP','PAGEDOWN','ARROWUP','ARROWDOWN','ARROWLEFT','ARROWRIGHT'])

/** An alias is a bare CAD command, never Ctrl/Alt/Meta or a browser/system chord. */
export function validateAlias(command:EditableCommand,key:string,
  current:CommandOverrides={}):string|null{
  const normalized=key.trim().toUpperCase()
  if(!normalized)return null // empty removes the custom alias
  if(!/^[A-Z]{1,8}$/.test(normalized))
    return '只接受 1–8 個英文字母，不支援 Ctrl／Alt／Command 等組合鍵。'
  if(RESERVED.has(normalized))
    return '此鍵為瀏覽器、輸入法或系統保留鍵，無法綁定。'
  const taken=findCommand(normalized)
  if(taken&&taken!==command)
    return '代碼 '+normalized+' 已被其他 CAD 指令使用，請選擇另一個代碼。'
  if(EDITABLE_SHORTCUTS.some(item=>item.command!==command &&
    current[item.command]?.toUpperCase()===normalized))
    return '這個代碼已被另一個自訂 CAD 快捷鍵使用。'
  return null
}

export function parsePreferences(value:unknown):CadPreferences{
  const result:CadPreferences={...DEFAULT_PREFERENCES,shortcuts:{}}
  if(!value||typeof value!=='object')return result
  const raw=value as Partial<CadPreferences>
  if(raw.confirmKey==='both'||raw.confirmKey==='enter'||raw.confirmKey==='space')
    result.confirmKey=raw.confirmKey
  if(raw.inputUnit==='cm'||raw.inputUnit==='mm')result.inputUnit=raw.inputUnit
  if(raw.shortcuts&&typeof raw.shortcuts==='object'&&!Array.isArray(raw.shortcuts)){
    for(const item of EDITABLE_SHORTCUTS){
      const current=raw.shortcuts[item.command]
      if(typeof current!=='string'||current.length>8)continue
      const alias=current.trim().toUpperCase()
      if(alias&&!validateAlias(item.command,alias,result.shortcuts))
        result.shortcuts[item.command]=alias
    }
  }
  return result
}
export function loadPreferences():CadPreferences{
  try{
    const saved=localStorage.getItem(PREF_STORAGE_KEY)
    return saved?parsePreferences(JSON.parse(saved) as unknown):parsePreferences(null)
  }catch{return parsePreferences(null)}
}
export function shouldSubmitCommandKey(key:string,setting:ConfirmKey):boolean{
  return (key==='Enter'&&(setting==='both'||setting==='enter'))||
    (key===' '&&(setting==='both'||setting==='space'))
}

/** Keydown text-entry must never steal Space while composing or typing free text. */
export function shouldSubmitInCommandInput(key:string,setting:ConfirmKey,
  options:{isComposing:boolean;ctrlKey:boolean;metaKey:boolean;altKey:boolean;
    freeText:boolean;repeat?:boolean}):boolean{
  if(options.isComposing||options.ctrlKey||options.metaKey||options.altKey||options.repeat)return false
  if(options.freeText) return key==='Enter' // text and block names need literal spaces
  return shouldSubmitCommandKey(key,setting)
}

/** Browser owns Ctrl/Cmd+L,T,W,R,S,F,P etc. Only plain commands belong to CAD;
 * browser/text fields keep their own shortcuts and native editing.
 */
export function canRedirectPlainKey(options:{
  key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;isComposing:boolean;
  editing:boolean;dialogOpen:boolean;repeat?:boolean
}):boolean{
  return !options.ctrlKey&&!options.metaKey&&!options.altKey&&!options.isComposing
    &&!options.editing&&!options.dialogOpen&&!options.repeat
    &&options.key.length===1&&options.key!==' '
}
