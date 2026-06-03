import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
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

/** Batch-script mode: user reads a list of lines straight through.
 *  Amplitude segmenter splits + counts lines after stop. Same engine
 *  as BatchRepsRecorder, different presentation (teleprompter). */
export function BatchScriptRecorder({
  instruction,
  scriptLines,
  saving,
  onSave,
  onSkip,
}: {
  instruction: string
  scriptLines: string[]
  saving: boolean
  onSave: (wavs: Blob[]) => Promise<void>
  onSkip?: () => void
}) {
  // Slightly longer min-silence (line pauses are usually >500ms;
  // wake-rep pauses are tighter)
  const rec = useBatchRecorder({ threshold: 0.012, minSilenceMs: 500, minSpeechMs: 250 })
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
  const targetLines = scriptLines.length

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {instruction}
      </Typography>

      <Box
        sx={{
          p: 2,
          mb: 2,
          border: 2,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          maxHeight: 360,
          overflow: 'auto',
        }}
      >
        <Stack spacing={0.5}>
          {scriptLines.map((line, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontFamily: 'ui-monospace, monospace', minWidth: 22 }}
              >
                {String(i + 1).padStart(2, '0')}
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'Georgia, serif' }}>
                {line}
              </Typography>
            </Stack>
          ))}
        </Stack>
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
            {rec.state === 'starting' ? 'Opening mic…' : 'Start reading'}
          </Button>
          {onSkip && (
            <Button color="inherit" onClick={onSkip}>
              Skip
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
                minWidth: 70,
                textAlign: 'right',
              }}
            >
              {rec.liveCount} / {targetLines}
            </Typography>
            <IconButton onClick={rec.stop} color="error" size="large">
              <StopIcon />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>
            Read through the lines at a natural pace. Pause briefly between each.
          </Typography>
        </Stack>
      )}

      {rec.state === 'processing' && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Segmenting lines…
          </Typography>
        </Box>
      )}

      {rec.state === 'reviewing' && (
        <Stack spacing={1.5}>
          <Alert severity={detected >= targetLines * 0.7 ? 'success' : 'warning'}>
            Detected <strong>{detected}</strong> segments (script had {targetLines} lines).
            {detected < targetLines * 0.7 &&
              ' Some lines may have been merged — re-record with longer pauses if you want a tighter split.'}
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
              {savingThis || saving ? `Uploading ${detected}…` : `Save ${detected} segments`}
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
