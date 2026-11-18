import { parseLengthInput, type InputUnit } from './commands'
import {roundPoint} from './geometry'
import type {Point} from './types'

/** Model-space target for the editable cursor-side distance and angle inputs.
 * No document mutation; the caller uses the normal onPoint drawing path.
 */
export function resolveDynamicTarget(
  base:Point,hover:Point,lengthText:string,angleText:string,unit:InputUnit
):Point|null{
  const length=parseLengthInput(lengthText,unit)
  if(length===null||length<=0||length>1e9)return null
  const angle=angleText.trim()===''
    ?Math.atan2(hover.y-base.y,hover.x-base.x)*180/Math.PI
    :Number(angleText.trim())
  if(!Number.isFinite(angle)||Math.abs(angle)>1e6)return null
  const radians=angle*Math.PI/180
  const x=base.x+length*Math.cos(radians),y=base.y+length*Math.sin(radians)
  if(!Number.isFinite(x)||!Number.isFinite(y)||
     Math.abs(x)>1e9||Math.abs(y)>1e9)return null
  const p=roundPoint({x,y})
  if(Math.hypot(p.x-base.x,p.y-base.y)<.001)return null
  return p
}
