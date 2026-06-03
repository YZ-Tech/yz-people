// Amplitude-based speech segmentation. Not real VAD — but accurate
// enough for an enrollment wizard where the user pauses between reps
// and we just need to count how many they said.
//
// For "Hey Lumenai" reps: each utterance is ~0.6-1.5s of speech with
// silence before/after. RMS envelope detection cleanly catches these.

export type Segment = {
  startSample: number
  endSample: number
}

export type SegmentOptions = {
  /** RMS threshold for "speech" (0..1). Calibrate: 0.012 was robust in
   *  hand testing — well above mic noise floor, well below normal speech. */
  threshold?: number
  /** Sliding window for RMS computation, in ms. */
  windowMs?: number
  /** Minimum speech duration to count as a segment (filters coughs). */
  minSpeechMs?: number
  /** Minimum silence to consider a segment ended. */
  minSilenceMs?: number
  /** Padding around each segment (captures attack + tail). */
  padMs?: number
}

const DEFAULTS: Required<SegmentOptions> = {
  threshold: 0.012,
  windowMs: 30,
  minSpeechMs: 200,
  minSilenceMs: 400,
  padMs: 120,
}

/** Segment a mono Float32 PCM buffer into speech regions.
 *  Sample rate is needed to convert ms-based thresholds to sample counts. */
export function segmentByAmplitude(
  pcm: Float32Array,
  sampleRate: number,
  opts: SegmentOptions = {},
): Segment[] {
  const o = { ...DEFAULTS, ...opts }
  const windowSamples = Math.max(1, Math.round((o.windowMs * sampleRate) / 1000))
  const minSpeechSamples = Math.round((o.minSpeechMs * sampleRate) / 1000)
  const minSilenceSamples = Math.round((o.minSilenceMs * sampleRate) / 1000)
  const padSamples = Math.round((o.padMs * sampleRate) / 1000)

  // Walk the buffer in non-overlapping windows, compute RMS, classify.
  const segments: Segment[] = []
  let inSpeech = false
  let segStart = 0
  let lastSpeechEnd = 0

  for (let i = 0; i < pcm.length; i += windowSamples) {
    const end = Math.min(i + windowSamples, pcm.length)
    let sumSq = 0
    for (let j = i; j < end; j++) sumSq += pcm[j] * pcm[j]
    const rms = Math.sqrt(sumSq / (end - i))
    const speech = rms > o.threshold

    if (speech && !inSpeech) {
      // Speech onset — but only "open" a new segment if we've had
      // enough silence since the last one (otherwise treat as same seg)
      if (segments.length > 0 && i - lastSpeechEnd < minSilenceSamples) {
        // Re-open the last segment instead of starting fresh
        segStart = segments[segments.length - 1].startSample
        segments.pop()
      } else {
        segStart = Math.max(0, i - padSamples)
      }
      inSpeech = true
    } else if (!speech && inSpeech) {
      // Speech offset (this window is silent). Don't close yet — wait
      // to see if silence persists past minSilenceSamples.
      // Track the last sample with speech.
      lastSpeechEnd = i
      inSpeech = false
      // Commit a tentative segment; the next speech onset might extend it.
      const segEnd = Math.min(pcm.length, lastSpeechEnd + padSamples)
      if (segEnd - segStart >= minSpeechSamples) {
        segments.push({ startSample: segStart, endSample: segEnd })
      }
    }
  }

  // Trailing speech (file ended mid-utterance)
  if (inSpeech) {
    const segEnd = pcm.length
    if (segEnd - segStart >= minSpeechSamples) {
      segments.push({ startSample: segStart, endSample: segEnd })
    }
  }

  return segments
}

/** Slice a Float32 PCM buffer at the given segment boundaries. */
export function sliceSegments(
  pcm: Float32Array,
  segments: Segment[],
): Float32Array[] {
  return segments.map((s) => pcm.slice(s.startSample, s.endSample))
}
