import {
  defaultState,
  RADIUS_MIN,
  RADIUS_MAX,
  OPACITY_MIN,
  OPACITY_MAX,
  SNAP_SHIFT,
  SNAP_FREE,
  MM_PER_INCH,
  type GoniometerState,
  type DisplayMode
} from '../shared/types'
import { pointToAngle, snapAngle, normalize360, clamp } from './geometry'
import { hitTest, type Handle } from './hittest'
import { createGoniometer, render, computeReadout, type Refs, type Viewport } from './goniometer'
import {
  classifyStart,
  resolve,
  isSignificant,
  renderMeasure,
  clearMeasure,
  type MeasureStart,
  type LiveMeasure
} from './measure'

const stage = document.getElementById('stage') as HTMLElement
const input = document.getElementById('angle-input') as HTMLInputElement
const panel = document.getElementById('panel') as HTMLElement
const popover = document.getElementById('popover') as HTMLElement
const infoPopover = document.getElementById('info-popover') as HTMLElement

// Readout row (in the panel)
const roS = document.getElementById('ro-s') as HTMLButtonElement
const roBetween = document.getElementById('ro-between') as HTMLSpanElement
const roM = document.getElementById('ro-m') as HTMLButtonElement

// Toolbar buttons
const btnMode = document.getElementById('tb-mode') as HTMLButtonElement
const btnSnap = document.getElementById('tb-snap') as HTMLButtonElement
const btnMeasure = document.getElementById('tb-measure') as HTMLButtonElement
const btnLock = document.getElementById('tb-lock') as HTMLButtonElement
const btnInfo = document.getElementById('tb-info') as HTMLButtonElement
const btnGear = document.getElementById('tb-gear') as HTMLButtonElement
const btnQuit = document.getElementById('tb-quit') as HTMLButtonElement

// Popover controls
const pvOpacity = document.getElementById('pv-opacity') as HTMLInputElement
const pvOpacityVal = document.getElementById('pv-opacity-val') as HTMLSpanElement
const pvSize = document.getElementById('pv-size') as HTMLInputElement
const pvSizeVal = document.getElementById('pv-size-val') as HTMLSpanElement
const pvStep = document.getElementById('pv-step') as HTMLSelectElement
const pvPpi = document.getElementById('pv-ppi') as HTMLInputElement
const pvPpiLabel = document.getElementById('pv-ppi-label') as HTMLSpanElement

let state: GoniometerState
let refs: Refs
const vp: Viewport = { width: window.innerWidth, height: window.innerHeight }
let dpiPxPerInch = 96 // default until getDisplayInfo resolves

// --- passthrough loop bookkeeping (PRD §7.4) ---
let currentlyInteractive = false
let isDragging = false
let editing = false
let popoverOpen = false
let infoOpen = false
let pendingRaf: number | null = null

const pointer = { x: 0, y: 0, shift: false, alt: false }

type DragMode = 'move' | 'rotateStationary' | 'rotateMoving' | null
let dragMode: DragMode = null
let moveOffsetX = 0
let moveOffsetY = 0

let editField: 'S' | 'M' | null = null
let lastReported = ''

// --- measurement mode state (transient; not persisted) ---
let measuring = false
let measureStart: MeasureStart | null = null
let pendingLive: LiveMeasure | null = null
let shownMeasure: LiveMeasure | null = null

// -----------------------------------------------------------------------------

async function init(): Promise<void> {
  const [loaded, info] = await Promise.all([
    window.api.loadState(),
    window.api.getDisplayInfo()
  ])
  dpiPxPerInch = 96 * (info?.scaleFactor || 1)
  currentDark = !!info?.dark
  state = loaded ? sanitize(loaded) : defaultState(vp.width, vp.height)

  refs = createGoniometer(stage)
  syncControlsFromState()
  draw()

  wirePointer()
  wireNumericEntry()
  wireToolbar()
  wirePopover()
  wireMainEvents()
  wireTheme()
}

// --- OS light/dark theme. The whole HTML control panel (readout + buttons +
//     popover) follows the theme via CSS `prefers-color-scheme`. `currentDark`
//     is only needed for the SVG measurement labels, which aren't HTML; it's
//     kept in sync from the authoritative `dark` flag pushed by the main
//     process (nativeTheme). ---
let currentDark = false

