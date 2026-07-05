import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PeopleIcon from '@mui/icons-material/People'
import { ThemeProvider, type Theme } from '@mui/material/styles'

import { ApiContext, type PeopleApi } from './lib/api'
import { WSContext, type WSApi } from './lib/ws'
import { CapabilitiesContext, DEFAULT_CAPABILITIES, type Capabilities } from './lib/capabilities'
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
export function PeoplePage({ theme, wsApi, api, capabilities }: PeoplePageProps) {
  const caps = capabilities ?? DEFAULT_CAPABILITIES
  const store = useMemo(() => createPeopleStore(api), [api])

  const inner = (
    <ApiContext.Provider value={api}>
      <WSContext.Provider
        value={wsApi ?? { send: () => {}, subscribe: () => () => {}, isConnected: false }}
      >
        <CapabilitiesContext.Provider value={caps}>
          <StoreProvider value={store}>
            <PeoplePageInner />
          </StoreProvider>
        </CapabilitiesContext.Provider>
      </WSContext.Provider>
    </ApiContext.Provider>
  )

  return theme ? <ThemeProvider theme={theme}>{inner}</ThemeProvider> : inner
}


function PeoplePageInner() {
  const { people, loading, error, refresh } = usePeopleList()
  const { script } = useSceneScript()
  const [newOpen, setNewOpen] = useState(false)
  const [enrollSlug, setEnrollSlug] = useState<string | null>(null)
  const { detail, loading: detailLoading, refresh: refreshDetail } =
    usePersonDetail(enrollSlug)

  const noWakeOwnerYet = !people.some((p) => p.is_wake_owner)

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

  // List view
  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 2, gap: 1 }}>
        <PeopleIcon color="action" />
        <Typography variant="h5" sx={{ flex: 1 }}>
          People
        </Typography>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setNewOpen(true)}
        >
          Add person
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Each person enrolls once and contributes to multiple downstream systems:
        their chatterbox voice clone, speaker-ID embedding, and (if they own the wake
        word) the actual wake training data. Visitor enrollment also adds
        free human-voice negatives to the wake trainer.
      </Typography>

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
      ) : (
        <Stack spacing={1.5}>
          {people.map((p) => (
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
