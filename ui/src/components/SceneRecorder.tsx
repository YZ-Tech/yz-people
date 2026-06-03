import { Box, Button, IconButton, LinearProgress, Stack, Typography } from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import StopIcon from '@mui/icons-material/Stop'
import ReplayIcon from '@mui/icons-material/Replay'
import CheckIcon from '@mui/icons-material/Check'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useRef, useState } from 'react'
import { useMediaRecorderWithMeter } from '../hooks/useMediaRecorder'

/** Single-scene recorder. Handles the countdown → record → review →
 *  save/redo flow. Parent supplies the scene metadata + an onSave
 *  callback that uploads the blob. */
export function SceneRecorder({
  instruction,
  text,
  targetSeconds,
  saving,
  onSave,
  onSkip,
}: {
  instruction: string
  text: string
  targetSeconds?: number
  saving: boolean
  onSave: (blob: Blob) => Promise<void>
  onSkip?: () => void
}) {
  const rec = useMediaRecorderWithMeter()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [played, setPlayed] = useState(false)

  const autoStopMs = targetSeconds ? Math.max(2000, targetSeconds * 1000 + 1500) : undefined

  const handleSave = async () => {
    if (rec.blob) {
      await onSave(rec.blob)
      rec.reset()
      setPlayed(false)
    }
  }

  const handleRedo = () => {
    rec.reset()
    setPlayed(false)
  }

  const handlePlay = () => {
    audioRef.current?.play().catch(() => {})
    setPlayed(true)
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {instruction}
      </Typography>
      <Box
        sx={{
          p: 2.5,
          border: 2,
          borderColor: 'divider',
          borderRadius: 1,
          mb: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontFamily: 'Georgia, serif', lineHeight: 1.5, fontWeight: 400 }}
        >
          “{text}”
        </Typography>
        {targetSeconds && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
            ~{targetSeconds}s when read calmly
          </Typography>
        )}
      </Box>

      {/* State-driven controls */}
      {(rec.state === 'idle' || rec.state === 'starting') && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Button
            variant="contained"
            size="large"
            color="error"
            startIcon={<FiberManualRecordIcon />}
            onClick={() => rec.beginCountdown(3, autoStopMs)}
            disabled={rec.state === 'starting'}
            sx={{ minWidth: 180 }}
          >
            {rec.state === 'starting' ? 'Opening mic…' : 'Record'}
          </Button>
          {onSkip && (
            <Button color="inherit" onClick={onSkip}>
              Skip this one
            </Button>
          )}
        </Stack>
      )}

      {rec.state === 'countdown' && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="h1" sx={{ fontSize: '5rem', fontWeight: 200, color: 'error.main' }}>
            {rec.countdownLeft}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Get ready…
          </Typography>
        </Box>
      )}

      {rec.state === 'recording' && (
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
            <FiberManualRecordIcon sx={{ color: 'error.main', animation: 'pulse 1.2s ease-in-out infinite' }} />
            <Typography variant="body1" sx={{ fontFamily: 'ui-monospace, monospace' }}>
              {(rec.elapsedMs / 1000).toFixed(1)}s
            </Typography>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={rec.level * 100}
                color="error"
                sx={{ height: 10, borderRadius: 5 }}
              />
            </Box>
            <IconButton onClick={rec.stop} color="error" size="large">
              <StopIcon />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>
            Click stop when you're done — or it'll auto-stop after the target time.
          </Typography>
        </Stack>
      )}

      {rec.state === 'reviewing' && rec.blobUrl && (
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={handlePlay} color="primary" size="large">
              <PlayArrowIcon />
            </IconButton>
            <Typography variant="caption" color="text.secondary">
              {played ? 'Listen back, then keep or redo.' : 'Listen back before saving.'}
            </Typography>
            <audio ref={audioRef} src={rec.blobUrl} preload="auto" />
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              startIcon={<CheckIcon />}
              onClick={handleSave}
              disabled={saving}
              color="success"
              sx={{ flex: 1 }}
            >
              {saving ? 'Saving…' : 'Use this take'}
            </Button>
            <Button startIcon={<ReplayIcon />} onClick={handleRedo} disabled={saving}>
              Redo
            </Button>
          </Stack>
        </Stack>
      )}

      {rec.state === 'error' && (
        <Box>
          <Typography color="error.main" variant="body2">
            {rec.error || 'Mic error'}
          </Typography>
          <Button onClick={rec.reset} sx={{ mt: 1 }}>
            Try again
          </Button>
        </Box>
      )}
    </Box>
  )
}
