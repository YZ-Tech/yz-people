// Hooks for the People page — all backed by the injected PeopleApi
// (from ../lib/api). The JarvYZ-side and standalone hosts inject
// different adapters but the API surface is identical.
//
// Returning callbacks from hooks (vs the previous standalone exports
// at module scope) is the change relative to the pre-migration version.
// Components now do:
//
//   const createPerson = useCreatePerson()
//   const r = await createPerson(body)
//
// instead of the old module-level `import { createPerson } from '...'`.

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../lib/api'
import type {
  Bucket,
  PersonDetail,
  PersonSummary,
  SceneScript,
} from '../types'


export function usePeopleList() {
  const api = useApi()
  const [people, setPeople] = useState<PersonSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api.list()
      setPeople(data.people || [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { people, loading, error, refresh }
}


export function usePersonDetail(slug: string | null) {
  const api = useApi()
  const [detail, setDetail] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const data = await api.get(slug)
      setDetail(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [api, slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { detail, loading, error, refresh }
}


export function useSceneScript() {
  const api = useApi()
  const [script, setScript] = useState<SceneScript | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .script()
      .then((d) => { if (!cancelled) setScript(d) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  return { script, error }
}


// Imperative actions — used by dialogs / wizards. Each hook returns a
// stable callback bound to the injected api.


export function useCreatePerson() {
  const api = useApi()
  return useCallback(
    (body: Partial<{
      slug: string
      display_name: string
      language: string
      can_command: boolean
      is_wake_owner: boolean
      location: string
      timezone: string
      github_username: string
      about: string
    }>) => api.create(body),
    [api],
  )
}


export function useDeletePerson() {
  const api = useApi()
  return useCallback((slug: string) => api.remove(slug), [api])
}


export function useUploadRecording() {
  const api = useApi()
  return useCallback(
    (slug: string, bucket: Bucket, name: string, blob: Blob) =>
      api.uploadRecording(slug, bucket, name, blob),
    [api],
  )
}


export function useDeleteRecording() {
  const api = useApi()
  return useCallback(
    (slug: string, bucket: Bucket, name: string) =>
      api.deleteRecording(slug, bucket, name),
    [api],
  )
}


export function useRecordingPlaybackUrl() {
  const api = useApi()
  return useCallback(
    (slug: string, bucket: Bucket, name: string) =>
      api.recordingPlaybackUrl(slug, bucket, name),
    [api],
  )
}