function wireTheme(): void {
  window.api.onThemeChanged((dark) => {
    currentDark = dark
    if (shownMeasure) renderMeasure(refs.measureLayer, state, shownMeasure, effPxPerInch(), currentDark)
  })
}

/** Effective ruler scale: explicit calibration wins, else the display DPI. */
function effPxPerInch(): number {
  return state.pxPerInch > 0 ? state.pxPerInch : dpiPxPerInch
}

/** Clamp a persisted state into the current viewport and fill any missing fields. */
function sanitize(s: GoniometerState): GoniometerState {
  const base = defaultState(vp.width, vp.height)
  const merged = { ...base, ...s }
  const radius = clamp(merged.radius, RADIUS_MIN, RADIUS_MAX)
  let cx = merged.cx
  let cy = merged.cy
  if (!isFinite(cx) || cx < 0 || cx > vp.width) cx = Math.round(vp.width / 2)
  if (!isFinite(cy) || cy < 0 || cy > vp.height) cy = Math.round(vp.height / 2)
  return {
    ...merged,
    cx,
    cy,
    radius,
    angleStationary: normalize360(merged.angleStationary),
    angleMoving: normalize360(merged.angleMoving),
    opacity: clamp(merged.opacity, OPACITY_MIN, OPACITY_MAX)
  }
}

function draw(): void {
  render(refs, state, vp, effPxPerInch())
  updateReadout()
  positionControls()
  reportAngle()
}

/** Write the S / ∠ / M angles into the HTML readout row (skip S/M while editing). */
function updateReadout(): void {
  const { between, s, m } = computeReadout(state)
  roBetween.textContent = `∠ ${between.toFixed(1)}°`
  if (editField !== 'S') roS.textContent = `S ${s.toFixed(1)}°`
  if (editField !== 'M') roM.textContent = `M ${m.toFixed(1)}°`
}

function reportAngle(): void {
  const text = computeReadout(state).between.toFixed(1)
  if (text !== lastReported) {
    lastReported = text
    window.api.reportAngle(text)
  }
}

// --- persistence (debounced) --------------------------------------------------
let saveTimer: number | null = null
function scheduleSave(): void {
  if (saveTimer !== null) return
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    window.api.saveState(state)
  }, 500)
}
function saveNow(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  window.api.saveState(state)
}

// --- pointer / passthrough loop ----------------------------------------------

let rafScheduledAt = 0

function scheduleHandleMove(): void {
  if (pendingRaf !== null) {
    // Self-heal: if the scheduled frame never ran (rAF callbacks can be dropped
    // and never resume when the display sleeps / the session locks after long
    // idle), don't wedge forever — cancel the stale frame and reschedule.
    if (performance.now() - rafScheduledAt < 250) return
    cancelAnimationFrame(pendingRaf)
    pendingRaf = null
  }
  rafScheduledAt = performance.now()
  pendingRaf = requestAnimationFrame(() => {
    pendingRaf = null
    handleMove()
  })
}

function wirePointer(): void {
  window.addEventListener('mousemove', (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.shift = e.shiftKey
    pointer.alt = e.altKey
    scheduleHandleMove()
  })

  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('wheel', onWheel, { passive: false })

  // Safety net: re-evaluate passthrough from the last known cursor position on a
  // slow timer. Timers keep firing even when requestAnimationFrame is throttled,
  // so this recovers a wedged loop within a second — the goniometer (and the
  // rest of the screen) can never stay permanently click-stuck.
  window.setInterval(() => {
    if (isDragging || measuring || editing || popoverOpen || infoOpen) return
    if (pendingRaf !== null) {
      cancelAnimationFrame(pendingRaf)
      pendingRaf = null
    }
    handleMove()
  }, 1000)

  // When the page is hidden (display sleep, lock, workspace switch) never leave
  // the whole screen click-blocked; force passthrough back on and re-evaluate on
  // return.
  document.addEventListener('visibilitychange', () => {
    if (pendingRaf !== null) {
      cancelAnimationFrame(pendingRaf)
      pendingRaf = null
    }
    if (document.hidden) setInteractive(false)
    else handleMove()
  })
}

