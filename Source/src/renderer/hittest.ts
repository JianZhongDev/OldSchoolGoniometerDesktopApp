import type { GoniometerState } from '../shared/types'
import { angleToPoint } from './geometry'

export type Handle = 'fulcrum' | 'armStationary' | 'armMoving' | 'dial' | null

// Hit radii (PRD §5.2 / §7.3). Visual radii are smaller; these are the
// generous grab regions.
export const FULCRUM_HIT = 12
export const ARM_HIT = 14

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

/**
 * Return which interactive part of the goniometer is under (mx,my), or null.
 * Order matters: handles win over the dial face; the infinite guide rays are
 * deliberately NOT hit-testable (PRD §7.3). The angle readout is no longer part
 * of the SVG — it lives in the HTML control panel — so it isn't hit-tested here.
 */
export function hitTest(state: GoniometerState, mx: number, my: number): Handle {
  const { cx, cy, radius, angleStationary, angleMoving } = state

  const dx = mx - cx
  const dy = my - cy
  const dist = Math.hypot(dx, dy)

  if (dist <= FULCRUM_HIT) return 'fulcrum'

  const hS = angleToPoint(cx, cy, angleStationary, radius)
  if (Math.hypot(mx - hS.x, my - hS.y) <= ARM_HIT) return 'armStationary'

  const hM = angleToPoint(cx, cy, angleMoving, radius)
  if (Math.hypot(mx - hM.x, my - hM.y) <= ARM_HIT) return 'armMoving'

  if (dist <= radius) return 'dial'

  return null
}
