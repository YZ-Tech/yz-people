import { useState } from 'react'
import { Box, Button, Collapse, Stack, TextField } from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useApi } from '../lib/api'
import type { PersonDetail } from '../types'

type Key = 'location' | 'timezone' | 'github_username' | 'about'
type ProfilePatch = Partial<Record<Key, string>>

const FIELDS: { key: Key; label: string; placeholder?: string; multiline?: boolean }[] = [
  { key: 'location', label: 'Location', placeholder: '50678 Köln, Germany' },
  { key: 'timezone', label: 'Timezone', placeholder: 'Europe/Berlin' },
  { key: 'github_username', label: 'GitHub username' },
  { key: 'about', label: 'About', multiline: true },
]

/** Per-person profile — the same fields as the core owner profile
 *  (settings.user), so every person carries an identity. Commit-on-blur via
 *  api.update (no PUT per keystroke). Collapsed by default; the wizard's
 *  focus is recording. Key this by slug at the call site so the draft
 *  reseeds when the person changes. */
export function ProfileEditor({
  detail,
  onChanged,
}: {
  detail: PersonDetail
  onChanged: () => void
}) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<Key, string>>(() => ({
    location: detail.meta.location ?? '',
    timezone: detail.meta.timezone ?? '',
    github_username: detail.meta.github_username ?? '',
    about: detail.meta.about ?? '',
  }))

  const commit = async (key: Key) => {
    const val = draft[key]
    if (val === (detail.meta[key] ?? '')) return // no-op, skip the PUT
    const r = await api.update(detail.slug, { [key]: val } as ProfilePatch)
    if (r.ok) onChanged()
  }

  return (
    <Box sx={{ mb: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Button
        onClick={() => setOpen((o) => !o)}
        fullWidth
        endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          color: 'text.secondary',
          textTransform: 'none',
        }}
      >
        Profile
      </Button>
      <Collapse in={open}>
        <Stack spacing={2} sx={{ p: 2, pt: 0 }}>
          {FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              value={draft[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={() => commit(f.key)}
              size="small"
              fullWidth
              multiline={f.multiline}
              minRows={f.multiline ? 3 : undefined}
            />
          ))}
        </Stack>
      </Collapse>
    </Box>
  )
}
