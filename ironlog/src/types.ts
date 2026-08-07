export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'cardio'
  | 'full_body'

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other'

export interface Exercise {
  id: string
  name: string
  muscleGroups: MuscleGroup[]
  equipment: Equipment
  isCustom: boolean
  notes?: string
}

export interface WorkoutSetEntry {
  id: string
  weightKg: number
  reps: number
  rpe?: number
  completed: boolean
  isWarmup: boolean
}

export interface WorkoutExerciseEntry {
  id: string
  exerciseId: string
  sets: WorkoutSetEntry[]
}

export interface WorkoutSession {
  id: string
  routineId?: string
  routineName?: string
  startedAt: string
  finishedAt?: string
  exercises: WorkoutExerciseEntry[]
  notes?: string
  bodyweightKg?: number
}

export interface RoutineExercise {
  exerciseId: string
  targetSets: number
  targetRepRange: string
}

export interface Routine {
  id: string
  name: string
  description?: string
  exercises: RoutineExercise[]
  createdAt: string
}

export interface BodyMeasurement {
  id: string
  date: string
  weightKg?: number
  bodyFatPct?: number
  notes?: string
  photoDataUrl?: string
}

export type WeightUnit = 'kg' | 'lb'

export interface Settings {
  unit: WeightUnit
  restTimerSeconds: number
}

export interface PersonalRecord {
  exerciseId: string
  weightKg: number
  reps: number
  estimated1RmKg: number
  date: string
  sessionId: string
}