function inEl(elm: HTMLElement): boolean {
  if (elm.hidden || elm.style.display === 'none') return false
  const r = elm.getBoundingClientRect()
  return pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom
}

function overControls(): boolean {
  return inEl(panel) || (popoverOpen && inEl(popover)) || (infoOpen && inEl(infoPopover))
}

function setInteractive(v: boolean): void {
  if (v !== currentlyInteractive) {
    currentlyInteractive = v
    window.api.setPassthrough(!v)
  }
}

function handleMove(): void {
  if (measuring) {
    updateMeasure()
    return
  }
  if (isDragging) {
    updateDrag()
    return
  }

  if (editing || popoverOpen || infoOpen || overControls()) {
    setInteractive(true)
    document.body.style.cursor = 'default'
    return
  }

  if (state.measureMode) {
    // Measurable when the cursor can start a measurement, or one is shown
    // (so a click anywhere can clear it). Lock is ignored in measure mode.
    const startable = classifyStart(state, pointer.x, pointer.y) !== null
    setInteractive(startable || shownMeasure !== null)
    document.body.style.cursor = startable ? 'crosshair' : 'default'
    return
  }

  const hit = hitTest(state, pointer.x, pointer.y)
  setInteractive(hit !== null && !state.locked)
  if (state.locked) document.body.style.cursor = 'default'
  else setCursorForHandle(hit)
}

function onMouseDown(e: MouseEvent): void {
  // Click outside the popover closes it.
  if (popoverOpen && !inEl(popover) && !inEl(panel)) {
    closePopover()
    return
  }
  if (infoOpen && !inEl(infoPopover) && !inEl(panel)) {
    closeInfo()
    return
  }
  // Clicks on the control panel (buttons, readout) are handled by their own
  // listeners; don't start a drag/measure from them.
  if (overControls() || editing) return

  // --- Measurement mode: click-drag measures; a click clears a shown result. ---
  if (state.measureMode) {
    if (shownMeasure) {
      shownMeasure = null
      clearMeasure(refs.measureLayer)
      return
    }
    const start = classifyStart(state, e.clientX, e.clientY)
    if (!start) return
    measureStart = start
    pendingLive = null
    measuring = true
    document.body.style.cursor = 'crosshair'
    return
  }

  if (state.locked) return

  const hit = hitTest(state, e.clientX, e.clientY)
  if (hit === null) return

  if (hit === 'fulcrum' || hit === 'dial') {
    dragMode = 'move'
    moveOffsetX = state.cx - e.clientX
    moveOffsetY = state.cy - e.clientY
  } else if (hit === 'armStationary') {
    dragMode = 'rotateStationary'
  } else if (hit === 'armMoving') {
    dragMode = 'rotateMoving'
  }

  isDragging = true
  document.body.style.cursor = 'grabbing'
}

function onMouseUp(): void {
  if (measuring) {
    measuring = false
    if (pendingLive && isSignificant(pendingLive)) {
      shownMeasure = pendingLive // keep the highlight + readout on screen
    } else {
      shownMeasure = null
      clearMeasure(refs.measureLayer)
    }
    measureStart = null
    handleMove()
    return
  }
  if (!isDragging) return
  isDragging = false
  dragMode = null
  saveNow()
  handleMove()
}

/** Recompute and redraw the in-progress measurement from the cursor. */
function updateMeasure(): void {
  if (!measureStart) return
  pendingLive = resolve(state, measureStart, pointer.x, pointer.y)
  renderMeasure(refs.measureLayer, state, pendingLive, effPxPerInch(), currentDark)
}

function updateDrag(): void {
  if (dragMode === 'move') {
    state.cx = clamp(pointer.x + moveOffsetX, 0, vp.width)
    state.cy = clamp(pointer.y + moveOffsetY, 0, vp.height)
  } else if (dragMode === 'rotateStationary' || dragMode === 'rotateMoving') {
    const raw = pointToAngle(state.cx, state.cy, pointer.x, pointer.y)
    // Base increment comes from the persistent snap toggle; modifiers override:
    // Shift = coarse 15°, Alt = free.
    const base = state.snapEnabled ? state.snapIncrement : SNAP_FREE
    const increment = pointer.alt ? SNAP_FREE : pointer.shift ? SNAP_SHIFT : base
    const snapped = snapAngle(raw, increment)
    if (dragMode === 'rotateStationary') state.angleStationary = snapped
    else state.angleMoving = snapped
  }
  draw()
  scheduleSave()
}

