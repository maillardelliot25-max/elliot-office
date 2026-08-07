export interface Point2D {
  x: number
  y: number
}

/** Angle (degrees) at point b, formed by rays b->a and b->c. */
export function angleBetween(a: Point2D, b: Point2D, c: Point2D): number {
  const abx = a.x - b.x
  const aby = a.y - b.y
  const cbx = c.x - b.x
  const cby = c.y - b.y

  const dot = abx * cbx + aby * cby
  const magAB = Math.hypot(abx, aby)
  const magCB = Math.hypot(cbx, cby)
  if (magAB === 0 || magCB === 0) return 0

  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)))
  return (Math.acos(cos) * 180) / Math.PI
}

export type RepPhase = 'extended' | 'contracted'

export interface RepCounterState {
  phase: RepPhase
  reps: number
}

export interface RepThresholds {
  /** Angle at or below which the joint counts as fully contracted (e.g. bottom of a squat). */
  contractedThreshold: number
  /** Angle at or above which the joint counts as fully extended (e.g. standing tall). */
  extendedThreshold: number
}

export function initialRepCounterState(): RepCounterState {
  return { phase: 'extended', reps: 0 }
}

/**
 * Hysteresis state machine: a rep only counts once the tracked joint angle
 * has gone from extended -> contracted -> extended, so a single noisy
 * frame near a threshold can't double-count or undercount a rep.
 */
export function updateRepCounter(
  state: RepCounterState,
  angle: number,
  thresholds: RepThresholds,
): RepCounterState {
  if (state.phase === 'extended' && angle <= thresholds.contractedThreshold) {
    return { phase: 'contracted', reps: state.reps }
  }
  if (state.phase === 'contracted' && angle >= thresholds.extendedThreshold) {
    return { phase: 'extended', reps: state.reps + 1 }
  }
  return state
}
