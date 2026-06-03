import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeToMono16k, encodeWav, TARGET_SR } from '../lib/wavEncoder'
import {
  segmentByAmplitude,
  sliceSegments,
  type Segment,
  type SegmentOptions,
} from '../lib/amplitudeSegmenter'

/** Continuous-record + post-process flow. User hits record, says all
 *  reps/lines, hits stop. We then decode + amplitude-segment + return
 *  N individual WAV blobs that the parent can upload separately.
 *
 *  Live amplitude is exposed for the visual meter; live rep count is
 *  derived from a coarse pass over the AnalyserNode (UX feedback only —
 *  the real segmentation runs after stop with full-resolution PCM). */

export type BatchState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'processing'
  | 'reviewing'
  | 'error'

export type BatchRecorderHook = {
  state: BatchState
  error: string | null
  elapsedMs: number
  level: number
  liveCount: number
  segments: Float32Array[] | null
  segmentWavs: Blob[] | null
  start: () => void
  stop: () => void
  reset: () => void
}

export function useBatchRecorder(opts: SegmentOptions = {}): BatchRecorderHook {
  const [state, setState] = useState<BatchState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)
  const [liveCount, setLiveCount] = useState(0)
  const [segments, setSegments] = useState<Float32Array[] | null>(null)
  const [segmentWavs, setSegmentWavs] = useState<Blob[] | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const rafRef = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const liveSpeechRef = useRef(false)
  const liveCountRef = useRef(0)
  const liveSilenceStartRef = useRef(0)

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignore */ }
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

  useEffect(() => cleanup, [cleanup])

  const tickMeter = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sumSq = 0
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i]
    const rms = Math.sqrt(sumSq / buf.length)
    setLevel(Math.min(1, rms * 4))

    // Coarse live-rep counter — UX feedback only. Real segmentation
    // runs on full-rate PCM after stop. Use the same threshold as the
    // segmenter but on the analyser windows (~10-20ms).
    const speech = rms > (opts.threshold ?? 0.012)
    const now = performance.now()
    if (speech && !liveSpeechRef.current) {
      liveSpeechRef.current = true
      // New speech onset — count it if we've had enough silence
      const sinceSilence = now - liveSilenceStartRef.current
      if (liveSilenceStartRef.current === 0 || sinceSilence > (opts.minSilenceMs ?? 400)) {
        liveCountRef.current += 1
        setLiveCount(liveCountRef.current)
      }
    } else if (!speech && liveSpeechRef.current) {
      liveSpeechRef.current = false
      liveSilenceStartRef.current = now
    }

    if (startedAtRef.current) setElapsedMs(now - startedAtRef.current)
    rafRef.current = requestAnimationFrame(tickMeter)
  }, [opts.threshold, opts.minSilenceMs])

  const start = useCallback(() => {
    if (state === 'recording' || state === 'starting') return
    setError(null)
    setSegments(null)
    setSegmentWavs(null)
    setLiveCount(0)
    liveCountRef.current = 0
    liveSpeechRef.current = false
    liveSilenceStartRef.current = 0
    chunksRef.current = []
    setState('starting')

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

        let mime = 'audio/webm;codecs=opus'
        if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) {
          mime = 'audio/webm'
        }
        const rec = new MediaRecorder(stream, { mimeType: mime })
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        rec.onstop = async () => {
          setState('processing')
          try {
            const fullBlob = new Blob(chunksRef.current, { type: mime })
            const pcm = await decodeToMono16k(fullBlob)
            const segs: Segment[] = segmentByAmplitude(pcm, TARGET_SR, opts)
            const sliced = sliceSegments(pcm, segs)
            const wavs = sliced.map((s) => encodeWav(s, TARGET_SR))
            setSegments(sliced)
            setSegmentWavs(wavs)
            setState('reviewing')
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            setState('error')
          }
        }
        recorderRef.current = rec
        rec.start()
        startedAtRef.current = performance.now()
        setState('recording')
        rafRef.current = requestAnimationFrame(tickMeter)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setState('error')
      })
  }, [state, opts, tickMeter])

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    recorderRef.current?.stop()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setState('idle')
    setError(null)
    setElapsedMs(0)
    setLevel(0)
    setLiveCount(0)
    setSegments(null)
    setSegmentWavs(null)
  }, [cleanup])

  return {
    state,
    error,
    elapsedMs,
    level,
    liveCount,
    segments,
    segmentWavs,
    start,
    stop,
    reset,
  }
}
