/**
 * How the two arms are drawn:
 *   'lines'        — thin red/blue reference lines (the original look)
 *   'rulerMetric'  — physical rulers graduated in centimetres/millimetres
 *   'rulerImperial'— physical rulers graduated in inches (1/16")
 *   'rulerPixels'  — rulers graduated directly in screen pixels
 *
 * In the metric/imperial modes the graduations reflect real on-screen
 * dimensions using a pixels-per-inch calibration (see `pxPerInch`); the pixel
 * mode needs no calibration.
 */
export type DisplayMode = 'lines' | 'rulerMetric' | 'rulerImperial' | 'rulerPixels'

/**
 * The complete, serializable state of one goniometer.
 *
 * All coordinates are window-relative pixels. Because the overlay window is
 * created at the exact size and position of its display and never moves
 * (see PRD §4.1), window-relative pixels map 1:1 to on-screen pixels for that
 * display. "Dragging the goniometer" only ever mutates `cx`/`cy` here — it
 * never moves the window.
 */
export interface GoniometerState {
  /** Fulcrum (pivot) X, window-relative px. */
  cx: number
  /** Fulcrum (pivot) Y, window-relative px. */
  cy: number
  /** Dial radius px. Clamped to [RADIUS_MIN, RADIUS_MAX]. */
  radius: number
  /** Absolute screen angle of the stationary (reference) arm, [0, 360). */
  angleStationary: number
  /** Absolute screen angle of the moving arm, [0, 360). */
  angleMoving: number
  /** Overlay opacity, [OPACITY_MIN, OPACITY_MAX]. */
  opacity: number
  /** Rotation snap increment in degrees, used when `snapEnabled` (default 1). */
  snapIncrement: number
  /** When true, arm rotation snaps to `snapIncrement`; when false, free rotation. */
  snapEnabled: boolean
  /** How the arms are rendered (lines vs. physical rulers). */
  displayMode: DisplayMode
  /** When true, click-drag performs direct measurements instead of manipulation. */
  measureMode: boolean
  /**
   * Ruler calibration: on-screen pixels per real inch. 0 means "auto" — the
   * renderer derives it from the display's DPI (96 × scaleFactor). A user can
   * override it by calibrating against a real ruler.
   */
  pxPerInch: number
  /** When true, passthrough is always on: the goniometer is visible but inert. */
  locked: boolean
}

export const RADIUS_MIN = 80
export const RADIUS_MAX = 400
export const RADIUS_DEFAULT = 150

export const OPACITY_MIN = 0.3
export const OPACITY_MAX = 1.0
export const OPACITY_DEFAULT = 1.0

export const SNAP_DEFAULT = 1
export const SNAP_SHIFT = 15
export const SNAP_FREE = 0 // 0 = continuous, no snapping

export const MM_PER_INCH = 25.4

/** Build the default state for a display of the given size. */
export function defaultState(width: number, height: number): GoniometerState {
  return {
    cx: Math.round(width / 2),
    cy: Math.round(height / 2),
    radius: RADIUS_DEFAULT,
    // Stationary arm points right (east); moving arm 45° counter-clockwise.
    angleStationary: 0,
    angleMoving: 45,
    opacity: OPACITY_DEFAULT,
    snapIncrement: SNAP_DEFAULT,
    snapEnabled: true,
    displayMode: 'lines',
    measureMode: false,
    pxPerInch: 0, // auto (from DPI)
    locked: false
  }
}
