import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pose, PoseDetector } from '@tensorflow-models/pose-detection'
import { angleBetween, initialRepCounterState, updateRepCounter, type Point2D } from '../lib/repCounter'
import type { RepCounterExerciseConfig } from '../lib/repCounterExercises'
import { pickQuote } from '../lib/motivationalQuotes'

export type CameraStatus = 'idle' | 'loading-model' | 'requesting-camera' | 'running' | 'error'

const MIN_KEYPOINT_SCORE = 0.35
const QUOTE_ROTATE_MS = 6500
const START_TIMEOUT_MS = 20000

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function keypointPoint(pose: Pose, name: string): { point: Point2D; score: number } | null {
  const kp = pose.keypoints.find((k) => k.name === name)
  if (!kp || (kp.score ?? 0) < MIN_KEYPOINT_SCORE) return null
  return { point: { x: kp.x, y: kp.y }, score: kp.score ?? 0 }
}

export function useRepCounterCamera(config: RepCounterExerciseConfig | undefined) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const detectorRef = useRef<PoseDetector | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const repStateRef = useRef(initialRepCounterState())
  const quoteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Bumped on every start()/stop() so a stale, still-in-flight start() call
  // (e.g. the first of React StrictMode's double effect-invocation in dev)
  // can detect it's been superseded and stop touching shared state/refs.
  const runIdRef = useRef(0)

  const [status, setStatus] = useState<CameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reps, setReps] = useState(0)
  const [quote, setQuote] = useState(() => pickQuote())

  const releaseResources = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (quoteIntervalRef.current !== null) clearInterval(quoteIntervalRef.current)
    quoteIntervalRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    detectorRef.current?.dispose()
    detectorRef.current = null
  }, [])

  // Public stop: user-initiated (Cancel/close) or unmount — always lands on 'idle'.
  const stop = useCallback(() => {
    runIdRef.current += 1
    releaseResources()
    setStatus('idle')
  }, [releaseResources])

  const detectLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const detector = detectorRef.current
    if (!video || !canvas || !detector || !config) return

    detector
      .estimatePoses(video)
      .then((poses) => {
        const pose = poses[0]
        const ctx = canvas.getContext('2d')
        if (ctx) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }

        if (pose) {
          const left = [
            keypointPoint(pose, config.left.a),
            keypointPoint(pose, config.left.b),
            keypointPoint(pose, config.left.c),
          ]
          const right = [
            keypointPoint(pose, config.right.a),
            keypointPoint(pose, config.right.b),
            keypointPoint(pose, config.right.c),
          ]
          const leftScore = left.every(Boolean) ? left.reduce((s, k) => s + (k?.score ?? 0), 0) : -1
          const rightScore = right.every(Boolean) ? right.reduce((s, k) => s + (k?.score ?? 0), 0) : -1

          const chosen = leftScore >= rightScore ? left : right
          if (ctx && pose.keypoints) drawSkeleton(ctx, pose)

          if (leftScore > -1 || rightScore > -1) {
            const [a, b, c] = chosen as { point: Point2D; score: number }[]
            const angle = angleBetween(a.point, b.point, c.point)
            const nextState = updateRepCounter(repStateRef.current, angle, config)
            if (nextState.reps !== repStateRef.current.reps) {
              setReps(nextState.reps)
            }
            repStateRef.current = nextState
          }
        }
      })
      .catch(() => {
        // A dropped frame isn't fatal; just try again next tick.
      })
      .finally(() => {
        rafRef.current = requestAnimationFrame(detectLoop)
      })
  }, [config])

  const start = useCallback(async () => {
    if (!config) return
    const myRunId = (runIdRef.current += 1)
    const isStale = () => runIdRef.current !== myRunId

    setErrorMessage(null)
    repStateRef.current = initialRepCounterState()
    setReps(0)

    const runSetup = async () => {
      setStatus('loading-model')
      const [tf, backendWebgl, poseDetection] = await Promise.all([
        import('@tensorflow/tfjs-core'),
        import('@tensorflow/tfjs-backend-webgl'),
        import('@tensorflow-models/pose-detection'),
      ])
      void backendWebgl
      if (isStale()) return
      await tf.setBackend('webgl')
      await tf.ready()
      if (isStale()) return
      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      })
      if (isStale()) {
        detector.dispose()
        return
      }
      detectorRef.current = detector

      setStatus('requesting-camera')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      if (isStale()) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element not ready')
      video.srcObject = stream
      await video.play()
      if (isStale()) return

      setStatus('running')
      quoteIntervalRef.current = setInterval(() => {
        setQuote((prev) => pickQuote(prev))
      }, QUOTE_ROTATE_MS)
      rafRef.current = requestAnimationFrame(detectLoop)
    }

    try {
      // The whole sequence (not just model loading) is raced against one
      // outer timeout, so a hang anywhere inside it — a stuck WebGL context,
      // a model host that accepts the connection but never completes the
      // response, camera negotiation that never settles — still surfaces as
      // a clear, actionable error instead of leaving the UI stuck forever.
      await withTimeout(runSetup(), START_TIMEOUT_MS, new Error('start-timeout'))
    } catch (err) {
      if (isStale()) return
      const message =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          ? 'Camera permission was denied. Allow camera access to use the rep counter.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : err instanceof Error && err.message === 'start-timeout'
              ? 'This is taking too long to start — check your connection (the pose model downloads on first use) and try again.'
              : 'Could not start the rep counter camera.'
      releaseResources()
      setErrorMessage(message)
      setStatus('error')
    }
  }, [config, detectLoop, releaseResources])

  useEffect(() => stop, [stop])

  return { videoRef, canvasRef, status, errorMessage, reps, quote, start, stop }
}

function drawSkeleton(ctx: CanvasRenderingContext2D, pose: Pose) {
  ctx.fillStyle = '#6ee7b7'
  ctx.strokeStyle = '#6ee7b7'
  ctx.lineWidth = 3

  const byName = new Map(pose.keypoints.map((k) => [k.name, k]))
  const connections: [string, string][] = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'],
    ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'],
    ['right_knee', 'right_ankle'],
  ]

  for (const [from, to] of connections) {
    const a = byName.get(from)
    const b = byName.get(to)
    if (!a || !b || (a.score ?? 0) < MIN_KEYPOINT_SCORE || (b.score ?? 0) < MIN_KEYPOINT_SCORE) continue
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  for (const kp of pose.keypoints) {
    if ((kp.score ?? 0) < MIN_KEYPOINT_SCORE) continue
    ctx.beginPath()
    ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI)
    ctx.fill()
  }
}
