import {test,expect,type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'

const STORAGE='web-cad:v1:document'
const layers=[
  {id:'0',name:'0',color:'#e7edf3',lineweight:.25,visible:true,locked:false},
  {id:'wall',name:'牆體',color:'#f19c81',lineweight:.5,visible:true,locked:false},
  {id:'dimension',name:'標註',color:'#79b5e9',lineweight:.18,visible:true,locked:false},
  {id:'furniture',name:'家具',color:'#e2c37d',lineweight:.25,visible:true,locked:false},
  {id:'door',name:'門窗',color:'#92c7a3',lineweight:.25,visible:true,locked:false},
]
type TestEntity={
  id:string;layerId:string;kind:string;
  [key:string]:unknown
}
const drawing=(entities:TestEntity[])=>({
  version:1 as const,unit:'mm' as const,name:'E2E 圖面',activeLayerId:'wall',
  layers,entities,blocks:[],
})
async function seed(page:Page,entities:TestEntity[]){
  await page.addInitScript(([key,content]:[string,string])=>{
    localStorage.setItem(key,content)
  },[STORAGE,JSON.stringify(drawing(entities))])
}
async function sendCommand(page:Page,command:string){
  const input=page.getByRole('textbox',{name:'CAD 指令輸入'})
  await input.fill(command)
  await input.press('Enter')
}
async function saved(page:Page){
  return page.evaluate((key)=>JSON.parse(localStorage.getItem(key)??'null') as
    {version:number;unit:string;entities:TestEntity[]},STORAGE)
}
async function waitEntities(page:Page,count:number){
  await expect.poll(async()=>{
    const doc=await saved(page)
    return doc?.entities?.length
  }).toBe(count)
}
async function canvasCenter(page:Page){
  const box=await page.locator('canvas.cad-canvas').boundingBox()
  // Some Chromium versions expose canvas as img and some as a bare canvas element.
  if(!box)throw Error('Canvas is not visible')
  return {x:box.x+box.width/2,y:box.y+box.height/2}
}
async function canvasWorld(page:Page,x:number,y:number){
  const c=await canvasCenter(page)
  // App default camera is {x:2400,y:1500,scale:0.16}.
  return {x:c.x+(x-2400)*.16,y:c.y-(y-1500)*.16}
}
async function dragWorld(page:Page,x1:number,y1:number,x2:number,y2:number){
  const from=await canvasWorld(page,x1,y1),to=await canvasWorld(page,x2,y2)
  await page.mouse.move(from.x,from.y)
  await page.mouse.down()
  await page.mouse.move(to.x,to.y,{steps:12})
  await page.mouse.up()
}
test('real command-line LINE creation, Undo/Redo, native JSON download and refresh persistence',async({page})=>{
  await page.goto('/')
  await expect(page.locator('.menu-bar')).toContainText('v1.3.0')
  await expect(page.locator('canvas.cad-canvas')).toBeVisible()
  await sendCommand(page,'L')
  await sendCommand(page,'0,0')
  await sendCommand(page,'1000,0')
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'line',start:{x:0,y:0},end:{x:1000,y:0}
  })
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await waitEntities(page,0)
  await page.locator('button[title="重做 Ctrl+Y"]').click()
  await waitEntities(page,1)
  const pending=page.waitForEvent('download')
  await page.getByRole('button',{name:/備份 JSON/}).click()
  const download=await pending
  expect(download.suggestedFilename()).toMatch(/\.webcad\.json$/)
  const json=JSON.parse(await readFile(await download.path()!,'utf8'))
  expect(json.entities[0]).toMatchObject({kind:'line',end:{x:1000,y:0}})
  json.name='E2E JSON 回復'
  page.once('dialog',dialog=>{void dialog.accept()})
  await page.locator('input[type="file"]').setInputFiles({
    name:'restore.webcad.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(json),'utf8')
  })
  await expect.poll(async()=> (await saved(page) as {name:string}).name).toBe('E2E JSON 回復')
  await page.reload()
  await expect.poll(async()=> (await saved(page)).entities.length).toBe(1)
})
test('actual Canvas drag: L→R enclosed, R→L crossing, batch MOVE and Undo',async({page})=>{
  await seed(page,[
    {id:'inside',kind:'line',layerId:'wall',
      start:{x:2150,y:1500},end:{x:2650,y:1500}},
    {id:'crossing',kind:'line',layerId:'wall',
      start:{x:1900,y:1600},end:{x:2300,y:1600}},
    {id:'outside',kind:'line',layerId:'wall',
      start:{x:3200,y:1650},end:{x:3600,y:1650}},
  ])
  await page.goto('/')
  await expect(page.locator('.menu-bar')).toContainText('v1.3.0')
  await dragWorld(page,2100,1400,2700,1700)
  await expect(page.locator('.console-history')).toContainText('框選：1 個')
  await dragWorld(page,2700,1400,2100,1700)
  await expect(page.locator('.console-history')).toContainText('框選：2 個')
  await sendCommand(page,'M')
  await sendCommand(page,'0,0')
  await sendCommand(page,'@100,0')
  await expect.poll(async()=>{
    const entities=(await saved(page)).entities
    return entities.map(e=>(e.start as {x:number}).x)
  }).toEqual([2250,2000,3200])
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await expect.poll(async()=> (await saved(page)).entities.map(e=>(e.start as {x:number}).x))
    .toEqual([2150,1900,3200])
})
test('real Canvas TRIM converts a CIRCLE into an editable true ARC; DXF export retains ARC',async({page})=>{
  await seed(page,[
    {id:'circle',kind:'circle',layerId:'wall',
      center:{x:2400,y:1500},radius:500},
    {id:'left',kind:'line',layerId:'wall',
      start:{x:2150,y:900},end:{x:2150,y:2100}},
    {id:'right',kind:'line',layerId:'wall',
      start:{x:2650,y:900},end:{x:2650,y:2100}},
  ])
  await page.goto('/')
  const left=await canvasWorld(page,2150,1500)
  const right=await canvasWorld(page,2650,1500)
  await page.keyboard.down('Shift')
  await page.mouse.click(left.x,left.y)
  await page.mouse.click(right.x,right.y)
  await page.keyboard.up('Shift')
  await sendCommand(page,'TR')
  await expect(page.locator('.canvas-guide')).toContainText('TRIM')
  const top=await canvasWorld(page,2400,2000)
  await page.mouse.click(top.x,top.y)
  await expect.poll(async()=> (await saved(page)).entities[0].kind).toBe('arc')
  expect((await saved(page)).entities[0]).toMatchObject({
    id:'circle',kind:'arc',radius:500,startAngle:120,endAngle:60
  })
  const pending=page.waitForEvent('download')
  await page.getByRole('button',{name:/匯出 DXF/}).click()
  const download=await pending
  const text=await readFile(await download.path()!,'utf8')
  expect(text).toContain('0\r\nARC\r\n')
  expect(text).toContain('40\r\n500\r\n')
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await expect.poll(async()=> (await saved(page)).entities[0].kind).toBe('circle')
  // The DXF we just downloaded must open again through the real file chooser.
  page.once('dialog',dialog=>{void dialog.accept()})
  await page.locator('input[type="file"]').setInputFiles({
    name:'roundtrip.dxf',mimeType:'application/dxf',
    buffer:Buffer.from(text,'utf8')
  })
  await expect.poll(async()=> (await saved(page) as {name:string}).name).toBe('roundtrip')
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'arc',radius:500,startAngle:120,endAngle:60
  })
})
test('ARC created from three command points survives JSON storage and SVG plot UI',async({page})=>{
  await page.goto('/')
  await sendCommand(page,'A')
  await sendCommand(page,'100,0')
  await sendCommand(page,'0,100')
  await sendCommand(page,'-100,0')
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'arc',center:{x:0,y:0},radius:100,startAngle:0,endAngle:180
  })
  await page.getByRole('button',{name:/比例出圖/}).first().click()
  await expect(page.locator('body')).toContainText('A3')
})


