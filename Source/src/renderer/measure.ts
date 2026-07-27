import type { GoniometerState } from '../shared/types'
import { MM_PER_INCH } from '../shared/types'
import { pointToAngle, angleToPoint, projectOntoArm } from './geometry'
import { RULER_HALF_W } from './goniometer'

/**
 * Direct measurement tool (toggled by `state.measureMode`). While active,
 * click-drag on the goniometer measures instead of manipulating it:
 *   - drag along a ruler edge      -> linear distance along that ruler
 *   - drag on the protractor face  -> swept angle (a highlighted sector)
 *   - drag from the centre outward -> radial distance to the centre
 * Near the centre (where rulers + dial overlap) the type is resolved by the
 * drag's endpoint: if it lands along a ruler, measure along it; else radial.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

// Zone thresholds.
const CENTER_R = 20 // "close to the centre" radius, px
const RULER_BAND = RULER_HALF_W // perpendicular band that counts as "on a ruler"

// A drag must exceed these to be kept on release (avoids stray taps).
const MIN_DRAG_PX = 4
const MIN_DRAG_DEG = 1

// Amber highlighter look, distinct from the red/blue arms.
const HL_FILL = 'rgba(255,193,7,0.25)'
const HL_STROKE = 'rgba(245,158,11,0.95)'

export type MeasureStart =
  | { kind: 'center' }
  | { kind: 'ruler'; arm: 'S' | 'M'; startT: number }
  | { kind: 'angle'; startAngle: number; r: number }

export type LiveMeasure =
  | { kind: 'ruler'; arm: 'S' | 'M'; t0: number; t1: number; px: number }
  | { kind: 'radial'; dist: number; ex: number; ey: number }
  | { kind: 'angle'; startAngle: number; endAngle: number; r: number; sweep: number }

function armAngle(state: GoniometerState, arm: 'S' | 'M'): number {
  return arm === 'S' ? state.angleStationary : state.angleMoving
}

/** Nearest arm to (mx,my) within the ruler band and in front of the fulcrum. */
function nearestArm(
  state: GoniometerState,
  mx: number,
  my: number
): { arm: 'S' | 'M'; t: number } | null {
  const s = projectOntoArm(state.cx, state.cy, state.angleStationary, mx, my)
  const m = projectOntoArm(state.cx, state.cy, state.angleMoving, mx, my)
  const cand: Array<{ arm: 'S' | 'M'; t: number; perp: number }> = []
  if (s.perp <= RULER_BAND && s.t > 0) cand.push({ arm: 'S', t: s.t, perp: s.perp })
  if (m.perp <= RULER_BAND && m.t > 0) cand.push({ arm: 'M', t: m.t, perp: m.perp })
  if (cand.length === 0) return null
  cand.sort((a, b) => a.perp - b.perp)
  return { arm: cand[0].arm, t: cand[0].t }
}

/** Decide what a measurement started at (mx,my) will be, or null if off-target. */
export function classifyStart(state: GoniometerState, mx: number, my: number): MeasureStart | null {
  const d = Math.hypot(mx - state.cx, my - state.cy)
  if (d <= CENTER_R) return { kind: 'center' }

  const arm = nearestArm(state, mx, my)
  if (arm) return { kind: 'ruler', arm: arm.arm, startT: arm.t }

  if (d <= state.radius) {
    return { kind: 'angle', startAngle: pointToAngle(state.cx, state.cy, mx, my), r: d }
  }
  return null
}

