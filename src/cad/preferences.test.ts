import {describe,it,expect} from 'vitest'
import {findCommand,parseLengthInput,parsePointInput,EDITABLE_SHORTCUTS} from './commands'
import {parsePreferences,validateAlias,shouldSubmitInCommandInput,
  shouldSubmitCommandKey,canRedirectPlainKey,DEFAULT_PREFERENCES} from './preferences'
const p=(x:number,y:number)=>({x,y})
describe('v1.1.0 exact mm/cm input',()=>{
 it('converts precise explicit centimetres to world millimetres without scaling the document',()=>{
  expect(parseLengthInput('30cm')).toBe(300)
  expect(parseLengthInput('12.34 cm')).toBe(123.4)
  expect(parseLengthInput('0.01cm')).toBe(.1)
  expect(parseLengthInput('0.125cm')).toBe(1.25)
  expect(parseLengthInput('120mm')).toBe(120)
  expect(parseLengthInput('1.25m')).toBe(1250)
  expect(parseLengthInput('30公分')).toBe(300)
  expect(parseLengthInput('5毫米')).toBe(5)
  expect(parseLengthInput('2公尺')).toBe(2000)
 })
 it('keeps bare legacy numbers in mm unless user explicitly switches preference to cm',()=>{
  expect(parseLengthInput('30')).toBe(30)
  expect(parseLengthInput('30','cm')).toBe(300)
  expect(parsePointInput('3000,1500',null,p(0,0))).toEqual(p(3000,1500))
  expect(parsePointInput('300,150',null,p(0,0),'cm')).toEqual(p(3000,1500))
  expect(parsePointInput('300mm,150mm',null,p(0,0),'cm')).toEqual(p(300,150))
 })
 it('handles mixed suffix, absolute, relative, polar and cursor-oriented scalars',()=>{
  expect(parsePointInput('30cm,1.25m',null,p(0,0))).toEqual(p(300,1250))
  expect(parsePointInput('@12.5cm,3mm',p(100,200),p(0,0))).toEqual(p(225,203))
  expect(parsePointInput('@10cm<90',p(50,50),p(0,0))).toEqual(p(50,150))
  expect(parsePointInput('30cm',p(0,0),p(100,0))).toEqual(p(300,0))
  expect(parsePointInput('30',p(0,0),p(100,0),'cm')).toEqual(p(300,0))
 })
 it('rounds at 0.001 mm, including fractional cm without truncating to integers',()=>{
  expect(parseLengthInput('1.23456cm')).toBe(12.346)
  expect(parsePointInput('1.23456cm,0',null,p(0,0))).toEqual(p(12.346,0))
  expect(parsePointInput('@0.001cm,0',p(50,0),p(0,0))).toEqual(p(50.01,0))
 })
 it('rejects unsupported units, expression syntax, invalid points and infinite inputs',()=>{
  expect(parseLengthInput('10inch')).toBeNull()
  expect(parseLengthInput('Infinity')).toBeNull()
  expect(parseLengthInput('1e12')).toBeNull()
  expect(parsePointInput('@10cm,0',null,p(0,0))).toBeNull()
  expect(parsePointInput('10in,20',null,p(0,0))).toBeNull()
  expect(parsePointInput('@10cm<nan',p(0,0),p(100,0))).toBeNull()
 })
})
describe('v1.1.0 CAD customizable keyboard and browser conflict protection',()=>{
 it('supports both Space and Enter as confirmation by default',()=>{
  expect(DEFAULT_PREFERENCES.confirmKey).toBe('both')
  expect(shouldSubmitCommandKey(' ','both')).toBe(true)
  expect(shouldSubmitCommandKey('Enter','both')).toBe(true)
  expect(shouldSubmitCommandKey(' ','enter')).toBe(false)
  expect(shouldSubmitCommandKey('Enter','space')).toBe(false)
 })
 it('does not hijack Chinese IME, plain text spaces or modified browser keys',()=>{
  const normal={isComposing:false,ctrlKey:false,metaKey:false,altKey:false,freeText:false}
  expect(shouldSubmitInCommandInput(' ','both',normal)).toBe(true)
  expect(shouldSubmitInCommandInput(' ','both',{...normal,freeText:true})).toBe(false)
  expect(shouldSubmitInCommandInput('Enter','both',{...normal,freeText:true})).toBe(true)
  expect(shouldSubmitInCommandInput(' ','both',{...normal,isComposing:true})).toBe(false)
  expect(shouldSubmitInCommandInput(' ','both',{...normal,metaKey:true})).toBe(false)
  expect(shouldSubmitInCommandInput(' ','both',{...normal,repeat:true})).toBe(false)
 })
 it('only redirects plain single-character keys outside editable inputs and dialogs',()=>{
  const basic={key:'L',ctrlKey:false,metaKey:false,altKey:false,isComposing:false,
    editing:false,dialogOpen:false}
  expect(canRedirectPlainKey(basic)).toBe(true)
  expect(canRedirectPlainKey({...basic,key:' '})).toBe(false)
  expect(canRedirectPlainKey({...basic,key:'Ctrl'})).toBe(false)
  expect(canRedirectPlainKey({...basic,ctrlKey:true})).toBe(false)
  expect(canRedirectPlainKey({...basic,metaKey:true})).toBe(false)
  expect(canRedirectPlainKey({...basic,altKey:true})).toBe(false)
  expect(canRedirectPlainKey({...basic,editing:true})).toBe(false)
  expect(canRedirectPlainKey({...basic,dialogOpen:true})).toBe(false)
  expect(canRedirectPlainKey({...basic,isComposing:true})).toBe(false)
  expect(canRedirectPlainKey({...basic,repeat:true})).toBe(false)
 })
 it('remaps a primary CAD alias while retaining full command words and no cross-command collisions',()=>{
  expect(findCommand('Q',{line:'Q'})).toBe('line')
  expect(findCommand('L',{line:'Q'})).toBeNull()
  expect(findCommand('LINE',{line:'Q'})).toBe('line')
  expect(findCommand('PL')).toBe('polyline')
  expect(validateAlias('line','TR')).toContain('使用')
  expect(validateAlias('line','CTRL+L')).toContain('英文字母')
  expect(validateAlias('line','SPACE')).toContain('保留鍵')
  expect(validateAlias('line','Q',{move:'Q'})).toContain('另一個')
  expect(validateAlias('line','Q')).toBeNull()
  expect(EDITABLE_SHORTCUTS.length).toBeGreaterThanOrEqual(18)
 })
 it('sanitizes corrupted preferences, duplicate shortcuts, and preserves valid settings',()=>{
  const prefs=parsePreferences({confirmKey:'space',inputUnit:'cm',
    shortcuts:{line:'Q',move:'Q',copy:'TR',trim:'QQ',arc:'42',wall:'K'}})
  expect(prefs).toMatchObject({confirmKey:'space',inputUnit:'cm'})
  expect(prefs.shortcuts.line).toBe('Q')
  expect(prefs.shortcuts.move).toBeUndefined()
  expect(prefs.shortcuts.copy).toBeUndefined()
  expect(prefs.shortcuts.trim).toBe('QQ')
  expect(prefs.shortcuts.arc).toBeUndefined()
  expect(prefs.shortcuts.wall).toBe('K')
  expect(parsePreferences({confirmKey:'invalid',inputUnit:'foot'})).toMatchObject({
    confirmKey:'both',inputUnit:'mm'
  })
 })
})
