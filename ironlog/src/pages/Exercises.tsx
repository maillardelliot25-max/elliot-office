import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllExercises } from '../store/useStore'
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../components/ui'
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '../lib/seedExercises'
import type { MuscleGroup } from '../types'
import NewExerciseModal from '../components/NewExerciseModal'

export default function Exercises() {
  const navigate = useNavigate()
  const allExercises = useAllExercises()
  const [query, setQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>('all')
  const [showModal, setShowModal] = useState(false)

  const filtered = useMemo(() => {
    return allExercises
      .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
      .filter((e) => muscleFilter === 'all' || e.muscleGroups.includes(muscleFilter))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allExercises, query, muscleFilter])

  const muscleGroups = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]

  return (
    <div>
      <PageHeader
        title="Exercises"
        subtitle={`${allExercises.length} exercises in your library`}
        action={<Button onClick={() => setShowModal(true)}>Add custom</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search exercises..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <FilterChip active={muscleFilter === 'all'} onClick={() => setMuscleFilter('all')}>
            All
          </FilterChip>
          {muscleGroups.map((mg) => (
            <FilterChip key={mg} active={muscleFilter === mg} onClick={() => setMuscleFilter(mg)}>
              {MUSCLE_GROUP_LABELS[mg]}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No exercises found" description="Try a different search or filter." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((ex) => (
            <Card key={ex.id} className="cursor-pointer hover:border-primary/40">
              <button
                className="w-full text-left"
                onClick={() => navigate(`/exercises/${ex.id}`)}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{ex.name}</p>
                  {ex.isCustom && <Badge>Custom</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="primary">{EQUIPMENT_LABELS[ex.equipment]}</Badge>
                  {ex.muscleGroups.map((mg) => (
                    <Badge key={mg}>{MUSCLE_GROUP_LABELS[mg]}</Badge>
                  ))}
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}

      {showModal && <NewExerciseModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
