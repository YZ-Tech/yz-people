import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import StopIcon from '@mui/icons-material/Stop'
import ReplayIcon from '@mui/icons-material/Replay'
import CheckIcon from '@mui/icons-material/Check'
import { useBatchRecorder } from '../hooks/useBatchRecorder'

/** Batch-reps mode: user says "Hey Lumenai" N times in one continuous
 *  recording. Amplitude segmenter splits + counts reps after stop.
 *  Parent supplies batchId/instruction/targetReps + an onSave callback
 *  that uploads each segment as a numbered file. */
export function BatchRepsRecorder({
  phrase,
  batchId,
  instruction,
  targetReps,
  saving,
  onSave,
  onSkip,
}: {
  phrase: string
  batchId: string
  instruction: string
  targetReps: number
  saving: boolean
  onSave: (wavs: Blob[]) => Promise<void>
  onSkip?: () => void
}) {
  const rec = useBatchRecorder({ threshold: 0.012, minSilenceMs: 400, minSpeechMs: 200 })
  const [savingThis, setSavingThis] = useState(false)

  const handleAccept = async () => {
    if (!rec.segmentWavs) return
    setSavingThis(true)
    try {
      await onSave(rec.segmentWavs)
      rec.reset()
    } finally {
      setSavingThis(false)
    }
  }

  const detected = rec.segmentWavs?.length ?? 0
  const detectedOk = detected >= targetReps

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip label={`Batch: ${batchId}`} size="small" />
        <Chip label={`Target: ${targetReps} reps`} size="small" variant="outlined" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {instruction}
      </Typography>
      <Box
        sx={{
          p: 3,
          border: 2,
          borderColor: 'divider',
          borderRadius: 1,
          mb: 2,
          bgcolor: 'background.paper',
          textAlign: 'center',
        }}
      >
        <Typography variant="caption" color="text.disabled">
          Say this {targetReps} times, with brief pauses between
        </Typography>
        <Typography variant="h4" sx={{ fontFamily: 'Georgia, serif', mt: 1 }}>
          “{phrase}”
        </Typography>
      </Box>

      {(rec.state === 'idle' || rec.state === 'starting') && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Button
            variant="contained"
            size="large"
            color="error"
            startIcon={<FiberManualRecordIcon />}
            onClick={rec.start}
            disabled={rec.state === 'starting'}
            sx={{ minWidth: 200 }}
          >
            {rec.state === 'starting' ? 'Opening mic…' : 'Start recording batch'}
          </Button>
          {onSkip && (
            <Button color="inherit" onClick={onSkip}>
              Skip this batch
            </Button>
          )}
        </Stack>
      )}

      {rec.state === 'recording' && (
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
            <FiberManualRecordIcon
              sx={{ color: 'error.main', animation: 'pulse 1.2s ease-in-out infinite' }}
            />
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
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'ui-monospace, monospace',
                minWidth: 60,
                textAlign: 'right',
                color: rec.liveCount >= targetReps ? 'success.main' : 'text.primary',
              }}
            >
              {rec.liveCount} / {targetReps}
            </Typography>
            <IconButton onClick={rec.stop} color="error" size="large">
              <StopIcon />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>
            Live count is an estimate. Real count happens when you stop.
          </Typography>
        </Stack>
      )}

      {rec.state === 'processing' && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Segmenting reps…
          </Typography>
        </Box>
      )}

      {rec.state === 'reviewing' && (
        <Stack spacing={1.5}>
          <Alert severity={detectedOk ? 'success' : 'warning'}>
            Detected <strong>{detected}</strong> reps (target {targetReps}).
            {!detectedOk && ' Re-record if you want more — pauses help the segmenter.'}
          </Alert>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              startIcon={<CheckIcon />}
              onClick={handleAccept}
              disabled={savingThis || saving || detected === 0}
              color="success"
              sx={{ flex: 1 }}
            >
              {savingThis || saving ? `Uploading ${detected}…` : `Save ${detected} reps`}
            </Button>
            <Button startIcon={<ReplayIcon />} onClick={rec.reset} disabled={savingThis || saving}>
              Re-record
            </Button>
          </Stack>
        </Stack>
      )}

      {rec.state === 'error' && (
        <Box>
          <Alert severity="error">{rec.error || 'Mic error'}</Alert>
          <Button onClick={rec.reset} sx={{ mt: 1 }}>
            Try again
          </Button>
        </Box>
      )}
    </Box>
  )
}
