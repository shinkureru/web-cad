import { describe, expect, it } from 'vitest'
import { wallOutline } from './walls'
import { distance } from './geometry'
describe('wall segment outlines in mm', () => {
  it('produces a closed 120 mm wall from a 3000 mm centerline', () => {
    const pts = wallOutline({x:0,y:0},{x:3000,y:0},120)
    expect(pts).toEqual([{x:0,y:60},{x:3000,y:60},{x:3000,y:-60},{x:0,y:-60},{x:0,y:60}])
    expect(distance(pts[0],pts[1])).toBe(3000)
    expect(distance(pts[1],pts[2])).toBe(120)
  })
  it('works with vertical and diagonal centerlines', () => {
    const a=wallOutline({x:-100,y:-200},{x:-100,y:800},100)
    expect(a[0]).toEqual({x:-150,y:-200})
    const b=wallOutline({x:0,y:0},{x:1000,y:1000},100)
    expect(distance(b[0],b[3])).toBeCloseTo(100,1)
  })
  it('rejects zero-length and invalid thickness', () => {
    expect(()=>wallOutline({x:0,y:0},{x:0,y:0},120)).toThrow()
    expect(()=>wallOutline({x:0,y:0},{x:10,y:0},-1)).toThrow()
    expect(()=>wallOutline({x:0,y:0},{x:10,y:0},Number.NaN)).toThrow()
  })
})