function onWheel(e: WheelEvent): void {
  if (state.locked || editing || popoverOpen || infoOpen || measuring) return
  const hit = hitTest(state, e.clientX, e.clientY)
  if (hit === null) return
  e.preventDefault()
  const step = e.deltaY > 0 ? -10 : 10
  state.radius = clamp(state.radius + step, RADIUS_MIN, RADIUS_MAX)
  pvSize.value = String(state.radius)
  pvSizeVal.textContent = `${state.radius}px`
  draw()
  scheduleSave()
}

function setCursorForHandle(hit: Handle): void {
  let cursor = 'default'
  switch (hit) {
    case 'fulcrum':
    case 'dial':
      cursor = 'move'
      break
    case 'armStationary':
    case 'armMoving':
      cursor = 'grab'
      break
  }
  document.body.style.cursor = cursor
}

// --- numeric entry: set each arm's ABSOLUTE angle (req #4) ---------------------

function wireNumericEntry(): void {
  // Clicking the underlined S / M value in the readout opens numeric entry.
  roS.addEventListener('click', () => {
    if (!state.measureMode) enterNumericEntry('S')
  })
  roM.addEventListener('click', () => {
    if (!state.measureMode) enterNumericEntry('M')
  })

  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^0-9.\-]/g, '')
    if (cleaned !== input.value) input.value = cleaned
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyNumericEntry()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      exitNumericEntry()
    }
  })
  input.addEventListener('blur', () => {
    if (editing) exitNumericEntry()
  })
}

async function enterNumericEntry(field: 'S' | 'M'): Promise<void> {
  editing = true
  editField = field
  currentlyInteractive = true
  window.api.setPassthrough(false)

  // Position the input over the clicked S / M value in the HTML readout.
  const target = field === 'S' ? roS : roM
  const r = target.getBoundingClientRect()
  input.style.left = `${r.left + r.width / 2 - 41}px` // input is 82px wide
  input.style.top = `${r.top + r.height / 2 - 12}px` // input is 24px tall
  input.classList.add('visible')

  const current = field === 'S' ? state.angleStationary : state.angleMoving
  input.value = current.toFixed(1)

  await window.api.setFocusable(true)
  input.focus()
  input.select()
}

function applyNumericEntry(): void {
  const value = parseFloat(input.value)
  if (isFinite(value) && value >= -360 && value <= 360) {
    // Set the chosen arm's ABSOLUTE screen angle; negatives normalize into [0,360).
    if (editField === 'S') state.angleStationary = normalize360(value)
    else if (editField === 'M') state.angleMoving = normalize360(value)
    draw()
    saveNow()
  }
  exitNumericEntry()
}

function exitNumericEntry(): void {
  if (!editing) return
  editing = false
  editField = null
  input.classList.remove('visible')
  input.blur()
  window.api.setFocusable(false)
  handleMove()
}

// --- toolbar ------------------------------------------------------------------

const MODE_ORDER: DisplayMode[] = ['lines', 'rulerMetric', 'rulerImperial', 'rulerPixels']
const MODE_LABEL: Record<DisplayMode, string> = {
  lines: 'Lines',
  rulerMetric: 'Metric',
  rulerImperial: 'Imperial',
  rulerPixels: 'Pixels'
}

/** Discard any shown/in-progress measurement (e.g. after unit/size changes). */
function resetMeasurement(): void {
  measuring = false
  measureStart = null
  pendingLive = null
  shownMeasure = null
  clearMeasure(refs.measureLayer)
}

