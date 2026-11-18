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
  const box=await page.getByRole('img',{name:'CAD 繪圖畫布'}).boundingBox()
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
  await expect(page.locator('.menu-bar')).toContainText('v1.0.0')
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
  await expect(page.locator('.menu-bar')).toContainText('v1.0.0')
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
