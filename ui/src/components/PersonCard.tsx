import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import type { PersonSummary, SceneScript } from '../types'

const BUCKET_LABELS: Record<string, string> = {
  clone_source: 'Voice clone',
  speaker_ref: 'Speaker ID',
  wake_positives: 'Wake positives',
  wake_negatives: 'Wake negatives',
}

/** Target counts derived from the scene script (which the parent
 *  fetched + passes down). Reasonable fallbacks if the script hasn't
 *  arrived yet. */
function bucketTargets(script: SceneScript | null, isWakeOwner: boolean) {
  return {
    clone_source: script?.clone_source.scenes.length ?? 3,
    speaker_ref: script?.speaker_ref.scenes.length ?? 15,
    wake_positives: isWakeOwner
      ? script?.wake_positives.batches.reduce((a, b) => a + b.reps, 0) ?? 60
      : 0,
    wake_negatives: script?.wake_negatives.script_lines.length ?? 20,
  }
}

export function PersonCard({
  person,
  script,
  onClick,
}: {
  person: PersonSummary
  script: SceneScript | null
  onClick: () => void
}) {
  const targets = bucketTargets(script, person.is_wake_owner)
  const buckets = person.is_wake_owner
    ? (['clone_source', 'speaker_ref', 'wake_positives', 'wake_negatives'] as const)
    : (['clone_source', 'speaker_ref', 'wake_negatives'] as const)

  const total = buckets.reduce((a, b) => a + targets[b], 0)
  const have = buckets.reduce((a, b) => a + person.buckets[b], 0)
  const pct = total > 0 ? Math.round((have * 100) / total) : 0

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        cursor: 'pointer',
        transition: 'background-color .12s ease',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {person.display_name}
        </Typography>
        <Chip label={person.language.toUpperCase()} size="small" />
        {person.is_wake_owner && (
          <Chip label="wake owner" size="small" color="primary" />
        )}
        {person.can_command && (
          <Chip label="trusted" size="small" color="success" />
        )}
        {person.voice_clone_id && (
          <Chip label="voice cloned" size="small" color="secondary" variant="outlined" />
        )}
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {have} / {total} ({pct}%)
        </Typography>
      </Stack>
      <Stack
        direction="row"
        sx={{
          gap: 1.5,
          flexWrap: 'wrap',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.72rem',
        }}
      >
        {buckets.map((b) => {
          const got = person.buckets[b]
          const want = targets[b]
          const done = want > 0 && got >= want
          return (
            <Box key={b}>
              <Typography variant="caption" color="text.secondary">
                {BUCKET_LABELS[b]}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'inherit',
                  color: done ? 'success.main' : 'text.primary',
                  fontWeight: done ? 600 : 400,
                }}
              >
                {got} / {want}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
