import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllExercises, useStore } from '../store/useStore'
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../components/ui'
import RestTimerBar from '../components/RestTimerBar'
import { useRestTimer } from '../hooks/useRestTimer'
import { suggestProgression } from '../lib/calculations'
import { displayWeight, formatDuration, weightToKg } from '../lib/format'
import type { WorkoutSetEntry } from '../types'

export default function Workout() {
  const navigate = useNavigate()
  const activeWorkout = useStore((s) => s.activeWorkout)
  const sessions = useStore((s) => s.sessions)
  const routines = useStore((s) => s.routines)
  const settings = useStore((s) => s.settings)
  const allExercises = useAllExercises()

  const addExerciseToWorkout = useStore((s) => s.addExerciseToWorkout)
  const removeExerciseFromWorkout = useStore((s) => s.removeExerciseFromWorkout)
  const addSet = useStore((s) => s.addSet)
  const updateSet = useStore((s) => s.updateSet)
  const removeSet = useStore((s) => s.removeSet)
  const finishWorkout = useStore((s) => s.finishWorkout)
  const discardWorkout = useStore((s) => s.discardWorkout)

  const timer = useRestTimer()
  const [query, setQuery] = useState('')

  const routine = activeWorkout?.routineId ? routines.find((r) => r.id === activeWorkout.routineId) : undefined

  const suggestions = useMemo(() => {
    if (!query.trim() || !activeWorkout) return []
    return allExercises
      .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
      .filter((e) => !activeWorkout.exercises.some((we) => we.exerciseId === e.id))
      .slice(0, 6)
  }, [allExercises, query, activeWorkout])

  function lastPerformance(exerciseId: string) {
    const past = [...sessions]
      .filter((s) => s.finishedAt && s.exercises.some((e) => e.exerciseId === exerciseId))
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0]
    if (!past) return null
    const entry = past.exercises.find((e) => e.exerciseId === exerciseId)!
    const workSets = entry.sets.filter((s) => s.completed && !s.isWarmup)
    if (workSets.length === 0) return null
    return workSets
  }

  function handleToggleComplete(workoutExerciseId: string, set: WorkoutSetEntry) {
    const nowComplete = !set.completed
    updateSet(workoutExerciseId, set.id, { completed: nowComplete })
    if (nowComplete && !set.isWarmup) {
      timer.start(settings.restTimerSeconds)
    }
  }

  function handleFinish() {
    if (!confirm('Finish this workout?')) return
    finishWorkout()
    navigate('/')
  }

  function handleDiscard() {
    if (!confirm('Discard this workout? This cannot be undone.')) return
    discardWorkout()
    navigate('/')
  }

  if (!activeWorkout) {
    return (
      <EmptyState
        title="No active workout"
        description="Start one from a routine or quick-start a freestyle session."
        action={<Button onClick={() => navigate('/routines')}>Browse routines</Button>}
      />
    )
  }

  return (
    <div className="pb-24">
      <PageHeader
        title={activeWorkout.routineName ?? 'Freestyle workout'}
        subtitle={`Started ${formatDuration(activeWorkout.startedAt)} ago`}
        action={
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleDiscard}>
              Discard
            </Button>
            <Button onClick={handleFinish}>Finish</Button>
          </div>
        }
      />

      <div className="space-y-4">
        {activeWorkout.exercises.map((entry) => {
          const exercise = allExercises.find((e) => e.id === entry.exerciseId)
          const target = routine?.exercises.find((re) => re.exerciseId === entry.exerciseId)
          const prevSets = lastPerformance(entry.exerciseId)
          const completedSets = entry.sets.filter((s) => s.completed && !s.isWarmup)
          const suggestion = suggestProgression(
            (prevSets ?? []).map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
            target?.targetRepRange,
          )

          return (
            <Card key={entry.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{exercise?.name ?? 'Unknown exercise'}</p>
                  {prevSets && (
                    <p className="mt-0.5 text-xs text-muted">
                      Last time: {prevSets.map((s) => `${displayWeight(s.weightKg, settings.unit)}${settings.unit}×${s.reps}`).join(', ')}
                    </p>
                  )}
                  {suggestion.type !== 'no_data' && (
                    <p className="mt-0.5 text-xs text-primary">{suggestion.message}</p>
                  )}
                </div>
                <button
                  className="text-xs text-danger"
                  onClick={() => removeExerciseFromWorkout(entry.id)}
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="grid grid-cols-[1.5rem_1fr_1fr_2.5rem_2rem_1.5rem] items-center gap-2 px-1 text-[11px] font-medium text-muted">
                  <span>#</span>
                  <span>Weight ({settings.unit})</span>
                  <span>Reps</span>
                  <span>W</span>
                  <span />
                  <span />
                </div>
                {entry.sets.map((set, idx) => (
                  <div
                    key={set.id}
                    className={`grid grid-cols-[1.5rem_1fr_1fr_2.5rem_2rem_1.5rem] items-center gap-2 rounded-lg px-1 py-1 ${
                      set.completed ? 'bg-primary/5' : ''
                    }`}
                  >
                    <span className="text-xs text-muted">{idx + 1}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={displayWeight(set.weightKg, settings.unit) || ''}
                      onChange={(e) =>
                        updateSet(entry.id, set.id, {
                          weightKg: weightToKg(Number(e.target.value) || 0, settings.unit),
                        })
                      }
                      className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.reps || ''}
                      onChange={(e) => updateSet(entry.id, set.id, { reps: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => updateSet(entry.id, set.id, { isWarmup: !set.isWarmup })}
                      className={`rounded-md py-1.5 text-xs font-semibold ${
                        set.isWarmup ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      W
                    </button>
                    <button
                      onClick={() => handleToggleComplete(entry.id, set)}
                      className={`flex items-center justify-center rounded-md py-1.5 ${
                        set.completed ? 'bg-primary text-bg' : 'bg-surface-2 text-muted'
                      }`}
                      aria-label="Mark set complete"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => removeSet(entry.id, set.id)}
                      className="flex items-center justify-center rounded-md py-1.5 text-muted hover:text-danger"
                      aria-label="Delete set"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button
                  className="text-xs font-medium text-primary"
                  onClick={() => {
                    const last = entry.sets[entry.sets.length - 1]
                    addSet(entry.id, last ? { weightKg: last.weightKg, reps: last.reps } : undefined)
                  }}
                >
                  + Add set
                </button>
                {completedSets.length > 0 && (
                  <Badge tone="primary">{completedSets.length} sets done</Badge>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="relative mt-4">
        <Input placeholder="Add exercise..." value={query} onChange={(e) => setQuery(e.target.value)} />
        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-2 shadow-lg">
            {suggestions.map((e) => (
              <button
                key={e.id}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface"
                onClick={() => {
                  addExerciseToWorkout(e.id)
                  setQuery('')
                }}
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <RestTimerBar
        secondsLeft={timer.secondsLeft}
        isRunning={timer.isRunning}
        onAdd={timer.addSeconds}
        onStop={timer.stop}
      />
    </div>
  )
}