test('v1.1.0 accepts Space as CAD confirmation and exact explicit centimetres',async({page})=>{
  await page.goto('/')
  await expect(page.locator('.menu-bar')).toContainText('v1.3.0')
  const input=page.getByRole('textbox',{name:'CAD 指令輸入'})
  await input.fill('L')
  await input.press('Space')
  await input.fill('0,0')
  await input.press('Space')
  await input.fill('12.34cm,0cm')
  await input.press('Space')
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'line',start:{x:0,y:0},end:{x:123.4,y:0}
  })
})
test('v1.1.0 saves custom command aliases and default cm input across reload',async({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'鍵盤與單位設定'}).click()
  const dialog=page.getByRole('dialog',{name:'CAD 鍵盤與單位設定'})
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox',{name:'指令確認鍵'}).selectOption('space')
  await dialog.getByRole('combobox',{name:'尺寸輸入單位'}).selectOption('cm')
  await dialog.getByRole('textbox',{name:'自訂指令 line',exact:true}).fill('Q')
  await dialog.getByRole('button',{name:'儲存設定'}).click()
  await expect(dialog).not.toBeVisible()
  const input=page.getByRole('textbox',{name:'CAD 指令輸入'})
  await input.fill('Q');await input.press('Space')
  await input.fill('0,0');await input.press('Space')
  await input.fill('125.5,0');await input.press('Space')
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'line',end:{x:1255,y:0}
  })
  await page.reload()
  await expect(page.locator('.unit-tag')).toContainText('公分 cm')
  await page.getByRole('button',{name:'鍵盤與單位設定'}).click()
  await expect(page.getByRole('dialog',{name:'CAD 鍵盤與單位設定'})
    .getByRole('textbox',{name:'自訂指令 line',exact:true})).toHaveValue('Q')
})
test('v1.1.0 prevents duplicate command keys and preserves spaces in CAD text annotations',async({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'鍵盤與單位設定'}).click()
  const dialog=page.getByRole('dialog',{name:'CAD 鍵盤與單位設定'})
  await dialog.getByRole('textbox',{name:'自訂指令 line',exact:true}).fill('TR')
  await dialog.getByRole('button',{name:'儲存設定'}).click()
  await expect(dialog.getByRole('alert')).toContainText('已被其他 CAD 指令使用')
  await dialog.getByRole('button',{name:'取消'}).click()
  const input=page.getByRole('textbox',{name:'CAD 指令輸入'})
  await input.fill('T');await input.press('Space')
  await input.fill('客廳 A')
  await input.press('Space')
  await expect(input).toHaveValue('客廳 A ')
  await input.press('Enter')
  await expect(page.locator('.console-history')).toContainText('文字插入點')
  await input.fill('30cm,20cm');await input.press('Space')
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'text',position:{x:300,y:200},text:'客廳 A '
  })
})
test('v1.1.0 preserves browser/system chords and native editing of ordinary inputs',async({page})=>{
  await page.goto('/')
  const title=page.getByRole('textbox',{name:'圖面名稱'})
  await title.fill('鍵盤回歸')
  await title.press('ControlOrMeta+A')
  await title.press('Backspace')
  await title.fill('保留瀏覽器功能')
  await expect(title).toHaveValue('保留瀏覽器功能')
  const intercepted=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas.cad-canvas')!
    const keys=['p','l','s','t','w','r','f']
    return keys.map(key=>{
      const evt=new KeyboardEvent('keydown',{
        key,ctrlKey:true,bubbles:true,cancelable:true
      })
      canvas.dispatchEvent(evt)
      return {key,canceled:evt.defaultPrevented}
    })
  })
  expect(intercepted).toEqual(['p','l','s','t','w','r','f']
    .map(key=>({key,canceled:false})))
  // Plain Space on a focused button is not interpreted as a CAD command.
  await page.getByRole('button',{name:'鍵盤與單位設定'}).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog',{name:'CAD 鍵盤與單位設定'})).toBeVisible()
})

