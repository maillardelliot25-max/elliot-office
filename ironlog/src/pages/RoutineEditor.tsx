import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAllExercises, useStore } from '../store/useStore'
import { Button, Card, Input, PageHeader } from '../components/ui'
import type { RoutineExercise } from '../types'

export default function RoutineEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const routines = useStore((s) => s.routines)
  const saveRoutine = useStore((s) => s.saveRoutine)
  const allExercises = useAllExercises()

  const existing = id ? routines.find((r) => r.id === id) : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [exercises, setExercises] = useState<RoutineExercise[]>(existing?.exercises ?? [])
  const [query, setQuery] = useState('')

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    return allExercises
      .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
      .filter((e) => !exercises.some((re) => re.exerciseId === e.id))
      .slice(0, 6)
  }, [allExercises, query, exercises])

  function addExercise(exerciseId: string) {
    setExercises((prev) => [...prev, { exerciseId, targetSets: 3, targetRepRange: '8-12' }])
    setQuery('')
  }

  function updateExercise(index: number, patch: Partial<RoutineExercise>) {
    setExercises((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index))
  }

  function exerciseName(exerciseId: string) {
    return allExercises.find((e) => e.id === exerciseId)?.name ?? exerciseId
  }

  function handleSave() {
    if (!name.trim() || exercises.length === 0) return
    saveRoutine({ id: existing?.id, name: name.trim(), description: description.trim() || undefined, exercises })
    navigate('/routines')
  }

  return (
    <div>
      <PageHeader title={existing ? 'Edit routine' : 'New routine'} />

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Description (optional)</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Chest, shoulders, triceps" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Add exercise</label>
          <div className="relative">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises..." />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-2 shadow-lg">
                {suggestions.map((e) => (
                  <button
                    key={e.id}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-surface"
                    onClick={() => addExercise(e.id)}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {exercises.length > 0 && (
          <div className="space-y-2">
            {exercises.map((re, i) => (
              <Card key={`${re.exerciseId}-${i}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{exerciseName(re.exerciseId)}</p>
                  <button className="text-xs text-danger" onClick={() => removeExercise(i)}>
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Sets</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={re.targetSets}
                      onChange={(e) => updateExercise(i, { targetSets: Number(e.target.value) || 1 })}
                      className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Rep range</label>
                    <input
                      value={re.targetRepRange}
                      onChange={(e) => updateExercise(i, { targetRepRange: e.target.value })}
                      className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
                      placeholder="8-12"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <Button onClick={handleSave} disabled={!name.trim() || exercises.length === 0}>
          Save routine
        </Button>
        <Button variant="ghost" onClick={() => navigate('/routines')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
