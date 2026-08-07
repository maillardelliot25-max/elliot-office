import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { makeId } from '../lib/id'
import { SEED_EXERCISES } from '../lib/seedExercises'
import type {
  BodyMeasurement,
  Exercise,
  Routine,
  RoutineExercise,
  Settings,
  WorkoutExerciseEntry,
  WorkoutSession,
  WorkoutSetEntry,
} from '../types'

interface StoreState {
  customExercises: Exercise[]
  routines: Routine[]
  sessions: WorkoutSession[]
  measurements: BodyMeasurement[]
  settings: Settings
  activeWorkout: WorkoutSession | null

  // Exercises
  addCustomExercise: (exercise: Omit<Exercise, 'id' | 'isCustom'>) => Exercise

  // Routines
  saveRoutine: (routine: Omit<Routine, 'id' | 'createdAt'> & { id?: string }) => Routine
  deleteRoutine: (id: string) => void

  // Active workout
  startWorkout: (routine?: Routine) => void
  addExerciseToWorkout: (exerciseId: string) => void
  removeExerciseFromWorkout: (workoutExerciseId: string) => void
  addSet: (workoutExerciseId: string, set?: Partial<WorkoutSetEntry>) => void
  updateSet: (
    workoutExerciseId: string,
    setId: string,
    patch: Partial<WorkoutSetEntry>,
  ) => void
  removeSet: (workoutExerciseId: string, setId: string) => void
  finishWorkout: (notes?: string, bodyweightKg?: number) => void
  discardWorkout: () => void

  // History
  deleteSession: (id: string) => void

  // Measurements
  addMeasurement: (measurement: Omit<BodyMeasurement, 'id'>) => void
  deleteMeasurement: (id: string) => void

  // Settings
  updateSettings: (patch: Partial<Settings>) => void

  // Import / export
  exportData: () => string
  importData: (json: string) => void
  resetAllData: () => void
}

const defaultSettings: Settings = {
  unit: 'kg',
  restTimerSeconds: 90,
}

function emptySet(overrides: Partial<WorkoutSetEntry> = {}): WorkoutSetEntry {
  return {
    id: makeId(),
    weightKg: overrides.weightKg ?? 0,
    reps: overrides.reps ?? 0,
    rpe: overrides.rpe,
    completed: overrides.completed ?? false,
    isWarmup: overrides.isWarmup ?? false,
  }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      customExercises: [],
      routines: [],
      sessions: [],
      measurements: [],
      settings: defaultSettings,
      activeWorkout: null,

      addCustomExercise: (exercise) => {
        const newExercise: Exercise = { ...exercise, id: makeId(), isCustom: true }
        set((s) => ({ customExercises: [...s.customExercises, newExercise] }))
        return newExercise
      },

      saveRoutine: (routine) => {
        const existing = routine.id
          ? get().routines.find((r) => r.id === routine.id)
          : undefined
        const saved: Routine = existing
          ? { ...existing, ...routine, id: existing.id }
          : { ...routine, id: makeId(), createdAt: new Date().toISOString() }

        set((s) => ({
          routines: existing
            ? s.routines.map((r) => (r.id === saved.id ? saved : r))
            : [...s.routines, saved],
        }))
        return saved
      },

      deleteRoutine: (id) => set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),

      startWorkout: (routine) => {
        const exercises: WorkoutExerciseEntry[] = (routine?.exercises ?? []).map(
          (re: RoutineExercise) => ({
            id: makeId(),
            exerciseId: re.exerciseId,
            sets: Array.from({ length: re.targetSets }, () => emptySet()),
          }),
        )
        set({
          activeWorkout: {
            id: makeId(),
            routineId: routine?.id,
            routineName: routine?.name,
            startedAt: new Date().toISOString(),
            exercises,
          },
        })
      },

      addExerciseToWorkout: (exerciseId) => {
        set((s) => {
          if (!s.activeWorkout) return s
          const entry: WorkoutExerciseEntry = {
            id: makeId(),
            exerciseId,
            sets: [emptySet()],
          }
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: [...s.activeWorkout.exercises, entry],
            },
          }
        })
      },

      removeExerciseFromWorkout: (workoutExerciseId) => {
        set((s) => {
          if (!s.activeWorkout) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.filter((e) => e.id !== workoutExerciseId),
            },
          }
        })
      },

      addSet: (workoutExerciseId, patch) => {
        set((s) => {
          if (!s.activeWorkout) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.map((e) =>
                e.id === workoutExerciseId
                  ? { ...e, sets: [...e.sets, emptySet(patch)] }
                  : e,
              ),
            },
          }
        })
      },

      updateSet: (workoutExerciseId, setId, patch) => {
        set((s) => {
          if (!s.activeWorkout) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.map((e) =>
                e.id === workoutExerciseId
                  ? {
                      ...e,
                      sets: e.sets.map((st) => (st.id === setId ? { ...st, ...patch } : st)),
                    }
                  : e,
              ),
            },
          }
        })
      },

      removeSet: (workoutExerciseId, setId) => {
        set((s) => {
          if (!s.activeWorkout) return s
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.map((e) =>
                e.id === workoutExerciseId
                  ? { ...e, sets: e.sets.filter((st) => st.id !== setId) }
                  : e,
              ),
            },
          }
        })
      },

      finishWorkout: (notes, bodyweightKg) => {
        const active = get().activeWorkout
        if (!active) return
        const finished: WorkoutSession = {
          ...active,
          finishedAt: new Date().toISOString(),
          notes,
          bodyweightKg,
          exercises: active.exercises.filter((e) => e.sets.some((s) => s.completed)),
        }
        set((s) => ({ sessions: [...s.sessions, finished], activeWorkout: null }))
      },

      discardWorkout: () => set({ activeWorkout: null }),

      deleteSession: (id) =>
        set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) })),

      addMeasurement: (measurement) =>
        set((s) => ({
          measurements: [...s.measurements, { ...measurement, id: makeId() }].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        })),

      deleteMeasurement: (id) =>
        set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      exportData: () => {
        const { customExercises, routines, sessions, measurements, settings } = get()
        return JSON.stringify(
          { customExercises, routines, sessions, measurements, settings, exportedAt: new Date().toISOString() },
          null,
          2,
        )
      },

      importData: (json) => {
        const data = JSON.parse(json)
        set({
          customExercises: data.customExercises ?? [],
          routines: data.routines ?? [],
          sessions: data.sessions ?? [],
          measurements: data.measurements ?? [],
          settings: { ...defaultSettings, ...(data.settings ?? {}) },
        })
      },

      resetAllData: () =>
        set({
          customExercises: [],
          routines: [],
          sessions: [],
          measurements: [],
          settings: defaultSettings,
          activeWorkout: null,
        }),
    }),
    { name: 'ironlog-data' },
  ),
)

/**
 * Seed + custom exercises merged, memoized against `customExercises` only.
 * Recomputing this array inline inside a zustand selector (rather than via
 * useMemo) would return a new reference on every render and infinite-loop.
 */
export function useAllExercises(): Exercise[] {
  const customExercises = useStore((s) => s.customExercises)
  return useMemo(() => [...SEED_EXERCISES, ...customExercises], [customExercises])
}