test('v1.2.0 accepts dynamic distance<angle in cm and preserves Undo',async({page})=>{
  await page.goto('/')
  await sendCommand(page,'L')
  await sendCommand(page,'0,0')
  await sendCommand(page,'350cm<90')
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'line',start:{x:0,y:0},end:{x:0,y:3500}
  })
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await waitEntities(page,0)
})
test('v1.2.0 exact inspector changes 400 mm line to 350 cm, one Undo step',async({page})=>{
  await seed(page,[{id:'test-line',kind:'line',layerId:'wall',
    start:{x:2200,y:1500},end:{x:2600,y:1500}}])
  await page.goto('/')
  const midpoint=await canvasWorld(page,2400,1500)
  await page.mouse.click(midpoint.x,midpoint.y)
  const exact=page.getByRole('textbox',{name:'精確線段長度'})
  await expect(exact).toBeVisible()
  await exact.fill('350cm')
  await exact.press('Enter')
  await expect.poll(async()=>((await saved(page)).entities[0].end as {x:number}).x).toBe(5700)
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await expect.poll(async()=>((await saved(page)).entities[0].end as {x:number}).x).toBe(2600)
})
test('v1.2.0 grip drag edits only the picked endpoint and supports undo',async({page})=>{
  await seed(page,[{id:'grip-line',kind:'line',layerId:'wall',
    start:{x:2200,y:1500},end:{x:2600,y:1500}}])
  await page.goto('/')
  const mid=await canvasWorld(page,2400,1500)
  await page.mouse.click(mid.x,mid.y)
  await expect(page.getByRole('textbox',{name:'精確線段長度'})).toBeVisible()
  const from=await canvasWorld(page,2600,1500)
  const to=await canvasWorld(page,2700,1500)
  await page.mouse.move(from.x,from.y)
  await page.mouse.down()
  await page.mouse.move(to.x,to.y,{steps:12})
  await page.mouse.up()
  await expect.poll(async()=>((await saved(page)).entities[0].end as {x:number}).x)
    .toBeGreaterThanOrEqual(2699)
  expect((await saved(page)).entities[0]).toMatchObject({start:{x:2200,y:1500}})
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await expect.poll(async()=>((await saved(page)).entities[0].end as {x:number}).x).toBe(2600)
})


