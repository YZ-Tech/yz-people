import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Radio,
  Stack,
  Typography,
} from '@mui/material'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useApi } from '../lib/api'
import type { PersonDetail } from '../types'

/** The clone-voice bridge: promote one of the person's clone_source takes
 *  into the host's voice-reference library so the clone TTS engine can
 *  speak as them. Renders ONLY when the host implements
 *  `api.promoteVoiceClone` (JarvYZ does; the standalone SPA has no clone
 *  store and hides this panel entirely).
 *
 *  Flow: pick a take -> "Use as clone voice" -> host copies the wav into
 *  its library as `<DisplayName>.wav` (overwriting a previous promote) ->
 *  person meta `voice_clone_id` records the link. Language mapping stays a
 *  deliberate act on the host's voice settings page - promoting must never
 *  silently change what a language sounds like. */
export function CloneVoicePanel({
  detail,
  onChanged,
}: {
  detail: PersonDetail
  onChanged: () => void
}) {
  const api = useApi()
  const takes = detail.buckets.clone_source
  const [selected, setSelected] = useState<string | null>(
    takes.length > 0 ? takes[0].name : null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promoted, setPromoted] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  if (!api.promoteVoiceClone) return null

  const refName = `${detail.meta.display_name.replace(/[^A-Za-z0-9._-]/g, '_')}.wav`
  const current = detail.meta.voice_clone_id

  const play = (name: string) => {
    if (!audioRef.current) audioRef.current = new Audio()
    audioRef.current.src = api.recordingPlaybackUrl(
      detail.slug,
      'clone_source',
      name,
    )
    void audioRef.current.play().catch(() => {})
  }

  const promote = async () => {
    if (!selected || !api.promoteVoiceClone) return
    setBusy(true)
    setError(null)
    const r = await api.promoteVoiceClone(
      detail.slug,
      'clone_source',
      selected,
      refName,
    )
    if (!r.ok || !r.ref) {
      setBusy(false)
      setError(r.error || 'promote failed')
      return
    }
    const u = await api.update(detail.slug, { voice_clone_id: r.ref })
    setBusy(false)
    if (!u.ok) {
      setError(u.error || 'saving voice_clone_id failed')
      return
    }
    setPromoted(r.ref)
    onChanged()
  }

  if (takes.length === 0) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        No clone-source takes recorded yet — record the voice-clone scenes
        first, then the clone voice can be created here.
      </Alert>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 0.5 }}>
        <GraphicEqIcon fontSize="small" color="action" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
          Clone voice
        </Typography>
        {current && <Chip label={`active: ${current}`} size="small" color="success" />}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Pick the take that sounds most like {detail.meta.display_name} and
        promote it — the clone engine will speak as them for any language you
        map it to on the Mouth page.
      </Typography>

      <Stack sx={{ gap: 0.5, mb: 1.5 }}>
        {takes.map((t) => (
          <Stack
            key={t.name}
            direction="row"
            sx={{ alignItems: 'center', gap: 0.5 }}
          >
            <Radio
              size="small"
              checked={selected === t.name}
              onChange={() => setSelected(t.name)}
            />
            <Box
              sx={{
                flex: 1,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onClick={() => setSelected(t.name)}
            >
              {t.name}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {(t.size_bytes / 1024).toFixed(0)} KB
            </Typography>
            <IconButton size="small" onClick={() => play(t.name)} aria-label={`Play ${t.name}`}>
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
        <Button
          variant="contained"
          size="small"
          disabled={!selected || busy}
          onClick={promote}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {current ? 'Replace clone voice' : 'Use as clone voice'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          saves to the voice library as {refName}
        </Typography>
      </Stack>

      {promoted && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {detail.meta.display_name} can now be cloned — map {promoted} to a
          language on the Mouth page (Chatterbox card) to hear it.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Paper>
  )
}
