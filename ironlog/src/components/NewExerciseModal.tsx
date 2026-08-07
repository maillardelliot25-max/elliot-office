import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Button, Input } from './ui'
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '../lib/seedExercises'
import type { Equipment, MuscleGroup } from '../types'

export default function NewExerciseModal({ onClose }: { onClose: () => void }) {
  const addCustomExercise = useStore((s) => s.addCustomExercise)
  const [name, setName] = useState('')
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([])

  function toggleGroup(mg: MuscleGroup) {
    setMuscleGroups((prev) => (prev.includes(mg) ? prev.filter((g) => g !== mg) : [...prev, mg]))
  }

  function submit() {
    if (!name.trim() || muscleGroups.length === 0) return
    addCustomExercise({ name: name.trim(), equipment, muscleGroups })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl">
        <h2 className="text-lg font-semibold">New exercise</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable Pullover" autoFocus />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Equipment</label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as Equipment)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            >
              {Object.entries(EQUIPMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Muscle groups</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MUSCLE_GROUP_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleGroup(key as MuscleGroup)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    muscleGroups.includes(key as MuscleGroup)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || muscleGroups.length === 0}>
            Add exercise
          </Button>
        </div>
      </div>
    </div>
  )
}