test('v1.3.0 editable cursor-side HUD draws a precise centimeter-angle line',async({page})=>{
  await page.goto('/')
  await sendCommand(page,'L')
  await sendCommand(page,'0,0')
  const length=page.getByRole('textbox',{name:'動態長度'})
  const angle=page.getByRole('textbox',{name:'動態角度'})
  await expect(length).toBeVisible()
  await length.fill('350cm')
  await angle.fill('90')
  await page.getByRole('button',{name:'套用動態尺寸'}).click()
  await waitEntities(page,1)
  expect((await saved(page)).entities[0]).toMatchObject({
    kind:'line',start:{x:0,y:0},end:{x:0,y:3500}
  })
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await waitEntities(page,0)
})
test('v1.3.0 circle radius annotation is a native JSON entity and undoable',async({page})=>{
  await seed(page,[{id:'source-circle',kind:'circle',layerId:'wall',
    center:{x:2400,y:1500},radius:500}])
  await page.goto('/')
  const point=await canvasWorld(page,2900,1500)
  await page.mouse.click(point.x,point.y)
  await sendCommand(page,'DRA')
  const input=page.getByRole('textbox',{name:'CAD 指令輸入'})
  await expect(input).toHaveAttribute('placeholder',/曲線標註/)
  await sendCommand(page,'2950,2100')
  await waitEntities(page,2)
  expect((await saved(page)).entities[1]).toMatchObject({
    kind:'curveDimension',measure:'radius',radius:500,center:{x:2400,y:1500},
    placement:{x:2950,y:2100}
  })
  await expect(page.locator('.info-block')).toContainText('R500')
  await page.locator('button[title="復原 Ctrl+Z"]').click()
  await waitEntities(page,1)
})
test('v1.3.0 ARC length and angular commands create calculated snapshot labels',async({page})=>{
  await seed(page,[{id:'source-arc',kind:'arc',layerId:'wall',
    center:{x:2400,y:1500},radius:500,startAngle:0,endAngle:180}])
  await page.goto('/')
  const top=await canvasWorld(page,2400,2000)
  await page.mouse.click(top.x,top.y)
  await sendCommand(page,'DAR')
  await sendCommand(page,'2400,2300')
  await waitEntities(page,2)
  expect((await saved(page)).entities[1]).toMatchObject({
    kind:'curveDimension',measure:'arcLength',radius:500
  })
  await expect(page.locator('.info-block')).toContainText('⌒1571')
  const arcNear=await canvasWorld(page,2675,1918.33)
  await page.mouse.click(arcNear.x,arcNear.y)
  await sendCommand(page,'DAN')
  await sendCommand(page,'2400,2600')
  await waitEntities(page,3)
  expect((await saved(page)).entities[2]).toMatchObject({
    kind:'curveDimension',measure:'angle',radius:500,
    startAngle:0,endAngle:180
  })
  await expect(page.locator('.info-block')).toContainText('180°')
})
