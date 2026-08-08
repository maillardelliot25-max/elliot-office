import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllExercises, useStore } from '../store/useStore'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import {
  computeExerciseLevel,
  computePersonalRecords,
  computeStreak,
  sessionVolume,
  totalVolumeByExercise,
} from '../lib/calculations'
import { formatDateShort, formatVolume } from '../lib/format'

function startOfWeek(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = (day + 6) % 7 // Monday-start week
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - diff)
  return monday
}

export default function Dashboard() {
  const navigate = useNavigate()
  const sessions = useStore((s) => s.sessions)
  const routines = useStore((s) => s.routines)
  const settings = useStore((s) => s.settings)
  const activeWorkout = useStore((s) => s.activeWorkout)
  const startWorkout = useStore((s) => s.startWorkout)
  const allExercises = useAllExercises()

  const streak = useMemo(() => computeStreak(sessions), [sessions])

  const weekVolume = useMemo(() => {
    const monday = startOfWeek()
    return sessions
      .filter((s) => s.finishedAt && new Date(s.finishedAt) >= monday)
      .reduce((sum, s) => sum + sessionVolume(s), 0)
  }, [sessions])

  const workoutsThisWeek = useMemo(() => {
    const monday = startOfWeek()
    return sessions.filter((s) => s.finishedAt && new Date(s.finishedAt) >= monday).length
  }, [sessions])

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.finishedAt)
        .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
        .slice(0, 4),
    [sessions],
  )

  const topLevels = useMemo(() => {
    const totals = totalVolumeByExercise(sessions)
    return Object.entries(totals)
      .map(([exerciseId, vol]) => ({ exerciseId, ...computeExerciseLevel(vol) }))
      .sort((a, b) => b.totalVolumeKg - a.totalVolumeKg)
      .slice(0, 3)
  }, [sessions])

  const prs = useMemo(() => computePersonalRecords(sessions), [sessions])
  const recentPrs = useMemo(
    () =>
      Object.values(prs)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3),
    [prs],
  )

  function exerciseName(id: string) {
    return allExercises.find((e) => e.id === id)?.name ?? id
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back. Here's where you stand."
        action={
          activeWorkout ? (
            <Button onClick={() => navigate('/workout')}>Resume workout</Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  startWorkout()
                  navigate('/workout')
                }}
              >
                Quick start
              </Button>
              <Button onClick={() => navigate('/routines')}>Start from routine</Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-muted">Streak</p>
          <p className="mt-1 text-2xl font-semibold">{streak} 🔥</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-muted">This week</p>
          <p className="mt-1 text-2xl font-semibold">{workoutsThisWeek}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-muted">Weekly volume</p>
          <p className="mt-1 text-2xl font-semibold">{formatVolume(weekVolume, settings.unit)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-muted">Total workouts</p>
          <p className="mt-1 text-2xl font-semibold">{sessions.length}</p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">Recent workouts</h2>
          {recentSessions.length === 0 ? (
            <EmptyState
              title="No workouts yet"
              description="Start your first workout from a routine or freestyle it."
              action={<Button onClick={() => navigate('/routines')}>Browse routines</Button>}
            />
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:border-primary/40"
                >
                  <button
                    className="flex w-full items-center justify-between text-left"
                    onClick={() => navigate(`/history/${s.id}`)}
                  >
                    <div>
                      <p className="font-medium">{s.routineName ?? 'Freestyle workout'}</p>
                      <p className="text-xs text-muted">
                        {formatDateShort(s.startedAt)} · {s.exercises.length} exercises
                      </p>
                    </div>
                    <Badge>{formatVolume(sessionVolume(s), settings.unit)}</Badge>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">Top levels</h2>
          {topLevels.length === 0 ? (
            <EmptyState title="No lifts logged yet" description="Levels build up from workout volume." />
          ) : (
            <div className="space-y-2">
              {topLevels.map((lvl) => (
                <Card key={lvl.exerciseId}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{exerciseName(lvl.exerciseId)}</p>
                    <Badge tone="primary">Lv.{lvl.level} {lvl.name}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {recentPrs.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 text-sm font-semibold text-muted">Recent PRs</h2>
              <div className="space-y-2">
                {recentPrs.map((pr) => (
                  <Card key={pr.exerciseId}>
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{exerciseName(pr.exerciseId)}</p>
                      <p className="text-sm text-muted">
                        {pr.weightKg}kg × {pr.reps}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {routines.length === 0 && sessions.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Set up your first routine"
            description="Routines let you start a workout with your planned exercises pre-loaded."
            action={<Button onClick={() => navigate('/routines/new')}>Create a routine</Button>}
          />
        </div>
      )}
    </div>
  )
}
