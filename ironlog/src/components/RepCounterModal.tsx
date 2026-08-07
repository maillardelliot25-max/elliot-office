import { useEffect } from 'react'
import { Button } from './ui'
import { useRepCounterCamera } from '../hooks/useRepCounterCamera'
import type { RepCounterExerciseConfig } from '../lib/repCounterExercises'

export default function RepCounterModal({
  config,
  onApply,
  onClose,
}: {
  config: RepCounterExerciseConfig
  onApply: (reps: number) => void
  onClose: () => void
}) {
  const { videoRef, canvasRef, status, errorMessage, reps, quote, start, stop } = useRepCounterCamera(config)

  useEffect(() => {
    start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    stop()
    onClose()
  }

  function handleApply() {
    stop()
    onApply(reps)
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-semibold">{config.label} — rep counter</p>
          <p className="text-xs text-muted">{config.instructions}</p>
        </div>
        <button className="text-sm text-muted hover:text-text" onClick={handleClose} aria-label="Close rep counter">
          Cancel
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <video ref={videoRef} className="max-h-full max-w-full -scale-x-100" playsInline muted />
        <canvas ref={canvasRef} className="pointer-events-none absolute -scale-x-100" />

        {status !== 'running' && status !== 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-muted">
            {status === 'loading-model' && 'Loading pose detection model…'}
            {status === 'requesting-camera' && 'Requesting camera access…'}
            {status === 'idle' && 'Starting…'}
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
            <p className="text-sm text-danger">{errorMessage}</p>
            <Button onClick={() => start()}>Try again</Button>
          </div>
        )}

        {status === 'running' && (
          <>
            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-2xl bg-black/60 px-8 py-3 text-center">
              <p className="text-6xl font-bold tabular-nums text-primary">{reps}</p>
              <p className="text-xs uppercase tracking-wide text-muted">reps</p>
            </div>
            <div className="absolute bottom-6 left-1/2 w-full max-w-md -translate-x-1/2 px-4 text-center">
              <p className="rounded-xl bg-black/60 px-4 py-3 text-sm font-medium italic text-text">“{quote}”</p>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="ghost" onClick={handleClose}>
          Discard
        </Button>
        <Button onClick={handleApply} disabled={status !== 'running'}>
          Use {reps} reps
        </Button>
      </div>
    </div>
  )
}
