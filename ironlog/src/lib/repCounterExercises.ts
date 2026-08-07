import type { RepThresholds } from './repCounter'

/** MoveNet keypoint names relevant to angle-based rep counting. */
export type KeypointName =
  | 'left_shoulder'
  | 'right_shoulder'
  | 'left_elbow'
  | 'right_elbow'
  | 'left_wrist'
  | 'right_wrist'
  | 'left_hip'
  | 'right_hip'
  | 'left_knee'
  | 'right_knee'
  | 'left_ankle'
  | 'right_ankle'

export interface JointTriplet {
  a: KeypointName
  b: KeypointName
  c: KeypointName
}

export interface RepCounterExerciseConfig extends RepThresholds {
  exerciseId: string
  label: string
  /** Angle tracked at this joint (vertex), tried on the left side first. */
  left: JointTriplet
  /** Same joint on the right side, used as a fallback if the left side isn't confidently visible. */
  right: JointTriplet
  instructions: string
}

export const REP_COUNTER_EXERCISES: RepCounterExerciseConfig[] = [
  {
    exerciseId: 'back-squat',
    label: 'Back Squat',
    left: { a: 'left_hip', b: 'left_knee', c: 'left_ankle' },
    right: { a: 'right_hip', b: 'right_knee', c: 'right_ankle' },
    extendedThreshold: 160,
    contractedThreshold: 110,
    instructions: 'Stand side-on to the camera so your hip, knee, and ankle are all visible.',
  },
  {
    exerciseId: 'goblet-squat',
    label: 'Goblet Squat',
    left: { a: 'left_hip', b: 'left_knee', c: 'left_ankle' },
    right: { a: 'right_hip', b: 'right_knee', c: 'right_ankle' },
    extendedThreshold: 160,
    contractedThreshold: 110,
    instructions: 'Stand side-on to the camera so your hip, knee, and ankle are all visible.',
  },
  {
    exerciseId: 'push-up',
    label: 'Push-Up',
    left: { a: 'left_shoulder', b: 'left_elbow', c: 'left_wrist' },
    right: { a: 'right_shoulder', b: 'right_elbow', c: 'right_wrist' },
    extendedThreshold: 155,
    contractedThreshold: 95,
    instructions: 'Position the camera side-on at floor level so your shoulder, elbow, and wrist are visible.',
  },
  {
    exerciseId: 'barbell-curl',
    label: 'Barbell Curl',
    left: { a: 'left_shoulder', b: 'left_elbow', c: 'left_wrist' },
    right: { a: 'right_shoulder', b: 'right_elbow', c: 'right_wrist' },
    extendedThreshold: 150,
    contractedThreshold: 60,
    instructions: 'Face the camera so your shoulder, elbow, and wrist are visible.',
  },
  {
    exerciseId: 'dumbbell-curl',
    label: 'Dumbbell Curl',
    left: { a: 'left_shoulder', b: 'left_elbow', c: 'left_wrist' },
    right: { a: 'right_shoulder', b: 'right_elbow', c: 'right_wrist' },
    extendedThreshold: 150,
    contractedThreshold: 60,
    instructions: 'Face the camera so your shoulder, elbow, and wrist are visible.',
  },
  {
    exerciseId: 'hammer-curl',
    label: 'Hammer Curl',
    left: { a: 'left_shoulder', b: 'left_elbow', c: 'left_wrist' },
    right: { a: 'right_shoulder', b: 'right_elbow', c: 'right_wrist' },
    extendedThreshold: 150,
    contractedThreshold: 60,
    instructions: 'Face the camera so your shoulder, elbow, and wrist are visible.',
  },
]

export function getRepCounterConfig(exerciseId: string): RepCounterExerciseConfig | undefined {
  return REP_COUNTER_EXERCISES.find((c) => c.exerciseId === exerciseId)
}
