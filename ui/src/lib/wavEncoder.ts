// Minimal WAV encoder for 16kHz mono PCM. Browser-side so we can ship
// raw WAV to the backend without needing ffmpeg/torchaudio in Python.

const TARGET_SR = 16000

/** Encode a Float32Array of mono PCM samples (range -1..1) as a WAV Blob.
 *  16-bit PCM, single channel, sample rate = sampleRate arg. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate (sr * channels * bytes/sample)
  view.setUint16(32, 2, true) // block align (channels * bytes/sample)
  view.setUint16(34, 16, true) // bits per sample
  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  // PCM samples
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/** Decode a WebM/WAV/etc Blob to mono Float32 PCM at TARGET_SR.
 *  Uses the browser's native audio decoder (handles every codec the
 *  browser knows). Downmixes stereo to mono, resamples to 16kHz. */
export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const audioBuf = await ctx.decodeAudioData(arrayBuf)
    // Downmix to mono
    const channels = audioBuf.numberOfChannels
    const inSr = audioBuf.sampleRate
    const inLen = audioBuf.length
    const mono = new Float32Array(inLen)
    for (let c = 0; c < channels; c++) {
      const data = audioBuf.getChannelData(c)
      for (let i = 0; i < inLen; i++) mono[i] += data[i] / channels
    }
    // Resample to TARGET_SR via OfflineAudioContext (more accurate than
    // naive linear interp; uses the browser's high-quality resampler)
    if (inSr === TARGET_SR) return mono
    const outLen = Math.round((inLen * TARGET_SR) / inSr)
    const offline = new OfflineAudioContext(1, outLen, TARGET_SR)
    const monoBuf = offline.createBuffer(1, inLen, inSr)
    monoBuf.getChannelData(0).set(mono)
    const src = offline.createBufferSource()
    src.buffer = monoBuf
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0).slice()
  } finally {
    void ctx.close()
  }
}

export { TARGET_SR }