function wireToolbar(): void {
  btnMode.addEventListener('click', () => {
    const i = MODE_ORDER.indexOf(state.displayMode)
    state.displayMode = MODE_ORDER[(i + 1) % MODE_ORDER.length]
    resetMeasurement() // units may have changed
    syncControlsFromState()
    draw()
    saveNow()
  })

  btnSnap.addEventListener('click', () => {
    state.snapEnabled = !state.snapEnabled
    refreshToolbar()
    saveNow()
  })

  btnMeasure.addEventListener('click', () => {
    state.measureMode = !state.measureMode
    resetMeasurement()
    refreshToolbar()
    saveNow()
    handleMove()
  })

  btnLock.addEventListener('click', () => {
    // Route through main so the tray checkbox and all displays stay in sync;
    // the resulting onLockChanged updates our local state + toolbar.
    window.api.setLocked(!state.locked)
  })

  btnInfo.addEventListener('click', () => {
    if (infoOpen) closeInfo()
    else openInfo()
  })

  btnGear.addEventListener('click', () => {
    if (popoverOpen) closePopover()
    else openPopover()
  })

  btnQuit.addEventListener('click', () => {
    window.api.quit()
  })

  // Info-panel links open in the default browser (via main → shell.openExternal).
  infoPopover.querySelectorAll<HTMLButtonElement>('.info-link').forEach((b) => {
    b.addEventListener('click', () => {
      const url = b.dataset.url
      if (url) window.api.openExternal(url)
    })
  })
}

function refreshToolbar(): void {
  btnMode.textContent = MODE_LABEL[state.displayMode]
  btnSnap.textContent = state.snapEnabled ? `Snap ${state.snapIncrement}°` : 'Free'
  btnSnap.classList.toggle('active', state.snapEnabled)
  btnMeasure.classList.toggle('active', state.measureMode)
  btnLock.textContent = state.locked ? '🔒 Locked' : '🔓 Unlocked'
  btnLock.classList.toggle('active', state.locked)
}

// --- settings popover ---------------------------------------------------------

function wirePopover(): void {
  pvOpacity.addEventListener('input', () => {
    state.opacity = clamp(parseFloat(pvOpacity.value), OPACITY_MIN, OPACITY_MAX)
    pvOpacityVal.textContent = `${Math.round(state.opacity * 100)}%`
    draw()
    scheduleSave()
  })
  pvSize.addEventListener('input', () => {
    state.radius = clamp(parseInt(pvSize.value, 10), RADIUS_MIN, RADIUS_MAX)
    pvSizeVal.textContent = `${state.radius}px`
    resetMeasurement() // a shown measurement would no longer line up
    draw()
    scheduleSave()
  })
  pvStep.addEventListener('change', () => {
    state.snapIncrement = parseFloat(pvStep.value)
    refreshToolbar()
    saveNow()
  })
  pvPpi.addEventListener('change', () => {
    const v = parseFloat(pvPpi.value)
    // The field is px/mm in metric mode, px/inch otherwise; store canonical px/inch.
    const perInch = state.displayMode === 'rulerMetric' ? v * MM_PER_INCH : v
    // Clamp to a sane range: 0 means "auto (DPI)"; otherwise keep it well above
    // zero so the ruler can never be asked for an absurd number of graduations.
    state.pxPerInch = isFinite(perInch) && perInch > 0 ? clamp(perInch, 12, 1200) : 0
    syncControlsFromState()
    draw()
    saveNow()
  })
}

function openPopover(): void {
  if (infoOpen) closeInfo()
  popoverOpen = true
  popover.hidden = false
  syncControlsFromState()
  positionControls()
  currentlyInteractive = true
  window.api.setPassthrough(false)
}

function closePopover(): void {
  popoverOpen = false
  popover.hidden = true
  handleMove()
}

function openInfo(): void {
  if (popoverOpen) closePopover()
  infoOpen = true
  infoPopover.hidden = false
  positionControls()
  currentlyInteractive = true
  window.api.setPassthrough(false)
}

function closeInfo(): void {
  infoOpen = false
  infoPopover.hidden = true
  handleMove()
}

