import type { Equipment, Exercise, MuscleGroup } from '../types'

function ex(
  name: string,
  muscleGroups: MuscleGroup[],
  equipment: Equipment,
): Exercise {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    muscleGroups,
    equipment,
    isCustom: false,
  }
}

export const SEED_EXERCISES: Exercise[] = [
  // Chest
  ex('Barbell Bench Press', ['chest', 'triceps'], 'barbell'),
  ex('Incline Barbell Bench Press', ['chest', 'shoulders'], 'barbell'),
  ex('Dumbbell Bench Press', ['chest', 'triceps'], 'dumbbell'),
  ex('Incline Dumbbell Press', ['chest', 'shoulders'], 'dumbbell'),
  ex('Dumbbell Fly', ['chest'], 'dumbbell'),
  ex('Cable Fly', ['chest'], 'cable'),
  ex('Push-Up', ['chest', 'triceps', 'core'], 'bodyweight'),
  ex('Chest Dip', ['chest', 'triceps'], 'bodyweight'),
  ex('Machine Chest Press', ['chest', 'triceps'], 'machine'),

  // Back
  ex('Deadlift', ['back', 'legs', 'glutes'], 'barbell'),
  ex('Pull-Up', ['back', 'biceps'], 'bodyweight'),
  ex('Chin-Up', ['back', 'biceps'], 'bodyweight'),
  ex('Barbell Row', ['back', 'biceps'], 'barbell'),
  ex('Pendlay Row', ['back'], 'barbell'),
  ex('Dumbbell Row', ['back', 'biceps'], 'dumbbell'),
  ex('Lat Pulldown', ['back', 'biceps'], 'cable'),
  ex('Seated Cable Row', ['back', 'biceps'], 'cable'),
  ex('T-Bar Row', ['back'], 'machine'),
  ex('Face Pull', ['back', 'shoulders'], 'cable'),

  // Shoulders
  ex('Overhead Press', ['shoulders', 'triceps'], 'barbell'),
  ex('Seated Dumbbell Shoulder Press', ['shoulders', 'triceps'], 'dumbbell'),
  ex('Arnold Press', ['shoulders'], 'dumbbell'),
  ex('Lateral Raise', ['shoulders'], 'dumbbell'),
  ex('Cable Lateral Raise', ['shoulders'], 'cable'),
  ex('Front Raise', ['shoulders'], 'dumbbell'),
  ex('Rear Delt Fly', ['shoulders', 'back'], 'dumbbell'),
  ex('Machine Shoulder Press', ['shoulders', 'triceps'], 'machine'),
  ex('Shrug', ['shoulders', 'back'], 'dumbbell'),

  // Biceps
  ex('Barbell Curl', ['biceps'], 'barbell'),
  ex('Dumbbell Curl', ['biceps'], 'dumbbell'),
  ex('Hammer Curl', ['biceps'], 'dumbbell'),
  ex('Preacher Curl', ['biceps'], 'barbell'),
  ex('Cable Curl', ['biceps'], 'cable'),
  ex('Concentration Curl', ['biceps'], 'dumbbell'),

  // Triceps
  ex('Close-Grip Bench Press', ['triceps', 'chest'], 'barbell'),
  ex('Triceps Pushdown', ['triceps'], 'cable'),
  ex('Overhead Triceps Extension', ['triceps'], 'dumbbell'),
  ex('Skull Crusher', ['triceps'], 'barbell'),
  ex('Bench Dip', ['triceps', 'chest'], 'bodyweight'),

  // Legs
  ex('Back Squat', ['legs', 'glutes', 'core'], 'barbell'),
  ex('Front Squat', ['legs', 'glutes', 'core'], 'barbell'),
  ex('Leg Press', ['legs', 'glutes'], 'machine'),
  ex('Romanian Deadlift', ['legs', 'glutes', 'back'], 'barbell'),
  ex('Walking Lunge', ['legs', 'glutes'], 'dumbbell'),
  ex('Bulgarian Split Squat', ['legs', 'glutes'], 'dumbbell'),
  ex('Leg Extension', ['legs'], 'machine'),
  ex('Leg Curl', ['legs'], 'machine'),
  ex('Standing Calf Raise', ['legs'], 'machine'),
  ex('Seated Calf Raise', ['legs'], 'machine'),
  ex('Hip Thrust', ['glutes', 'legs'], 'barbell'),
  ex('Goblet Squat', ['legs', 'glutes'], 'dumbbell'),

  // Core
  ex('Plank', ['core'], 'bodyweight'),
  ex('Hanging Leg Raise', ['core'], 'bodyweight'),
  ex('Cable Crunch', ['core'], 'cable'),
  ex('Ab Wheel Rollout', ['core'], 'other'),
  ex('Russian Twist', ['core'], 'bodyweight'),

  // Cardio / Full body
  ex('Treadmill Run', ['cardio'], 'other'),
  ex('Rowing Machine', ['cardio', 'back'], 'machine'),
  ex('Kettlebell Swing', ['full_body', 'glutes'], 'kettlebell'),
  ex('Burpee', ['full_body', 'cardio'], 'bodyweight'),
  ex('Farmer Carry', ['full_body', 'core'], 'dumbbell'),
]

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
  cardio: 'Cardio',
  full_body: 'Full Body',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  other: 'Other',
}
