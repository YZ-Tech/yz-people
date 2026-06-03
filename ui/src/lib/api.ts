// Semantic API contract for the people module.
//
// Same pattern as the music + wakeword-trainer satellites: the module
// declares named operations; the host (JarvYZ or the standalone SPA)
// provides an implementation. Decouples the module from any specific URL
// scheme.
//
// Adapters shipped with the module:
//   - createSatelliteApi() — wraps the satellite's native routes
//     (/people, /script, /people/{slug}/recordings/{bucket}, ...).
//     Used by the standalone SPA. All dynamic slug routes namespaced
//     under /people/ so StaticFiles can serve /logo.svg etc. at root.
//
// The JarvYZ-embedded adapter lives in `frontend/src/pages/Dev/People/
// PeoplePage.tsx` and wraps JarvYZ's `/api/people/*` proxy (which forwards
// to the satellite). Functionally identical; just different URL prefix.

import { createContext, useContext } from 'react'
import type { Bucket, PersonDetail, PersonSummary, SceneScript } from '../types'


export interface SatelliteSettings {
  data_root: string
}


/** The complete API surface the people module needs from its host.
 *  All methods throw on failure (Error with backend message). */
export interface PeopleApi {
  // Reads
  list(): Promise<{ people: PersonSummary[] }>
  get(slug: string): Promise<PersonDetail>
  script(): Promise<SceneScript>

  // Mutations
  create(body: Partial<{
    slug: string
    display_name: string
    language: string
    can_command: boolean
    is_wake_owner: boolean
  }>): Promise<{ ok: boolean; slug?: string; error?: string }>

  update(slug: string, patch: Partial<{
    display_name: string
    language: string
    can_command: boolean
    is_wake_owner: boolean
    voice_clone_id: string | null
    speaker_embedding_centroid_path: string | null
  }>): Promise<{ ok: boolean; slug?: string; error?: string }>

  remove(slug: string): Promise<{ ok: boolean; error?: string }>

  // Recordings
  uploadRecording(
    slug: string,
    bucket: Bucket,
    name: string,
    blob: Blob,
  ): Promise<{ ok: boolean; error?: string; size_bytes?: number }>

  deleteRecording(
    slug: string,
    bucket: Bucket,
    name: string,
  ): Promise<{ ok: boolean; error?: string }>

  /** Absolute (or origin-relative) URL the browser can <audio src=...> on
   *  to play back a recording. */
  recordingPlaybackUrl(slug: string, bucket: Bucket, name: string): string

  // Satellite settings (data_root, etc.)
  getSettings?(): Promise<SatelliteSettings>
  patchSettings?(patch: Partial<SatelliteSettings>): Promise<SatelliteSettings>
}


// ---------------------------------------------------------------------------


export class NotSupportedError extends Error {
  constructor(operation: string) {
    super(`Operation '${operation}' is not supported by this host`)
    this.name = 'NotSupportedError'
  }
}

const stub = <T>(name: string): Promise<T> =>
  Promise.reject(new NotSupportedError(name))

const NO_API: PeopleApi = {
  list: () => stub('list'),
  get: () => stub('get'),
  script: () => stub('script'),
  create: () => stub('create'),
  update: () => stub('update'),
  remove: () => stub('remove'),
  uploadRecording: () => stub('uploadRecording'),
  deleteRecording: () => stub('deleteRecording'),
  recordingPlaybackUrl: () => '',
}

export const ApiContext = createContext<PeopleApi>(NO_API)
export const useApi = () => useContext(ApiContext)


// ---------------------------------------------------------------------------
// Satellite adapter — wraps the satellite's native routes via fetch.
// Used by App.tsx (standalone SPA). JarvYZ-embedded uses its own adapter
// against /api/people/* (built in the host loader).


interface HttpClient {
  request<T>(method: string, path: string, body?: unknown, raw?: boolean): Promise<T>
}

function httpClient(apiBase: string): HttpClient {
  return {
    async request<T>(method: string, path: string, body?: unknown, raw?: boolean): Promise<T> {
      const url = apiBase + path
      const init: RequestInit = { method }
      if (body !== undefined) {
        if (raw) {
          init.body = body as BodyInit
        } else {
          init.headers = { 'Content-Type': 'application/json' }
          init.body = JSON.stringify(body)
        }
      }
      const res = await fetch(url, init)
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`${method} ${url} → ${res.status} ${detail}`)
      }
      const text = await res.text()
      return (text ? JSON.parse(text) : undefined) as T
    },
  }
}


/** Satellite-native adapter — talks to the standalone people daemon's
 *  routes (no `/api/people` prefix). The standalone SPA uses this. */
export function createSatelliteApi(
  { apiBase = '' }: { apiBase?: string } = {},
): PeopleApi {
  const h = httpClient(apiBase)
  return {
    list: () => h.request('GET', '/people'),
    get: (slug) => h.request('GET', `/people/${slug}`),
    script: () => h.request('GET', '/script'),

    create: async (body) => {
      try {
        const data = await h.request<{ ok: boolean; slug: string }>('POST', '/people', body)
        return { ok: true, slug: data.slug }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    update: async (slug, patch) => {
      try {
        const data = await h.request<{ ok: boolean; slug: string }>(
          'PUT',
          `/people/${slug}`,
          patch,
        )
        return { ok: true, slug: data.slug }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    remove: async (slug) => {
      try {
        await h.request('DELETE', `/people/${slug}`)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    uploadRecording: async (slug, bucket, name, blob) => {
      try {
        const form = new FormData()
        form.append('file', blob, name)
        const url =
          `${apiBase}/people/${slug}/recordings/${bucket}` +
          `?name=${encodeURIComponent(name)}`
        const r = await fetch(url, { method: 'POST', body: form })
        const data = await r.json()
        if (!r.ok) return { ok: false, error: data.detail || `HTTP ${r.status}` }
        return { ok: true, size_bytes: data.size_bytes }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    deleteRecording: async (slug, bucket, name) => {
      try {
        await h.request(
          'DELETE',
          `/people/${slug}/recordings/${bucket}/${encodeURIComponent(name)}`,
        )
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    recordingPlaybackUrl: (slug, bucket, name) =>
      `${apiBase}/people/${slug}/recordings/${bucket}/${encodeURIComponent(name)}`,

    getSettings: () => h.request('GET', '/settings'),
    patchSettings: (patch) => h.request('PATCH', '/settings', patch),
  }
}
