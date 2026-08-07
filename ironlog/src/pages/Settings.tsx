import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { Button, Card, Input, PageHeader } from '../components/ui'
import type { WeightUnit } from '../types'

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const exportData = useStore((s) => s.exportData)
  const importData = useStore((s) => s.importData)
  const resetAllData = useStore((s) => s.resetAllData)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const json = exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        importData(reader.result as string)
        alert('Data imported successfully.')
      } catch {
        alert('That file could not be read as an IronLog backup.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Units</h2>
          <div className="flex gap-2">
            {(['kg', 'lb'] as WeightUnit[]).map((unit) => (
              <button
                key={unit}
                onClick={() => updateSettings({ unit })}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  settings.unit === unit
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted'
                }`}
              >
                {unit === 'kg' ? 'Kilograms' : 'Pounds'}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Default rest timer</h2>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={settings.restTimerSeconds}
              onChange={(e) => updateSettings({ restTimerSeconds: Math.max(0, Number(e.target.value) || 0) })}
              className="w-24"
            />
            <span className="text-sm text-muted">seconds</span>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Backup</h2>
          <p className="mb-3 text-xs text-muted">
            All data lives in this browser only. Export a backup to move it to another device.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleExport}>
              Export data
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Import data
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Danger zone</h2>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete all workouts, routines, and settings? This cannot be undone.')) {
                resetAllData()
              }
            }}
          >
            Reset all data
          </Button>
        </Card>
      </div>
    </div>
  )
}
