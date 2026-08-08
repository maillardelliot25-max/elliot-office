import type { PersonalRecord, WorkoutExerciseEntry, WorkoutSession } from '../types'

/** Epley formula: estimated 1-rep max from a completed set. */
export function estimate1Rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

/** Total working-set volume (weight x reps) for one exercise entry. */
export function exerciseVolume(entry: WorkoutExerciseEntry): number {
  return entry.sets
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
}

/** Total working-set volume across an entire session. */
export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0)
}

/**
 * Scans all sessions and returns the best estimated-1RM set per exercise,
 * i.e. an auto-detected personal record.
 */
export function computePersonalRecords(
  sessions: WorkoutSession[],
): Record<string, PersonalRecord> {
  const records: Record<string, PersonalRecord> = {}

  for (const session of sessions) {
    for (const entry of session.exercises) {
      for (const set of entry.sets) {
        if (!set.completed || set.isWarmup || set.weightKg <= 0 || set.reps <= 0) {
          continue
        }
        const est = estimate1Rm(set.weightKg, set.reps)
        const current = records[entry.exerciseId]
        if (!current || est > current.estimated1RmKg) {
          records[entry.exerciseId] = {
            exerciseId: entry.exerciseId,
            weightKg: set.weightKg,
            reps: set.reps,
            estimated1RmKg: est,
            date: session.finishedAt ?? session.startedAt,
            sessionId: session.id,
          }
        }
      }
    }
  }

  return records
}

export interface ProgressiveOverloadSuggestion {
  type: 'increase_weight' | 'increase_reps' | 'hold' | 'no_data'
  message: string
  suggestedWeightKg?: number
  suggestedReps?: number
}

/**
 * Suggests the next progression step for an exercise based on the most
 * recent completed working sets, mirroring the "small weight increase or
 * extra rep" logic common to auto-progression gym apps.
 */
export function suggestProgression(
  lastSets: { weightKg: number; reps: number }[],
  targetRepRange: string = '8-12',
): ProgressiveOverloadSuggestion {
  const working = lastSets.filter((s) => s.weightKg > 0 && s.reps > 0)
  if (working.length === 0) {
    return { type: 'no_data', message: 'Log a set to get a suggestion.' }
  }

  const [, repMaxRaw] = targetRepRange.split('-')
  const repMax = Number(repMaxRaw) || 12
  const top = working.reduce((best, s) => (s.weightKg >= best.weightKg ? s : best))

  if (top.reps >= repMax) {
    const bump = top.weightKg >= 20 ? top.weightKg * 0.025 : 1.25
    const suggestedWeightKg = Math.round((top.weightKg + bump) * 4) / 4
    return {
      type: 'increase_weight',
      message: `You hit the top of your rep range — try ${suggestedWeightKg} kg next time.`,
      suggestedWeightKg,
      suggestedReps: Number(targetRepRange.split('-')[0]) || top.reps,
    }
  }

  return {
    type: 'increase_reps',
    message: `Aim for ${top.reps + 1} reps at ${top.weightKg} kg next time.`,
    suggestedWeightKg: top.weightKg,
    suggestedReps: top.reps + 1,
  }
}

const LEVEL_THRESHOLDS_KG = [0, 500, 1500, 3500, 7000, 13000, 22000, 35000, 55000, 80000]
export const LEVEL_NAMES = [
  'Untrained',
  'Novice',
  'Beginner',
  'Intermediate',
  'Proficient',
  'Advanced',
  'Skilled',
  'Expert',
  'Elite',
  'Legendary',
]

export interface ExerciseLevel {
  level: number
  name: string
  totalVolumeKg: number
  progressToNext: number
  nextThresholdKg: number | null
}

/**
 * Turns cumulative lifetime volume for an exercise into a simple level/rank,
 * used as a transparent, formula-based stand-in for AI-driven ranking.
 */
export function computeExerciseLevel(totalVolumeKg: number): ExerciseLevel {
  let level = 0
  for (let i = LEVEL_THRESHOLDS_KG.length - 1; i >= 0; i--) {
    if (totalVolumeKg >= LEVEL_THRESHOLDS_KG[i]) {
      level = i
      break
    }
  }

  const nextThreshold = LEVEL_THRESHOLDS_KG[level + 1] ?? null
  const currentThreshold = LEVEL_THRESHOLDS_KG[level]
  const progressToNext = nextThreshold
    ? (totalVolumeKg - currentThreshold) / (nextThreshold - currentThreshold)
    : 1

  return {
    level,
    name: LEVEL_NAMES[level],
    totalVolumeKg,
    progressToNext: Math.min(1, Math.max(0, progressToNext)),
    nextThresholdKg: nextThreshold,
  }
}

export function totalVolumeByExercise(
  sessions: WorkoutSession[],
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const session of sessions) {
    for (const entry of session.exercises) {
      totals[entry.exerciseId] = (totals[entry.exerciseId] ?? 0) + exerciseVolume(entry)
    }
  }
  return totals
}

/** Current consecutive-day streak of workouts, counting today or yesterday as the anchor. */
export function computeStreak(sessions: WorkoutSession[]): number {
  const days = new Set(
    sessions
      .filter((s) => s.finishedAt)
      .map((s) => new Date(s.finishedAt!).toISOString().slice(0, 10)),
  )
  if (days.size === 0) return 0

  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  // Allow the streak to still count if today has no workout yet.
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

export function kgToLb(kg: number): number {
  return kg * 2.2046226218
}

export function lbToKg(lb: number): number {
  return lb / 2.2046226218
}
