import { useEffect, useRef, useState } from 'react'

export function useRestTimer() {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isRunning) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning])

  function start(duration: number) {
    setSecondsLeft(duration)
    setIsRunning(true)
  }

  function stop() {
    setIsRunning(false)
    setSecondsLeft(0)
  }

  function addSeconds(delta: number) {
    setSecondsLeft((prev) => Math.max(0, prev + delta))
  }

  return { secondsLeft, isRunning, start, stop, addSeconds }
}
