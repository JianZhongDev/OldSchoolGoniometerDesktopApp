import type { GoniometerState } from '../shared/types'
import { MM_PER_INCH } from '../shared/types'
import { angleToPoint, angleBetween, rayToEdge, roundTo } from './geometry'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Colors / dimensions (PRD §5.2). The goniometer graphics (dial, ticks, arms,
// rulers) keep a fixed black-on-white-underlay scheme because they sit over
// UNKNOWN application content — they must read on any background, so they do NOT
// follow the OS light/dark theme. Only the HTML chrome panel (readout + buttons
// + popover) follows the theme, via CSS.
const COL_DIAL_FILL = 'rgba(255,255,255,0.14)'
const COL_DIAL_BORDER = 'rgba(0,0,0,0.35)'
const COL_MINOR = 'rgba(0,0,0,0.30)'
const COL_MEDIUM = 'rgba(0,0,0,0.50)'
const COL_MAJOR = 'rgba(0,0,0,0.75)'
const COL_LABEL = 'rgba(0,0,0,0.8)'
const COL_FULCRUM = '#5f6368'
const COL_STATIONARY = '#1a73e8'
const COL_MOVING = '#d93025'
const COL_UNDERLAY = 'rgba(255,255,255,0.6)'

const LEN_MINOR = 5
const LEN_MEDIUM = 9
const LEN_MAJOR = 14
const FULCRUM_VIS_R = 6
const ARM_VIS_R = 7
const UNDERLAY_W = 3

// Ruler geometry.
export const RULER_HALF_W = 18 // half the strip width, px
const RULER_TICK_MINOR = 5
const RULER_TICK_MEDIUM = 9
const RULER_TICK_MAJOR = 15
const RULER_LABEL_LY = -2 // local y of graduation numbers (just above the axis)
const RULER_UNIT_LY = -9 // local y of the cm/in unit tag
// Hard ceiling on graduations per ruler. A pathologically small calibration
// (or a degenerate 0 scale, which makes the natural count Infinity) would
// otherwise build a runaway number of SVG nodes and hang/crash the renderer.
const MAX_RULER_GRADS = 6000

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

/** One ruler graduation label: distance `d` along the arm (px) + local y offset. */
interface LabelDatum {
  d: number
  ly: number
  text: string
}

/** All the mutable element references we update each frame. */
export interface Refs {
  svg: SVGSVGElement
  // Guide rays (absolute window coords) — used in 'lines' mode.
  rayStatUnder: SVGLineElement
  rayStat: SVGLineElement
  rayMovUnder: SVGLineElement
  rayMov: SVGLineElement
  // Ruler strip + ticks (rotated via transform); labels are a separate,
  // screen-oriented group so the numbers stay upright at every arm angle.
  rulerStat: SVGGElement
  rulerMov: SVGGElement
  rulerStatLabels: SVGGElement
  rulerMovLabels: SVGGElement
  // Goniometer group (translated to the fulcrum).
  gonio: SVGGElement
  dial: SVGCircleElement
  ticks: SVGGElement
  labels: SVGGElement
  armStatUnder: SVGLineElement
  armStat: SVGLineElement
  armMovUnder: SVGLineElement
  armMov: SVGLineElement
  fulcrum: SVGCircleElement
  handleStat: SVGCircleElement
  handleMov: SVGCircleElement
  // Transient measurement overlay (drawn on top), owned by measure.ts.
  measureLayer: SVGGElement
}

export function createGoniometer(mount: HTMLElement): Refs {
  const svg = el('svg', { width: '100%', height: '100%' })
  svg.style.position = 'absolute'
  svg.style.inset = '0'
  svg.style.overflow = 'visible'

  // --- guide rays (drawn first, behind everything) ---
  const rayStatUnder = el('line', { stroke: COL_UNDERLAY, 'stroke-width': UNDERLAY_W })
  const rayStat = el('line', { stroke: COL_STATIONARY, 'stroke-width': 1.5, 'stroke-opacity': 0.6 })
  const rayMovUnder = el('line', { stroke: COL_UNDERLAY, 'stroke-width': UNDERLAY_W })
  const rayMov = el('line', { stroke: COL_MOVING, 'stroke-width': 1.5, 'stroke-opacity': 0.6 })
  svg.append(rayStatUnder, rayMovUnder, rayStat, rayMov)

  // --- ruler strip/ticks (rotated) + upright label layers (screen space) ---
  const rulerStat = el('g')
  const rulerMov = el('g')
  const rulerStatLabels = el('g')
  const rulerMovLabels = el('g')
  svg.append(rulerStat, rulerMov, rulerStatLabels, rulerMovLabels)

  // --- goniometer group (fulcrum-local coordinates) ---
  const gonio = el('g')
  const dial = el('circle', {
    cx: 0,
    cy: 0,
    fill: COL_DIAL_FILL,
    stroke: COL_DIAL_BORDER,
    'stroke-width': 1
  })
  const ticks = el('g')
  const labels = el('g')

  const armStatUnder = el('line', { stroke: COL_UNDERLAY, 'stroke-width': UNDERLAY_W, 'stroke-linecap': 'round' })
  const armStat = el('line', { stroke: COL_STATIONARY, 'stroke-width': 1.5, 'stroke-linecap': 'round' })
  const armMovUnder = el('line', { stroke: COL_UNDERLAY, 'stroke-width': UNDERLAY_W, 'stroke-linecap': 'round' })
  const armMov = el('line', { stroke: COL_MOVING, 'stroke-width': 1.5, 'stroke-linecap': 'round' })

  const fulcrum = el('circle', { cx: 0, cy: 0, r: FULCRUM_VIS_R, fill: COL_FULCRUM, stroke: COL_UNDERLAY, 'stroke-width': 2 })
  const handleStat = el('circle', { r: ARM_VIS_R, fill: COL_STATIONARY, stroke: COL_UNDERLAY, 'stroke-width': 2 })
  const handleMov = el('circle', { r: ARM_VIS_R, fill: COL_MOVING, stroke: COL_UNDERLAY, 'stroke-width': 2 })

  gonio.append(dial, ticks, labels, armStatUnder, armStat, armMovUnder, armMov, fulcrum, handleStat, handleMov)
  svg.append(gonio)

  // Measurement overlay sits on top of everything.
  const measureLayer = el('g')
  svg.append(measureLayer)

  mount.appendChild(svg)

  return {
    svg,
    rayStatUnder,
    rayStat,
    rayMovUnder,
    rayMov,
    rulerStat,
    rulerMov,
    rulerStatLabels,
    rulerMovLabels,
    gonio,
    dial,
    ticks,
    labels,
    armStatUnder,
    armStat,
    armMovUnder,
    armMov,
    fulcrum,
    handleStat,
    handleMov,
    measureLayer
  }
}

/** Rebuild tick marks + labels for a given radius (only when radius changes). */
function rebuildTicks(refs: Refs, radius: number): void {
  refs.ticks.replaceChildren()
  refs.labels.replaceChildren()

  for (let deg = 0; deg < 360; deg++) {
    let len: number
    let color: string
    let width: number
    if (deg % 10 === 0) {
      len = LEN_MAJOR
      color = COL_MAJOR
      width = 1.5
    } else if (deg % 5 === 0) {
      len = LEN_MEDIUM
      color = COL_MEDIUM
      width = 1
    } else {
      len = LEN_MINOR
      color = COL_MINOR
      width = 1
    }
    const outer = angleToPoint(0, 0, deg, radius)
    const inner = angleToPoint(0, 0, deg, radius - len)
    refs.ticks.appendChild(
      el('line', { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, stroke: color, 'stroke-width': width })
    )

    if (deg % 10 === 0) {
      const p = angleToPoint(0, 0, deg, radius - LEN_MAJOR - 8)
      const t = el('text', {
        x: p.x,
        y: p.y,
        'font-family': 'system-ui, -apple-system, sans-serif',
        'font-size': 10,
        fill: COL_LABEL,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'paint-order': 'stroke',
        stroke: COL_UNDERLAY,
        'stroke-width': 2
      })
      t.textContent = String(deg)
      refs.labels.appendChild(t)
    }
  }
}

/**
 * Build a graduated ruler's strip + tick marks in LOCAL coordinates: +x runs
 * along the arm from the fulcrum (0) outward. The caller rotates it with
 * `translate(cx,cy) rotate(-angle)`. Ticks are perpendicular short lines (no
 * "up"), so they read at any rotation. Number labels are NOT built here — they
 * are returned as data and drawn upright in screen space (see positionLabels),
 * so they never appear upside down. Graduations reflect real dimensions via
 * `pxPerInch`.
 */
function buildRuler(
  g: SVGGElement,
  mode: 'rulerMetric' | 'rulerImperial' | 'rulerPixels',
  pxPerInch: number,
  maxLen: number,
  armColor: string
): LabelDatum[] {
  g.replaceChildren()
  const bottom = RULER_HALF_W

  g.appendChild(
    el('rect', {
      x: 0,
      y: -RULER_HALF_W,
      width: maxLen,
      height: RULER_HALF_W * 2,
      fill: 'rgba(255,255,255,0.5)',
      stroke: armColor,
      'stroke-opacity': 0.55,
      'stroke-width': 1
    })
  )
  g.appendChild(el('line', { x1: 0, y1: 0, x2: maxLen, y2: 0, stroke: COL_UNDERLAY, 'stroke-width': UNDERLAY_W }))
  g.appendChild(el('line', { x1: 0, y1: 0, x2: maxLen, y2: 0, stroke: armColor, 'stroke-width': 1.2 }))

  const addTick = (x: number, len: number, color: string, width: number): void => {
    g.appendChild(el('line', { x1: x, y1: bottom, x2: x, y2: bottom - len, stroke: color, 'stroke-width': width }))
  }

  const data: LabelDatum[] = []

  if (mode === 'rulerMetric') {
    const pxPerMm = pxPerInch / MM_PER_INCH
    // Guard against a non-positive scale (would make the count Infinity) and cap
    // the total so a tiny calibration can never build a runaway DOM.
    const maxMm = pxPerMm > 0 ? Math.min(Math.floor(maxLen / pxPerMm), MAX_RULER_GRADS) : 0
    for (let mm = 0; mm <= maxMm; mm++) {
      const x = mm * pxPerMm
      if (mm % 10 === 0) {
        addTick(x, RULER_TICK_MAJOR, COL_MAJOR, 1.5)
        data.push({ d: x, ly: RULER_LABEL_LY, text: String(mm / 10) }) // cm number
      } else if (mm % 5 === 0) {
        addTick(x, RULER_TICK_MEDIUM, COL_MEDIUM, 1)
      } else {
        addTick(x, RULER_TICK_MINOR, COL_MINOR, 1)
      }
    }
    data.push({ d: 2, ly: RULER_UNIT_LY, text: 'cm' })
  } else if (mode === 'rulerPixels') {
    // Graduate directly in screen pixels: minor 10, medium 50, major 100.
    for (let px = 0; px <= maxLen; px += 10) {
      if (px % 100 === 0) {
        addTick(px, RULER_TICK_MAJOR, COL_MAJOR, 1.5)
        data.push({ d: px, ly: RULER_LABEL_LY, text: String(px) })
      } else if (px % 50 === 0) {
        addTick(px, RULER_TICK_MEDIUM, COL_MEDIUM, 1)
      } else {
        addTick(px, RULER_TICK_MINOR, COL_MINOR, 1)
      }
    }
    data.push({ d: 2, ly: RULER_UNIT_LY, text: 'px' })
  } else {
    const pxPerSixteenth = pxPerInch / 16
    const maxJ = pxPerSixteenth > 0 ? Math.min(Math.floor(maxLen / pxPerSixteenth), MAX_RULER_GRADS) : 0
    for (let j = 0; j <= maxJ; j++) {
      const x = j * pxPerSixteenth
      if (j % 16 === 0) {
        addTick(x, RULER_TICK_MAJOR, COL_MAJOR, 1.5)
        data.push({ d: x, ly: RULER_LABEL_LY, text: String(j / 16) }) // inch number
      } else if (j % 8 === 0) {
        addTick(x, RULER_TICK_MEDIUM + 2, COL_MEDIUM, 1)
      } else if (j % 4 === 0) {
        addTick(x, RULER_TICK_MEDIUM, COL_MEDIUM, 1)
      } else {
        addTick(x, RULER_TICK_MINOR, COL_MINOR, 1)
      }
    }
    data.push({ d: 2, ly: RULER_UNIT_LY, text: 'in' })
  }
  return data
}

/** (Re)create the upright text elements for a ruler's labels. */
function createLabelEls(group: SVGGElement, data: LabelDatum[]): SVGTextElement[] {
  group.replaceChildren()
  return data.map((datum) => {
    const t = el('text', {
      'font-family': 'system-ui, -apple-system, sans-serif',
      'font-size': 10,
      fill: COL_LABEL,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'paint-order': 'stroke',
      stroke: COL_UNDERLAY,
      'stroke-width': 2
    })
    t.textContent = datum.text
    group.appendChild(t)
    return t
  })
}

/**
 * Position each label at its along-arm distance in SCREEN space, keeping the
 * text upright (rotated to follow the ruler, flipped 180° when the arm points
 * into the left half so numbers never read upside down).
 */
function positionLabels(
  els: SVGTextElement[],
  data: LabelDatum[],
  cx: number,
  cy: number,
  angleDeg: number
): void {
  const A = (angleDeg * Math.PI) / 180
  const cosA = Math.cos(A)
  const sinA = Math.sin(A)
  const flip = cosA < 0
  const theta = -angleDeg + (flip ? 180 : 0)
  for (let i = 0; i < els.length; i++) {
    const { d, ly } = data[i]
    const sx = cx + d * cosA + ly * sinA
    const sy = cy + (-d * sinA + ly * cosA)
    els[i].setAttribute('transform', `translate(${sx},${sy}) rotate(${theta})`)
  }
}

let lastRadius = -1
let lastRulerKey = ''
let statLabelData: LabelDatum[] = []
let movLabelData: LabelDatum[] = []
let statLabelEls: SVGTextElement[] = []
let movLabelEls: SVGTextElement[] = []

export interface Viewport {
  width: number
  height: number
}

/** Format the three readout numbers (PRD §5.3). */
export function computeReadout(state: GoniometerState): { between: number; s: number; m: number } {
  return {
    between: roundTo(angleBetween(state.angleStationary, state.angleMoving), 1),
    s: roundTo(state.angleStationary, 1),
    m: roundTo(state.angleMoving, 1)
  }
}

function show(node: SVGElement, visible: boolean): void {
  node.style.display = visible ? '' : 'none'
}

/** Update every element to reflect `state`. Cheap on the hot path (drag/rotate). */
export function render(refs: Refs, state: GoniometerState, vp: Viewport, effPxPerInch: number): void {
  const { cx, cy, radius, angleStationary, angleMoving, opacity, displayMode } = state
  const isRuler =
    displayMode === 'rulerMetric' ||
    displayMode === 'rulerImperial' ||
    displayMode === 'rulerPixels'

  refs.svg.style.opacity = String(opacity)

  for (const n of [refs.rayStatUnder, refs.rayStat, refs.rayMovUnder, refs.rayMov]) show(n, !isRuler)
  for (const n of [refs.armStatUnder, refs.armStat, refs.armMovUnder, refs.armMov]) show(n, !isRuler)
  for (const n of [refs.rulerStat, refs.rulerMov, refs.rulerStatLabels, refs.rulerMovLabels]) show(n, isRuler)

  if (!isRuler) {
    const rS = rayToEdge(cx, cy, angleStationary, vp.width, vp.height)
    setLine(refs.rayStatUnder, cx, cy, rS.x, rS.y)
    setLine(refs.rayStat, cx, cy, rS.x, rS.y)
    const rM = rayToEdge(cx, cy, angleMoving, vp.width, vp.height)
    setLine(refs.rayMovUnder, cx, cy, rM.x, rM.y)
    setLine(refs.rayMov, cx, cy, rM.x, rM.y)
  } else {
    const maxLen = Math.hypot(vp.width, vp.height)
    const rulerMode = displayMode as 'rulerMetric' | 'rulerImperial' | 'rulerPixels'
    const key = `${displayMode}|${Math.round(effPxPerInch * 100)}|${Math.round(maxLen)}`
    if (key !== lastRulerKey) {
      statLabelData = buildRuler(refs.rulerStat, rulerMode, effPxPerInch, maxLen, COL_STATIONARY)
      movLabelData = buildRuler(refs.rulerMov, rulerMode, effPxPerInch, maxLen, COL_MOVING)
      statLabelEls = createLabelEls(refs.rulerStatLabels, statLabelData)
      movLabelEls = createLabelEls(refs.rulerMovLabels, movLabelData)
      lastRulerKey = key
    }
    refs.rulerStat.setAttribute('transform', `translate(${cx},${cy}) rotate(${-angleStationary})`)
    refs.rulerMov.setAttribute('transform', `translate(${cx},${cy}) rotate(${-angleMoving})`)
    positionLabels(statLabelEls, statLabelData, cx, cy, angleStationary)
    positionLabels(movLabelEls, movLabelData, cx, cy, angleMoving)
  }

  refs.gonio.setAttribute('transform', `translate(${cx},${cy})`)

  if (radius !== lastRadius) {
    refs.dial.setAttribute('r', String(radius))
    rebuildTicks(refs, radius)
    lastRadius = radius
  }

  const hS = angleToPoint(0, 0, angleStationary, radius)
  setLine(refs.armStatUnder, 0, 0, hS.x, hS.y)
  setLine(refs.armStat, 0, 0, hS.x, hS.y)
  refs.handleStat.setAttribute('cx', String(hS.x))
  refs.handleStat.setAttribute('cy', String(hS.y))

  const hM = angleToPoint(0, 0, angleMoving, radius)
  setLine(refs.armMovUnder, 0, 0, hM.x, hM.y)
  setLine(refs.armMov, 0, 0, hM.x, hM.y)
  refs.handleMov.setAttribute('cx', String(hM.x))
  refs.handleMov.setAttribute('cy', String(hM.y))
  // The angle readout now lives in the HTML control panel (see main.ts).
}

function setLine(line: SVGLineElement, x1: number, y1: number, x2: number, y2: number): void {
  line.setAttribute('x1', String(x1))
  line.setAttribute('y1', String(y1))
  line.setAttribute('x2', String(x2))
  line.setAttribute('y2', String(y2))
}
