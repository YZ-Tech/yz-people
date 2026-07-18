import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { ThemeProvider, type Theme } from '@mui/material/styles'

import { ApiContext, type PeopleApi } from './lib/api'
import { WSContext, type WSApi } from './lib/ws'
import {
  CapabilitiesContext,
  DEFAULT_CAPABILITIES,
  useCapabilities,
  type Capabilities,
} from './lib/capabilities'
import { StoreProvider } from './lib/store-context'
import { createPeopleStore } from './store'

import { PersonCard } from './components/PersonCard'
import { NewPersonDialog } from './components/NewPersonDialog'
import { EnrollmentWizard } from './components/EnrollmentWizard'
import {
  usePeopleList,
  usePersonDetail,
  useSceneScript,
} from './hooks/usePeople'


export interface PeoplePageProps {
  /** Host's MUI theme. Wrapped in our own ThemeProvider so module-side
   *  `useTheme()` reads it. Standalone SPA passes its own theme. */
  theme?: Theme
  /** Host's WS API. Injected into the module's WSContext so the module's
   *  `useSubscription` reads from the host's connection. Optional. */
  wsApi?: WSApi
  /** Host's PeopleApi implementation — module never knows URLs. */
  api: PeopleApi
  /** Mode flags. */
  capabilities?: Capabilities
  /** Host deep-link: open a specific person's enrollment (e.g. the owner's
   *  voice, driven from core's owner card). `n` is a nonce so a repeat
   *  request for the same slug still re-fires. */
  focus?: { slug: string; n: number } | null
  /** Host callback: fires when the module swaps between the roster list
   *  and an enrollment take-over, so the host can hide its own chrome
   *  (core's owner card) while a wizard owns the screen. */
  onViewChange?: (view: 'list' | 'enroll') => void
}


/** Root export — JarvYZ (and the standalone SPA) load this via
 *  @yz-dev/react-dynamic-module. Creates a per-mount People store bound
 *  to the injected api, then provides Theme / WS / Api / Capabilities /
 *  Store contexts before rendering the inner page.
 *
 *  Per-mount store rationale: the api injected from the host can vary
 *  (JarvYZ-embedded vs standalone vs different hosts), and rebinding
 *  store actions to the right api is cleaner with a fresh store per
 *  mount than a module-level singleton + setter dance. */
export function PeoplePage({ theme, wsApi, api, capabilities, focus, onViewChange }: PeoplePageProps) {
  const caps = capabilities ?? DEFAULT_CAPABILITIES
  const store = useMemo(() => createPeopleStore(api), [api])

  const inner = (
    <ApiContext.Provider value={api}>
      <WSContext.Provider
        value={wsApi ?? { send: () => {}, subscribe: () => () => {}, isConnected: false }}
      >
        <CapabilitiesContext.Provider value={caps}>
          <StoreProvider value={store}>
            <PeoplePageInner focus={focus} onViewChange={onViewChange} />
          </StoreProvider>
        </CapabilitiesContext.Provider>
      </WSContext.Provider>
    </ApiContext.Provider>
  )

  return theme ? <ThemeProvider theme={theme}>{inner}</ThemeProvider> : inner
}


/** The old always-on intro paragraph, demoted to a tooltip (2026-07-10
 *  restyle): reference prose you read once, not page furniture. */
const ENROLL_EXPLAINER =
  'Each person enrolls once and contributes to multiple downstream systems: ' +
  'their chatterbox voice clone, speaker-ID embedding, and (if they own the ' +
  'wake word) the actual wake training data. Visitor enrollment also adds ' +
  'free human-voice negatives to the wake trainer.'

function PeoplePageInner({
  focus,
  onViewChange,
}: {
  focus?: { slug: string; n: number } | null
  onViewChange?: (view: 'list' | 'enroll') => void
}) {
  const { people, loading, error, refresh } = usePeopleList()
  const { script } = useSceneScript()
  const caps = useCapabilities()
  const [newOpen, setNewOpen] = useState(false)
  const [enrollSlug, setEnrollSlug] = useState<string | null>(null)
  const { detail, loading: detailLoading, refresh: refreshDetail } =
    usePersonDetail(enrollSlug)

  // Host deep-link (core owner card -> "Manage voice"): open the requested
  // person's enrollment. Keyed on the nonce so re-clicks re-fire.
  useEffect(() => {
    if (focus?.slug) setEnrollSlug(focus.slug)
  }, [focus?.n, focus?.slug])

  // Tell the host which view owns the screen — it hides its owner card
  // while a wizard is up.
  useEffect(() => {
    onViewChange?.(enrollSlug ? 'enroll' : 'list')
  }, [enrollSlug, onViewChange])

  const noWakeOwnerYet = !people.some((p) => p.is_wake_owner)

  // Under JarvYZ the owner renders as person #1 (core's owner card), so
  // hide them here to avoid a dup. Standalone has no host card — show
  // everyone, or the owner would exist nowhere at all.
  const roster =
    caps.deployTarget === 'jarvis' ? people.filter((p) => !p.is_owner) : people

  // Enrollment view
  if (enrollSlug && detail && script) {
    return (
      <EnrollmentWizard
        detail={detail}
        script={script}
        onClose={() => {
          setEnrollSlug(null)
          void refresh()
        }}
        onChanged={() => {
          void refreshDetail()
          void refresh()
        }}
      />
    )
  }

  if (enrollSlug && detailLoading) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  // List view. No standalone "People" title (2026-07-10 restyle — it
  // repeated the nav entry): a slim roster header row carries the count,
  // the explainer (as a tooltip) and the Add action.
  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Roster{roster.length > 0 ? ` · ${roster.length}` : ''}
        </Typography>
        <Tooltip title={ENROLL_EXPLAINER} arrow>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<AddIcon />}
          variant="outlined"
          onClick={() => setNewOpen(true)}
        >
          Add person
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : people.length === 0 ? (
        // Nobody at all — first-run invite with its own CTA.
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            borderStyle: 'dashed',
            py: 6,
            px: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No people enrolled yet.
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
            Start with yourself — you'll own the wake word and probably want
            JarvYZ to obey your commands.
          </Typography>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => setNewOpen(true)}
          >
            Add the first person
          </Button>
        </Box>
      ) : roster.length === 0 ? (
        // Owner exists but the roster is empty — the common early state.
        // Prose only; the Add action already sits in the header row.
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            borderStyle: 'dashed',
            py: 4,
            px: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
            No one else enrolled yet.
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Add family and frequent visitors — every enrollment sharpens
            speaker-ID and feeds free human-voice negatives to the wake trainer.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {roster.map((p) => (
            <PersonCard
              key={p.slug}
              person={p}
              script={script}
              onClick={() => setEnrollSlug(p.slug)}
            />
          ))}
        </Stack>
      )}

      <NewPersonDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(slug) => {
          setNewOpen(false)
          void refresh()
          // Jump straight into enrollment
          setEnrollSlug(slug)
        }}
        noWakeOwnerYet={noWakeOwnerYet}
      />
    </Box>
  )
}
