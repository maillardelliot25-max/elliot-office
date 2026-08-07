import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAllExercises, useStore } from '../store/useStore'
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../components/ui'
import { computeExerciseLevel, computePersonalRecords, totalVolumeByExercise } from '../lib/calculations'
import { displayWeight, formatDate, formatDateShort } from '../lib/format'

export default function Progress() {
  const navigate = useNavigate()
  const sessions = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)
  const allExercises = useAllExercises()
  const measurements = useStore((s) => s.measurements)
  const addMeasurement = useStore((s) => s.addMeasurement)
  const deleteMeasurement = useStore((s) => s.deleteMeasurement)

  const [weightInput, setWeightInput] = useState('')
  const [bodyFatInput, setBodyFatInput] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>()

  const prs = useMemo(() => computePersonalRecords(sessions), [sessions])
  const prList = useMemo(
    () => Object.values(prs).sort((a, b) => b.date.localeCompare(a.date)),
    [prs],
  )

  const levels = useMemo(() => {
    const totals = totalVolumeByExercise(sessions)
    return Object.entries(totals)
      .map(([exerciseId, vol]) => ({ exerciseId, ...computeExerciseLevel(vol) }))
      .sort((a, b) => b.level - a.level || b.totalVolumeKg - a.totalVolumeKg)
  }, [sessions])

  const measurementChart = useMemo(
    () =>
      measurements
        .filter((m) => m.weightKg !== undefined)
        .map((m) => ({ date: formatDateShort(m.date), weight: displayWeight(m.weightKg!, settings.unit) })),
    [measurements, settings.unit],
  )

  function exerciseName(id: string) {
    return allExercises.find((e) => e.id === id)?.name ?? id
  }

  function handlePhotoChange(file: File | undefined) {
    if (!file) {
      setPhotoDataUrl(undefined)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhotoDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleAddMeasurement() {
    const weightKg = weightInput ? (settings.unit === 'kg' ? Number(weightInput) : Number(weightInput) / 2.2046226218) : undefined
    if (weightKg === undefined && !bodyFatInput && !photoDataUrl) return
    addMeasurement({
      date: new Date().toISOString(),
      weightKg,
      bodyFatPct: bodyFatInput ? Number(bodyFatInput) : undefined,
      photoDataUrl,
    })
    setWeightInput('')
    setBodyFatInput('')
    setPhotoDataUrl(undefined)
  }

  return (
    <div>
      <PageHeader title="Progress" subtitle="Personal records, levels, and body tracking" />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Exercise levels</h2>
        {levels.length === 0 ? (
          <EmptyState title="No lifts logged yet" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {levels.map((lvl) => (
              <Card key={lvl.exerciseId} className="cursor-pointer hover:border-primary/40">
                <button className="w-full text-left" onClick={() => navigate(`/exercises/${lvl.exerciseId}`)}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{exerciseName(lvl.exerciseId)}</p>
                    <Badge tone="primary">Lv.{lvl.level}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{lvl.name}</p>
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">Personal records</h2>
        {prList.length === 0 ? (
          <EmptyState title="No personal records yet" description="Your best set per exercise shows up here automatically." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {prList.map((pr) => (
              <Card key={pr.exerciseId}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{exerciseName(pr.exerciseId)}</p>
                  <span className="text-xs text-muted">{formatDate(pr.date)}</span>
                </div>
                <p className="mt-1 text-sm text-primary">
                  {displayWeight(pr.weightKg, settings.unit)}
                  {settings.unit} × {pr.reps}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">Body weight trend</h2>
        {measurementChart.length < 2 ? (
          <EmptyState title="Not enough data yet" description="Log a couple of body-weight entries to see a trend." />
        ) : (
          <Card className="h-56 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={measurementChart} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#8b90a0" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8b90a0" fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip contentStyle={{ background: '#1c1f26', border: '1px solid #262a33', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="weight" stroke="#6ee7b7" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">Log a measurement</h2>
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted">Weight ({settings.unit})</label>
              <Input
                type="number"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-28"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">Body fat %</label>
              <Input
                type="number"
                value={bodyFatInput}
                onChange={(e) => setBodyFatInput(e.target.value)}
                className="w-24"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">Progress photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoChange(e.target.files?.[0])}
                className="text-xs text-muted"
              />
            </div>
            <Button onClick={handleAddMeasurement}>Log entry</Button>
          </div>
        </Card>

        {measurements.length > 0 && (
          <div className="mt-3 space-y-2">
            {[...measurements].reverse().map((m) => (
              <Card key={m.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {m.photoDataUrl && (
                    <img src={m.photoDataUrl} alt="Progress" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{formatDate(m.date)}</p>
                    <p className="text-xs text-muted">
                      {m.weightKg !== undefined && `${displayWeight(m.weightKg, settings.unit)}${settings.unit}`}
                      {m.bodyFatPct !== undefined && ` · ${m.bodyFatPct}% BF`}
                    </p>
                  </div>
                </div>
                <button className="text-xs text-danger" onClick={() => deleteMeasurement(m.id)}>
                  Delete
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
