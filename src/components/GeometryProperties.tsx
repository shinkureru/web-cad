import { useEffect, useState } from 'react'
import type { CadEntity } from '../cad/types'
import { unitToMm } from '../cad/commands'
import type {InputUnit} from '../cad/commands'
import type { GeometryField } from '../cad/grips'
import {distance} from '../cad/geometry'

type EditorField = {id:GeometryField;label:string;value:number;angle?:boolean}
interface Props{
  entity:CadEntity;unit:InputUnit;disabled:boolean;
  onCommit:(field:GeometryField,raw:string,angle:boolean)=>void
}
function EditableField({field,unit,disabled,onCommit}:{
  field:EditorField;unit:InputUnit;disabled:boolean;
  onCommit:(field:GeometryField,raw:string,angle:boolean)=>void
}){
  const display=(v:number)=>String(Number((v/(field.angle?1:unitToMm(unit))).toFixed(3)))
  const [draft,setDraft]=useState(()=>display(field.value))
  useEffect(()=>{setDraft(display(field.value))},[field.value,field.angle,unit])
  function commit(){
    if(draft.trim()!==display(field.value))onCommit(field.id,draft,!!field.angle)
    else setDraft(display(field.value))
  }
  return <label className="precision-input-row">
    <span>{field.label}<small>{field.angle?'°':unit}</small></span>
    <input type="text" inputMode="decimal" disabled={disabled}
      aria-label={'精確'+field.label} value={draft} onChange={e=>setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e=>{
        if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}
        if(e.key==='Escape'){e.stopPropagation();setDraft(display(field.value));e.currentTarget.blur()}
      }} />
  </label>
}
export default function GeometryProperties({entity,unit,disabled,onCommit}:Props){
  const fields:EditorField[]=[]
  if(entity.kind==='line'){
    const d=distance(entity.start,entity.end)
    const angle=Math.atan2(entity.end.y-entity.start.y,entity.end.x-entity.start.x)*180/Math.PI
    fields.push(
      {id:'startX',label:'起點 X',value:entity.start.x},
      {id:'startY',label:'起點 Y',value:entity.start.y},
      {id:'endX',label:'終點 X',value:entity.end.x},
      {id:'endY',label:'終點 Y',value:entity.end.y},
      {id:'length',label:'線段長度',value:d},
      {id:'angle',label:'線段角度',value:angle,angle:true}
    )
  }else if(entity.kind==='rectangle'){
    fields.push(
      {id:'startX',label:'第一角 X',value:entity.start.x},
      {id:'startY',label:'第一角 Y',value:entity.start.y},
      {id:'endX',label:'對角 X',value:entity.end.x},
      {id:'endY',label:'對角 Y',value:entity.end.y},
      {id:'width',label:'矩形寬度',value:Math.abs(entity.end.x-entity.start.x)},
      {id:'height',label:'矩形高度',value:Math.abs(entity.end.y-entity.start.y)}
    )
  }else if(entity.kind==='circle'||entity.kind==='arc'){
    fields.push(
      {id:'centerX',label:'圓心 X',value:entity.center.x},
      {id:'centerY',label:'圓心 Y',value:entity.center.y},
      {id:'radius',label:'半徑',value:entity.radius}
    )
  }else if(entity.kind==='text'||entity.kind==='insert'){
    fields.push(
      {id:'positionX',label:'插入點 X',value:entity.position.x},
      {id:'positionY',label:'插入點 Y',value:entity.position.y}
    )
  }
  if(!fields.length)return null
  return <section className="precision-properties" aria-label="精確幾何屬性">
    <div className="precision-properties-heading">精確幾何編輯 <small>模型 mm</small></div>
    <p>可以輸入 {unit==='cm'?'cm 或 mm':'mm 或 cm'}；按 Enter 或移開焦點套用，單次修改可復原。</p>
    <div className="precision-properties-grid">
      {fields.map(field=><EditableField key={entity.id+field.id} field={field}
        unit={unit} disabled={disabled} onCommit={onCommit}/>)}
    </div>
    {(entity.kind==='line'||entity.kind==='polyline'||entity.kind==='rectangle'||
      entity.kind==='arc'||entity.kind==='circle')&&
      <p>選取圖形後，還可在畫布拖曳藍色夾點直接調整；鎖定圖層不允許修改。</p>}
  </section>
}
