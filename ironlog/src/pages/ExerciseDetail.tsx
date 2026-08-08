import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAllExercises, useStore } from '../store/useStore'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar } from '../components/ui'
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '../lib/seedExercises'
import { computeExerciseLevel, estimate1Rm } from '../lib/calculations'
import { displayWeight, formatDateShort } from '../lib/format'

export default function ExerciseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const allExercises = useAllExercises()
  const sessions = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)

  const exercise = allExercises.find((e) => e.id === id)

  const history = useMemo(() => {
    if (!id) return []
    return sessions
      .filter((s) => s.finishedAt)
      .flatMap((s) =>
        s.exercises
          .filter((e) => e.exerciseId === id)
          .map((e) => ({ session: s, entry: e })),
      )
      .sort((a, b) => (a.session.finishedAt ?? '').localeCompare(b.session.finishedAt ?? ''))
  }, [sessions, id])

  const chartData = useMemo(
    () =>
      history.map(({ session, entry }) => {
        const best = entry.sets
          .filter((s) => s.completed && !s.isWarmup)
          .reduce((max, s) => Math.max(max, estimate1Rm(s.weightKg, s.reps)), 0)
        return {
          date: formatDateShort(session.finishedAt ?? session.startedAt),
          est1rm: Math.round(displayWeight(best, settings.unit)),
        }
      }),
    [history, settings.unit],
  )

  const totalVolumeKg = useMemo(
    () =>
      history.reduce(
        (sum, { entry }) =>
          sum +
          entry.sets
            .filter((s) => s.completed && !s.isWarmup)
            .reduce((v, s) => v + s.weightKg * s.reps, 0),
        0,
      ),
    [history],
  )
  const level = computeExerciseLevel(totalVolumeKg)

  if (!exercise) {
    return (
      <EmptyState
        title="Exercise not found"
        action={<Button onClick={() => navigate('/exercises')}>Back to library</Button>}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={exercise.name}
        subtitle={[EQUIPMENT_LABELS[exercise.equipment], ...exercise.muscleGroups.map((m) => MUSCLE_GROUP_LABELS[m])].join(' · ')}
      />

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Level {level.level} — {level.name}</p>
          <Badge tone="primary">{Math.round(level.progressToNext * 100)}% to next</Badge>
        </div>
        <div className="mt-2">
          <ProgressBar value={level.progressToNext} />
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Estimated 1RM over time</h2>
        {chartData.length < 2 ? (
          <EmptyState title="Not enough data yet" description="Log this exercise a couple more times to see a trend." />
        ) : (
          <Card className="h-56 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#8b90a0" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8b90a0" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1c1f26', border: '1px solid #262a33', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e6e8ec' }}
                />
                <Line type="monotone" dataKey="est1rm" stroke="#6ee7b7" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">History</h2>
        {history.length === 0 ? (
          <EmptyState title="No sets logged yet" />
        ) : (
          <div className="space-y-2">
            {[...history].reverse().map(({ session, entry }) => (
              <Card key={entry.id}>
                <p className="mb-2 text-xs text-muted">
                  {formatDateShort(session.finishedAt ?? session.startedAt)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {entry.sets
                    .filter((s) => s.completed)
                    .map((s) => (
                      <span
                        key={s.id}
                        className={`rounded-md px-2 py-1 text-xs ${
                          s.isWarmup ? 'bg-surface-2 text-muted' : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {displayWeight(s.weightKg, settings.unit)}
                        {settings.unit} × {s.reps}
                      </span>
                    ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