/** Push current state values into every control (called on load and on change). */
function syncControlsFromState(): void {
  refreshToolbar()
  pvOpacity.value = String(state.opacity)
  pvOpacityVal.textContent = `${Math.round(state.opacity * 100)}%`
  pvSize.value = String(state.radius)
  pvSizeVal.textContent = `${state.radius}px`
  pvStep.value = String(state.snapIncrement)
  // Calibration only applies to the metric/imperial rulers; pixels & lines
  // need none. Show the field in the unit that matches the current mode.
  const showCalib = state.displayMode === 'rulerMetric' || state.displayMode === 'rulerImperial'
  const ppiRow = pvPpi.closest('label') as HTMLElement | null
  const ppiHint = document.querySelector('#popover .hint') as HTMLElement | null
  if (ppiRow) ppiRow.style.display = showCalib ? '' : 'none'
  if (ppiHint) ppiHint.style.display = showCalib ? '' : 'none'
  if (state.displayMode === 'rulerMetric') {
    pvPpiLabel.textContent = 'Ruler px / mm'
    pvPpi.value = (effPxPerInch() / MM_PER_INCH).toFixed(2)
  } else {
    pvPpiLabel.textContent = 'Ruler px / inch'
    pvPpi.value = effPxPerInch().toFixed(1)
  }
}

/** Anchor the single control panel below the dial; the popover opens above it. */
function positionControls(): void {
  const pW = panel.offsetWidth || 280
  const pH = panel.offsetHeight || 70
  let left = state.cx - pW / 2
  let top = state.cy + state.radius + 16
  left = clamp(left, 4, Math.max(4, vp.width - pW - 4))
  top = clamp(top, 4, Math.max(4, vp.height - pH - 4))
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`

  if (popoverOpen) positionPopover(popover, left, top, pH)
  if (infoOpen) positionPopover(infoPopover, left, top, pH)
}

/** Place a popover just above the panel (or below if there's no room). */
function positionPopover(el: HTMLElement, panelLeft: number, panelTop: number, panelH: number): void {
  const w = el.offsetWidth || 220
  const h = el.offsetHeight || 200
  let pTop = panelTop - h - 6
  if (pTop < 4) pTop = panelTop + panelH + 6
  el.style.left = `${clamp(panelLeft, 4, Math.max(4, vp.width - w - 4))}px`
  el.style.top = `${clamp(pTop, 4, Math.max(4, vp.height - h - 4))}px`
}

// --- main-process subscriptions + viewport ------------------------------------

function wireMainEvents(): void {
  window.api.onLockChanged((locked) => {
    state.locked = locked
    refreshToolbar()
    if (locked) {
      if (isDragging) {
        isDragging = false
        dragMode = null
      }
      // Passthrough is recomputed on next move; the toolbar stays interactive.
      handleMove()
    }
    scheduleSave()
  })

  window.api.onReset(() => {
    const d = defaultState(vp.width, vp.height)
    state.cx = d.cx
    state.cy = d.cy
    state.radius = d.radius
    state.angleStationary = d.angleStationary
    state.angleMoving = d.angleMoving
    resetMeasurement()
    syncControlsFromState()
    draw()
    saveNow()
  })

  window.api.onSetOpacity((opacity) => {
    state.opacity = clamp(opacity, OPACITY_MIN, OPACITY_MAX)
    syncControlsFromState()
    draw()
    saveNow()
  })

  // The display's resolution / scaling changed: update the viewport AND the DPI
  // so 'auto' ruler calibration tracks the new display configuration.
  window.api.onDisplayResized((size) => {
    vp.width = size.width
    vp.height = size.height
    if (size.scaleFactor) dpiPxPerInch = 96 * size.scaleFactor
    state.cx = clamp(state.cx, 0, vp.width)
    state.cy = clamp(state.cy, 0, vp.height)
    syncControlsFromState() // refresh the shown px/mm|inch if on auto
    draw()
    saveNow()
  })

  window.addEventListener('resize', async () => {
    vp.width = window.innerWidth
    vp.height = window.innerHeight
    state.cx = clamp(state.cx, 0, vp.width)
    state.cy = clamp(state.cy, 0, vp.height)
    // Re-query DPI in case display scaling changed (backup path to the IPC event).
    const info = await window.api.getDisplayInfo()
    if (info?.scaleFactor) dpiPxPerInch = 96 * info.scaleFactor
    syncControlsFromState()
    draw()
  })
}

// Surface any unexpected error to the main process (dev logs it) instead of
// letting it fail silently and leave the overlay looking "crashed".
window.addEventListener('error', (e) => {
  console.error('[overlay] uncaught error:', e.message, `${e.filename}:${e.lineno}`)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[overlay] unhandled rejection:', e.reason)
})

init().catch((err) => {
  console.error('[overlay] init failed:', err)
})
