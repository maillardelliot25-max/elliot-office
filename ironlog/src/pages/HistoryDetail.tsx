import { useNavigate, useParams } from 'react-router-dom'
import { useAllExercises, useStore } from '../store/useStore'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { exerciseVolume, sessionVolume } from '../lib/calculations'
import { displayWeight, formatDate, formatDuration, formatVolume } from '../lib/format'

export default function HistoryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sessions = useStore((s) => s.sessions)
  const deleteSession = useStore((s) => s.deleteSession)
  const settings = useStore((s) => s.settings)
  const allExercises = useAllExercises()

  const session = sessions.find((s) => s.id === id)

  if (!session) {
    return (
      <EmptyState title="Workout not found" action={<Button onClick={() => navigate('/history')}>Back to history</Button>} />
    )
  }

  return (
    <div>
      <PageHeader
        title={session.routineName ?? 'Freestyle workout'}
        subtitle={`${formatDate(session.startedAt)} · ${formatDuration(session.startedAt, session.finishedAt)}`}
        action={
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete this workout?')) {
                deleteSession(session.id)
                navigate('/history')
              }
            }}
          >
            Delete
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Total volume</p>
          <Badge tone="primary">{formatVolume(sessionVolume(session), settings.unit)}</Badge>
        </div>
      </Card>

      <div className="space-y-3">
        {session.exercises.map((entry) => (
          <Card key={entry.id}>
            <div className="flex items-center justify-between">
              <p className="font-medium">{allExercises.find((e) => e.id === entry.exerciseId)?.name ?? entry.exerciseId}</p>
              <span className="text-xs text-muted">{formatVolume(exerciseVolume(entry), settings.unit)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.sets
                .filter((s) => s.completed)
                .map((s) => (
                  <span
                    key={s.id}
                    className={`rounded-md px-2 py-1 text-xs ${s.isWarmup ? 'bg-surface-2 text-muted' : 'bg-primary/10 text-primary'}`}
                  >
                    {displayWeight(s.weightKg, settings.unit)}
                    {settings.unit} × {s.reps}
                  </span>
                ))}
            </div>
          </Card>
        ))}
      </div>

      {session.notes && (
        <Card className="mt-4">
          <p className="text-xs font-medium text-muted">Notes</p>
          <p className="mt-1 text-sm">{session.notes}</p>
        </Card>
      )}
    </div>
  )
}
