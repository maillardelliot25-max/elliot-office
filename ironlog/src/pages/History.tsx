import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllExercises, useStore } from '../store/useStore'
import { Badge, Card, EmptyState, PageHeader } from '../components/ui'
import { sessionVolume } from '../lib/calculations'
import { formatDate, formatDuration, formatVolume } from '../lib/format'

export default function History() {
  const navigate = useNavigate()
  const sessions = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)
  const allExercises = useAllExercises()

  const sorted = useMemo(
    () => [...sessions].filter((s) => s.finishedAt).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')),
    [sessions],
  )

  return (
    <div>
      <PageHeader title="History" subtitle={`${sorted.length} completed workouts`} />

      {sorted.length === 0 ? (
        <EmptyState title="No workouts logged yet" description="Finished workouts will show up here." />
      ) : (
        <div className="space-y-2">
          {sorted.map((session) => (
            <Card key={session.id} className="cursor-pointer hover:border-primary/40">
              <button className="w-full text-left" onClick={() => navigate(`/history/${session.id}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{session.routineName ?? 'Freestyle workout'}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(session.startedAt)} · {formatDuration(session.startedAt, session.finishedAt)}
                    </p>
                  </div>
                  <Badge>{formatVolume(sessionVolume(session), settings.unit)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {session.exercises.slice(0, 5).map((e) => (
                    <span key={e.id} className="text-xs text-muted">
                      {allExercises.find((ex) => ex.id === e.exerciseId)?.name ?? e.exerciseId}
                      {e !== session.exercises[Math.min(4, session.exercises.length - 1)] ? ',' : ''}
                    </span>
                  ))}
                  {session.exercises.length > 5 && (
                    <span className="text-xs text-muted">+{session.exercises.length - 5} more</span>
                  )}
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