/** Difference a1 − a0 wrapped into (−180, 180]. */
function signedDelta(a0: number, a1: number): number {
  let d = (a1 - a0) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/** Compute the live measurement geometry from a start + current cursor. */
export function resolve(
  state: GoniometerState,
  start: MeasureStart,
  mx: number,
  my: number
): LiveMeasure {
  if (start.kind === 'ruler') {
    const { t } = projectOntoArm(state.cx, state.cy, armAngle(state, start.arm), mx, my)
    return { kind: 'ruler', arm: start.arm, t0: start.startT, t1: t, px: Math.abs(t - start.startT) }
  }
  if (start.kind === 'angle') {
    const endAngle = pointToAngle(state.cx, state.cy, mx, my)
    return {
      kind: 'angle',
      startAngle: start.startAngle,
      endAngle,
      r: start.r,
      sweep: Math.abs(signedDelta(start.startAngle, endAngle))
    }
  }
  // center: snap to a ruler if the endpoint lands on one, else radial (rule 4).
  const arm = nearestArm(state, mx, my)
  if (arm) return { kind: 'ruler', arm: arm.arm, t0: 0, t1: arm.t, px: Math.abs(arm.t) }
  return { kind: 'radial', dist: Math.hypot(mx - state.cx, my - state.cy), ex: mx, ey: my }
}

/** Whether a completed drag is large enough to keep. */
export function isSignificant(m: LiveMeasure): boolean {
  if (m.kind === 'angle') return m.sweep >= MIN_DRAG_DEG
  if (m.kind === 'radial') return m.dist >= MIN_DRAG_PX
  return m.px >= MIN_DRAG_PX
}

/** Format a pixel length in the unit implied by the display mode. */
export function formatLength(px: number, mode: GoniometerState['displayMode'], effPxPerInch: number): string {
  if (mode === 'rulerMetric') {
    const mm = px / (effPxPerInch / MM_PER_INCH)
    return `${(mm / 10).toFixed(2)} cm`
  }
  if (mode === 'rulerImperial') {
    return `${(px / effPxPerInch).toFixed(2)} in`
  }
  return `${Math.round(px)} px`
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

function addLabel(group: SVGGElement, x: number, y: number, text: string, dark: boolean): void {
  const w = text.length * 7.3 + 14
  const h = 20
  group.appendChild(
    el('rect', {
      x: x - w / 2,
      y: y - h / 2,
      width: w,
      height: h,
      rx: 5,
      ry: 5,
      fill: dark ? 'rgba(32,33,36,0.92)' : 'rgba(255,255,255,0.94)',
      stroke: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.28)',
      'stroke-width': 1
    })
  )
  const t = el('text', {
    x,
    y,
    'font-family': 'ui-monospace, Menlo, Consolas, monospace',
    'font-size': 12,
    'font-weight': 700,
    fill: dark ? '#e8eaed' : '#202124',
    'text-anchor': 'middle',
    'dominant-baseline': 'central'
  })
  t.textContent = text
  group.appendChild(t)
}

export function clearMeasure(group: SVGGElement): void {
  group.replaceChildren()
}

/** Draw the given measurement (highlight + value badge) into `group`. */
export function renderMeasure(
  group: SVGGElement,
  state: GoniometerState,
  m: LiveMeasure,
  effPxPerInch: number,
  dark: boolean
): void {
  group.replaceChildren()
  const { cx, cy } = state

  if (m.kind === 'ruler') {
    const A = (armAngle(state, m.arm) * Math.PI) / 180
    const ux = Math.cos(A)
    const uy = -Math.sin(A)
    const nx = -uy // unit normal
    const ny = ux
    const H = RULER_HALF_W
    const corner = (t: number, s: number): string =>
      `${cx + t * ux + s * H * nx},${cy + t * uy + s * H * ny}`
    group.appendChild(
      el('polygon', {
        points: `${corner(m.t0, 1)} ${corner(m.t1, 1)} ${corner(m.t1, -1)} ${corner(m.t0, -1)}`,
        fill: HL_FILL,
        stroke: HL_STROKE,
        'stroke-width': 1.5
      })
    )
    const tMid = (m.t0 + m.t1) / 2
    const lx = cx + tMid * ux + (H + 16) * nx
    const ly = cy + tMid * uy + (H + 16) * ny
    addLabel(group, lx, ly, formatLength(m.px, state.displayMode, effPxPerInch), dark)
    return
  }

  if (m.kind === 'radial') {
    group.appendChild(
      el('circle', { cx, cy, r: m.dist, fill: HL_FILL, stroke: HL_STROKE, 'stroke-width': 1.5 })
    )
    group.appendChild(
      el('line', { x1: cx, y1: cy, x2: m.ex, y2: m.ey, stroke: HL_STROKE, 'stroke-width': 1.5 })
    )
    const lx = cx + (m.ex - cx) * 0.5
    const ly = cy + (m.ey - cy) * 0.5 - 14
    addLabel(group, lx, ly, formatLength(m.dist, state.displayMode, effPxPerInch), dark)
    return
  }

  // angle sector
  const delta = signedDelta(m.startAngle, m.endAngle)
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / 4))
  let points = `${cx},${cy}`
  for (let i = 0; i <= steps; i++) {
    const a = m.startAngle + (delta * i) / steps
    const p = angleToPoint(cx, cy, a, m.r)
    points += ` ${p.x},${p.y}`
  }
  group.appendChild(el('polygon', { points, fill: HL_FILL, stroke: HL_STROKE, 'stroke-width': 1.5 }))
  const mid = angleToPoint(cx, cy, m.startAngle + delta / 2, m.r + 18)
  addLabel(group, mid.x, mid.y, `${m.sweep.toFixed(1)}°`, dark)
}
