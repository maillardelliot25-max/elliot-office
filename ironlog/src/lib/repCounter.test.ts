import { describe, expect, it } from 'vitest'
import { angleBetween, initialRepCounterState, updateRepCounter, type RepThresholds } from './repCounter'

describe('angleBetween', () => {
  it('reads 180 degrees for a straight leg', () => {
    const hip = { x: 0, y: 0 }
    const knee = { x: 0, y: 1 }
    const ankle = { x: 0, y: 2 }
    expect(angleBetween(hip, knee, ankle)).toBeCloseTo(180, 5)
  })

  it('reads 90 degrees for a right-angle bend', () => {
    const hip = { x: 0, y: 0 }
    const knee = { x: 0, y: 1 }
    const ankle = { x: 1, y: 1 }
    expect(angleBetween(hip, knee, ankle)).toBeCloseTo(90, 5)
  })

  it('returns 0 for degenerate (coincident) points instead of NaN', () => {
    const p = { x: 0, y: 0 }
    expect(angleBetween(p, p, p)).toBe(0)
  })
})

describe('updateRepCounter', () => {
  const squatThresholds: RepThresholds = { contractedThreshold: 110, extendedThreshold: 160 }

  it('does not count a rep from extended alone', () => {
    let state = initialRepCounterState()
    state = updateRepCounter(state, 175, squatThresholds)
    expect(state.reps).toBe(0)
    expect(state.phase).toBe('extended')
  });

  it('counts one full rep: extended -> contracted -> extended', () => {
    let state = initialRepCounterState()
    state = updateRepCounter(state, 175, squatThresholds) // standing
    state = updateRepCounter(state, 90, squatThresholds) // bottom of squat
    expect(state.phase).toBe('contracted')
    expect(state.reps).toBe(0)
    state = updateRepCounter(state, 170, squatThresholds) // back to standing
    expect(state.phase).toBe('extended')
    expect(state.reps).toBe(1)
  })

  it('does not double-count from noisy frames sitting near the extended threshold', () => {
    let state = initialRepCounterState()
    state = updateRepCounter(state, 90, squatThresholds)
    state = updateRepCounter(state, 165, squatThresholds) // rep #1
    state = updateRepCounter(state, 162, squatThresholds)
    state = updateRepCounter(state, 168, squatThresholds)
    state = updateRepCounter(state, 163, squatThresholds)
    expect(state.reps).toBe(1)
  })

  it('does not count a rep that never fully contracts (partial range of motion)', () => {
    let state = initialRepCounterState()
    state = updateRepCounter(state, 175, squatThresholds)
    state = updateRepCounter(state, 130, squatThresholds) // only a shallow dip, never hits 110
    state = updateRepCounter(state, 175, squatThresholds)
    expect(state.reps).toBe(0)
    expect(state.phase).toBe('extended')
  })

  it('counts multiple consecutive reps', () => {
    let state = initialRepCounterState()
    const sequence = [175, 90, 170, 95, 165, 100, 172]
    for (const angle of sequence) {
      state = updateRepCounter(state, angle, squatThresholds)
    }
    expect(state.reps).toBe(3)
  })

  it('ignores angles in the dead zone between thresholds without changing phase', () => {
    let state = initialRepCounterState()
    state = updateRepCounter(state, 175, squatThresholds)
    state = updateRepCounter(state, 135, squatThresholds) // between 110 and 160
    expect(state.phase).toBe('extended')
    expect(state.reps).toBe(0)
  })
})
