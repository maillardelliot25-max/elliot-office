function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RestTimerBar({
  secondsLeft,
  isRunning,
  onAdd,
  onStop,
}: {
  secondsLeft: number
  isRunning: boolean
  onAdd: (delta: number) => void
  onStop: () => void
}) {
  if (!isRunning) return null

  return (
    <div className="fixed inset-x-0 bottom-16 z-10 flex justify-center px-4 md:bottom-4 md:left-64">
      <div className="flex items-center gap-3 rounded-full border border-border bg-surface-2/95 px-4 py-2 shadow-lg backdrop-blur">
        <span className="text-sm font-medium text-muted">Rest</span>
        <span className="min-w-[3ch] font-mono text-lg font-semibold tabular-nums text-primary">
          {formatClock(secondsLeft)}
        </span>
        <button
          className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-text hover:bg-border"
          onClick={() => onAdd(15)}
        >
          +15s
        </button>
        <button
          className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-text hover:bg-border"
          onClick={onStop}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
