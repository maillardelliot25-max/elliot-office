import { describe, expect, it } from 'vitest'
import {
  computeExerciseLevel,
  computePersonalRecords,
  computeStreak,
  estimate1Rm,
  exerciseVolume,
  kgToLb,
  lbToKg,
  sessionVolume,
  suggestProgression,
} from './calculations'
import type { WorkoutExerciseEntry, WorkoutSession } from '../types'

function makeSet(weightKg: number, reps: number, overrides: Partial<{ completed: boolean; isWarmup: boolean }> = {}) {
  return {
    id: Math.random().toString(36),
    weightKg,
    reps,
    completed: overrides.completed ?? true,
    isWarmup: overrides.isWarmup ?? false,
  }
}

describe('estimate1Rm', () => {
  it('returns the weight itself for a 1-rep set', () => {
    expect(estimate1Rm(100, 1)).toBe(100)
  })

  it('applies the Epley formula for multi-rep sets', () => {
    expect(estimate1Rm(100, 10)).toBeCloseTo(133.33, 1)
  })

  it('returns 0 for invalid input', () => {
    expect(estimate1Rm(0, 5)).toBe(0)
    expect(estimate1Rm(100, 0)).toBe(0)
  })
})

describe('exerciseVolume / sessionVolume', () => {
  it('sums only completed, non-warmup sets', () => {
    const entry: WorkoutExerciseEntry = {
      id: 'e1',
      exerciseId: 'bench',
      sets: [
        makeSet(20, 10, { isWarmup: true }),
        makeSet(60, 10),
        makeSet(60, 8),
        makeSet(60, 5, { completed: false }),
      ],
    }
    expect(exerciseVolume(entry)).toBe(60 * 10 + 60 * 8)
  })

  it('sums volume across all exercises in a session', () => {
    const session: WorkoutSession = {
      id: 's1',
      startedAt: new Date().toISOString(),
      exercises: [
        { id: 'e1', exerciseId: 'bench', sets: [makeSet(60, 10)] },
        { id: 'e2', exerciseId: 'row', sets: [makeSet(40, 10)] },
      ],
    }
    expect(sessionVolume(session)).toBe(60 * 10 + 40 * 10)
  })
})

describe('computePersonalRecords', () => {
  it('picks the set with the highest estimated 1RM per exercise', () => {
    const sessions: WorkoutSession[] = [
      {
        id: 's1',
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T01:00:00.000Z',
        exercises: [{ id: 'e1', exerciseId: 'bench', sets: [makeSet(80, 5)] }],
      },
      {
        id: 's2',
        startedAt: '2026-01-08T00:00:00.000Z',
        finishedAt: '2026-01-08T01:00:00.000Z',
        exercises: [{ id: 'e1', exerciseId: 'bench', sets: [makeSet(85, 5)] }],
      },
    ]
    const prs = computePersonalRecords(sessions)
    expect(prs.bench.weightKg).toBe(85)
    expect(prs.bench.sessionId).toBe('s2')
  })

  it('ignores warmups and incomplete sets', () => {
    const sessions: WorkoutSession[] = [
      {
        id: 's1',
        startedAt: '2026-01-01T00:00:00.000Z',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'squat',
            sets: [makeSet(200, 5, { isWarmup: true }), makeSet(140, 5)],
          },
        ],
      },
    ]
    const prs = computePersonalRecords(sessions)
    expect(prs.squat.weightKg).toBe(140)
  })
})

describe('suggestProgression', () => {
  it('suggests more reps when below the top of the rep range', () => {
    const result = suggestProgression([{ weightKg: 60, reps: 8 }], '8-12')
    expect(result.type).toBe('increase_reps')
    expect(result.suggestedReps).toBe(9)
    expect(result.suggestedWeightKg).toBe(60)
  })

  it('suggests a weight increase once the rep range is maxed out', () => {
    const result = suggestProgression([{ weightKg: 60, reps: 12 }], '8-12')
    expect(result.type).toBe('increase_weight')
    expect(result.suggestedWeightKg).toBeGreaterThan(60)
  })

  it('returns no_data when there are no working sets', () => {
    expect(suggestProgression([]).type).toBe('no_data')
  })
})

describe('computeExerciseLevel', () => {
  it('starts at level 0 with no volume', () => {
    expect(computeExerciseLevel(0).level).toBe(0)
  })

  it('levels up as cumulative volume grows', () => {
    expect(computeExerciseLevel(600).level).toBe(1)
    expect(computeExerciseLevel(90000).level).toBe(9)
  })

  it('reports progress toward the next threshold', () => {
    const level = computeExerciseLevel(1000)
    expect(level.progressToNext).toBeGreaterThan(0)
    expect(level.progressToNext).toBeLessThan(1)
  })
})

describe('computeStreak', () => {
  it('returns 0 with no finished sessions', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const sessions: WorkoutSession[] = [
      { id: 's1', startedAt: today.toISOString(), finishedAt: today.toISOString(), exercises: [] },
      { id: 's2', startedAt: yesterday.toISOString(), finishedAt: yesterday.toISOString(), exercises: [] },
    ]
    expect(computeStreak(sessions)).toBe(2)
  })

  it('breaks the streak on a gap day', () => {
    const today = new Date()
    const threeDaysAgo = new Date(today)
    threeDaysAgo.setDate(today.getDate() - 3)
    const sessions: WorkoutSession[] = [
      { id: 's1', startedAt: today.toISOString(), finishedAt: today.toISOString(), exercises: [] },
      { id: 's2', startedAt: threeDaysAgo.toISOString(), finishedAt: threeDaysAgo.toISOString(), exercises: [] },
    ]
    expect(computeStreak(sessions)).toBe(1)
  })
})

describe('unit conversion', () => {
  it('round-trips kg <-> lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 1)
    expect(lbToKg(kgToLb(100))).toBeCloseTo(100, 6)
  })
})
