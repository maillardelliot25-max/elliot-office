import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'

export default function Routines() {
  const navigate = useNavigate()
  const routines = useStore((s) => s.routines)
  const deleteRoutine = useStore((s) => s.deleteRoutine)
  const startWorkout = useStore((s) => s.startWorkout)
  const activeWorkout = useStore((s) => s.activeWorkout)

  function handleStart(routine: (typeof routines)[number]) {
    if (activeWorkout && !confirm('You have a workout in progress. Discard it and start this routine?')) {
      return
    }
    startWorkout(routine)
    navigate('/workout')
  }

  return (
    <div>
      <PageHeader
        title="Routines"
        subtitle="Reusable workout templates"
        action={<Button onClick={() => navigate('/routines/new')}>New routine</Button>}
      />

      {routines.length === 0 ? (
        <EmptyState
          title="No routines yet"
          description="Build a routine once, then start a fully pre-loaded workout in one tap."
          action={<Button onClick={() => navigate('/routines/new')}>Create your first routine</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {routines.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{r.name}</p>
                  {r.description && <p className="mt-0.5 text-sm text-muted">{r.description}</p>}
                </div>
                <Badge>{r.exercises.length} exercises</Badge>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => handleStart(r)}>Start</Button>
                <Button variant="secondary" onClick={() => navigate(`/routines/${r.id}/edit`)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Delete "${r.name}"?`)) deleteRoutine(r.id)
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
