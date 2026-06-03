import { useCallback, useEffect, useRef, useState } from 'react'

/** State machine: idle → starting → countdown → recording → reviewing → idle (next).
 *  Owns the MediaStream lifecycle so leaving the page kills the mic LED. */

export type RecorderState =
  | 'idle'
  | 'starting'
  | 'countdown'
  | 'recording'
  | 'reviewing'
  | 'error'

export type RecorderHook = {
  state: RecorderState
  error: string | null
  countdownLeft: number
  elapsedMs: number
  level: number // 0..1 — instantaneous RMS for the visual meter
  blob: Blob | null
  blobUrl: string | null
  beginCountdown: (countdownSeconds: number, autoStopAfterMs?: number) => void
  stop: () => void
  reset: () => void
}

const MIME = 'audio/webm;codecs=opus' // broadly supported in Chrome/Edge/Firefox

export function useMediaRecorderWithMeter(): RecorderHook {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [countdownLeft, setCountdownLeft] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const autoStopTimerRef = useRef<number | null>(null)

  const cleanupStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
  }, [])

  useEffect(() => cleanupStream, [cleanupStream])

  useEffect(() => {
    if (blob && !blobUrl) {
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [blob, blobUrl])

  const tickMeter = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sumSq = 0
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i]
    const rms = Math.sqrt(sumSq / buf.length)
    setLevel(Math.min(1, rms * 4))
    if (startedAtRef.current) {
      setElapsedMs(performance.now() - startedAtRef.current)
    }
    rafRef.current = requestAnimationFrame(tickMeter)
  }, [])

  const startRecorder = useCallback(() => {
    if (!streamRef.current) return
    chunksRef.current = []
    setBlob(null)
    setBlobUrl(null)
    setElapsedMs(0)
    let mime = MIME
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) {
      mime = 'audio/webm'
    }
    try {
      const rec = new MediaRecorder(streamRef.current, { mimeType: mime })
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: mime })
        setBlob(out)
        setState('reviewing')
      }
      recorderRef.current = rec
      rec.start()
      startedAtRef.current = performance.now()
      setState('recording')
      rafRef.current = requestAnimationFrame(tickMeter)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }, [tickMeter])

  const beginCountdown = useCallback(
    (countdownSeconds: number, autoStopAfterMs?: number) => {
      if (state === 'recording' || state === 'starting') return
      setError(null)
      setState('starting')
      // Open mic → spin up analyser, then countdown → start recorder
      navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } })
        .then((stream) => {
          streamRef.current = stream
          const ctx = new AudioContext()
          audioCtxRef.current = ctx
          const src = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 2048
          src.connect(analyser)
          analyserRef.current = analyser
          setCountdownLeft(countdownSeconds)
          setState('countdown')
          countdownTimerRef.current = window.setInterval(() => {
            setCountdownLeft((n) => {
              if (n <= 1) {
                if (countdownTimerRef.current) {
                  window.clearInterval(countdownTimerRef.current)
                  countdownTimerRef.current = null
                }
                startRecorder()
                if (autoStopAfterMs && autoStopAfterMs > 0) {
                  autoStopTimerRef.current = window.setTimeout(() => {
                    recorderRef.current?.stop()
                  }, autoStopAfterMs)
                }
                return 0
              }
              return n - 1
            })
          }, 1000)
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e))
          setState('error')
        })
    },
    [state, startRecorder],
  )

  const stop = useCallback(() => {
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    recorderRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    cleanupStream()
    setState('idle')
    setError(null)
    setCountdownLeft(0)
    setElapsedMs(0)
    setLevel(0)
    setBlob(null)
    setBlobUrl(null)
  }, [cleanupStream])

  return {
    state,
    error,
    countdownLeft,
    elapsedMs,
    level,
    blob,
    blobUrl,
    beginCountdown,
    stop,
    reset,
  }
}
