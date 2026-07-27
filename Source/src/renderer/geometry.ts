/**
 * Angle convention (PRD §4.3):
 *   0°   = pointing right (east)
 *   angles increase counter-clockwise (90° up, 180° left, 270° down)
 *   range is [0, 360)
 *
 * Screen Y increases downward, so the Y term is negated in both directions.
 * Get this right here once and never think about it again elsewhere.
 */

export interface Point {
  x: number
  y: number
}

/** Angle (deg, [0,360)) from center (cx,cy) to point (px,py). */
export function pointToAngle(cx: number, cy: number, px: number, py: number): number {
  const deg = Math.atan2(-(py - cy), px - cx) * (180 / Math.PI)
  return (deg + 360) % 360
}

/** Point at `radius` from (cx,cy) along `angle` (deg). */
export function angleToPoint(cx: number, cy: number, angle: number, radius: number): Point {
  const rad = angle * (Math.PI / 180)
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
}

/** Normalize any angle into [0, 360). */
export function normalize360(angle: number): number {
  return ((angle % 360) + 360) % 360
}

/**
 * The unsigned angle between two absolute angles, always the smaller of the two
 * possible arcs, so the result is in [0, 180]. This is the primary readout `∠`.
 */
export function angleBetween(a: number, b: number): number {
  const diff = Math.abs(normalize360(a) - normalize360(b)) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * Project a point onto an arm's axis (a ray from the fulcrum along `angleDeg`).
 * Returns `t` = signed distance along the arm from the fulcrum (px; negative =
 * behind the fulcrum) and `perp` = perpendicular distance from the axis (px).
 * Used to hit-test and measure along the ruler edge.
 */
export function projectOntoArm(
  cx: number,
  cy: number,
  angleDeg: number,
  px: number,
  py: number
): { t: number; perp: number } {
  const A = (angleDeg * Math.PI) / 180
  const ux = Math.cos(A)
  const uy = -Math.sin(A) // screen Y down
  const vx = px - cx
  const vy = py - cy
  const t = vx * ux + vy * uy
  const perp = Math.abs(vx * uy - vy * ux)
  return { t, perp }
}

/** Snap an angle to the nearest multiple of `increment` degrees. */
export function snapAngle(angle: number, increment: number): number {
  if (increment <= 0) return normalize360(angle)
  return normalize360(Math.round(angle / increment) * increment)
}

/** Round to a fixed number of decimals, avoiding -0. */
export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  const r = Math.round(value * f) / f
  return r === 0 ? 0 : r
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Extend a ray from (cx,cy) along `angle` until it hits the edge of the
 * width×height window rectangle. Used to draw the infinite guide rays out to
 * the screen edge (PRD §5.1). Returns the far endpoint.
 */
export function rayToEdge(
  cx: number,
  cy: number,
  angle: number,
  width: number,
  height: number
): Point {
  const rad = angle * (Math.PI / 180)
  const dx = Math.cos(rad)
  const dy = -Math.sin(rad) // screen Y down

  // Largest t>0 such that (cx+dx*t, cy+dy*t) is still inside the rect.
  let t = Infinity
  if (dx > 0) t = Math.min(t, (width - cx) / dx)
  else if (dx < 0) t = Math.min(t, (0 - cx) / dx)
  if (dy > 0) t = Math.min(t, (height - cy) / dy)
  else if (dy < 0) t = Math.min(t, (0 - cy) / dy)

  if (!isFinite(t) || t < 0) t = Math.hypot(width, height)
  return { x: cx + dx * t, y: cy + dy * t }
}
