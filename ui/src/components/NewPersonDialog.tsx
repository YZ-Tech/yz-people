import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useCreatePerson } from '../hooks/usePeople'

export function NewPersonDialog({
  open,
  onClose,
  onCreated,
  noWakeOwnerYet,
}: {
  open: boolean
  onClose: () => void
  onCreated: (slug: string) => void
  noWakeOwnerYet: boolean
}) {
  const createPerson = useCreatePerson()
  const [displayName, setDisplayName] = useState('')
  const [language, setLanguage] = useState('en')
  const [canCommand, setCanCommand] = useState(false)
  const [isWakeOwner, setIsWakeOwner] = useState(noWakeOwnerYet)
  // Profile subset — same fields as the core owner profile (settings.user).
  const [location, setLocation] = useState('')
  const [timezone, setTimezone] = useState('')
  const [github, setGithub] = useState('')
  const [about, setAbout] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const slug = displayName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
  const validSlug = /^[a-z][a-z0-9_]{0,31}$/.test(slug)

  const submit = async () => {
    if (!validSlug) {
      setError('Display name must produce a slug starting with a letter')
      return
    }
    setSubmitting(true)
    setError(null)
    const r = await createPerson({
      slug,
      display_name: displayName.trim(),
      language,
      can_command: canCommand,
      is_wake_owner: isWakeOwner,
      location: location.trim(),
      timezone: timezone.trim(),
      github_username: github.trim(),
      about: about.trim(),
    })
    setSubmitting(false)
    if (!r.ok) {
      setError(r.error || 'Failed')
      return
    }
    onCreated(r.slug!)
    // Reset for next time
    setDisplayName('')
    setLanguage('en')
    setCanCommand(false)
    setIsWakeOwner(noWakeOwnerYet)
    setLocation('')
    setTimezone('')
    setGithub('')
    setAbout('')
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a person</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            helperText={
              displayName
                ? `Slug: ${slug}${validSlug ? '' : ' (invalid)'}`
                : 'e.g. "Yeon" → slug yeon, "Sister Lorain" → sister_lorain'
            }
            error={!!displayName && !validSlug}
            fullWidth
          />
          <TextField
            select
            label="Primary language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            helperText="Used as a hint for known-speaker transcription (Phase 1)"
          >
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="de">German</MenuItem>
            <MenuItem value="es">Spanish</MenuItem>
            <MenuItem value="fr">French</MenuItem>
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={canCommand}
                onChange={(e) => setCanCommand(e.target.checked)}
              />
            }
            label="Can give JarvYZ commands"
          />
          <Typography variant="caption" color="text.secondary">
            Trusted-voice gate. Default off — they get recognized in transcripts but
            can't drive JarvYZ. Flip on for yourself + anyone you trust with the keys.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={isWakeOwner}
                onChange={(e) => setIsWakeOwner(e.target.checked)}
                disabled={!noWakeOwnerYet && !isWakeOwner}
              />
            }
            label="This person owns the wake word"
          />
          <Typography variant="caption" color="text.secondary">
            Only one person at a time. The wake-word owner records "Hey Lumenai"
            positives; everyone else contributes only negatives.
            {!noWakeOwnerYet && !isWakeOwner && ' (already taken)'}
          </Typography>

          <Divider sx={{ my: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            Profile (optional) — the same fields as your own owner profile. Feeds
            speaker-aware context once JarvYZ knows who is talking.
          </Typography>
          <TextField
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="50678 Köln, Germany"
            fullWidth
            size="small"
          />
          <TextField
            label="Timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Berlin"
            fullWidth
            size="small"
          />
          <TextField
            label="GitHub username"
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="About"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Free-form notes JarvYZ should know about them."
            fullWidth
            size="small"
            multiline
            minRows={2}
          />

          {error && (
            <Typography variant="body2" color="error.main">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={submit}
          disabled={submitting || !validSlug || !displayName.trim()}
          variant="contained"
        >
          {submitting ? 'Adding…' : 'Add person'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
