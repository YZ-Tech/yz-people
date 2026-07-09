// Satellite-internal zustand store for the People page.
//
// Factory pattern: createPeopleStore(api) returns a store bound to the
// host-provided PeopleApi. The module root (PeoplePage.tsx) creates the
// store on mount with useMemo + provides it via StoreContext.
//
// This is intentionally minimal — the People page is largely list-fetch +
// imperative-action shaped, so we keep the store thin: just the list +
// the active enrollment focus + the script. Per-person detail still
// fetches imperatively via the api (kept in component state).

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { produce } from 'immer'
import type { PeopleApi } from './lib/api'
import type { PersonSummary, SceneScript } from './types'


export interface PeopleSlice {
  people: PersonSummary[]
  script: SceneScript | null
  listLoading: boolean
  listError: string | null
  scriptError: string | null
}


export interface PeopleState {
  people: PeopleSlice

  // ── mutations + actions ─────────────────────────────────────
  setListError: (e: string | null) => void

  refreshList: () => Promise<void>
  fetchScript: () => Promise<void>

  createPerson: (body: Partial<{
    slug: string
    display_name: string
    language: string
    can_command: boolean
    is_wake_owner: boolean
    location: string
    timezone: string
    github_username: string
    about: string
  }>) => Promise<{ ok: boolean; slug?: string; error?: string }>

  deletePerson: (slug: string) => Promise<{ ok: boolean; error?: string }>
}


export type PeopleStore = UseBoundStore<StoreApi<PeopleState>>


/** Create a People store bound to the host-provided PeopleApi.
 *  Called once at module mount (PeoplePage.tsx). */
export function createPeopleStore(api: PeopleApi): PeopleStore {
  return create<PeopleState>((set) => ({
    people: {
      people: [],
      script: null,
      listLoading: true,
      listError: null,
      scriptError: null,
    },

    setListError: (e) =>
      set(produce((s: PeopleState) => { s.people.listError = e })),

    refreshList: async () => {
      try {
        const { people } = await api.list()
        set(produce((s: PeopleState) => {
          s.people.people = people
          s.people.listError = null
          s.people.listLoading = false
        }))
      } catch (e) {
        set(produce((s: PeopleState) => {
          s.people.listError = e instanceof Error ? e.message : String(e)
          s.people.listLoading = false
        }))
      }
    },

    fetchScript: async () => {
      try {
        const script = await api.script()
        set(produce((s: PeopleState) => {
          s.people.script = script
          s.people.scriptError = null
        }))
      } catch (e) {
        set(produce((s: PeopleState) => {
          s.people.scriptError = e instanceof Error ? e.message : String(e)
        }))
      }
    },

    createPerson: async (body) => {
      const r = await api.create(body)
      if (r.ok) {
        // Best-effort refresh; ignore errors here (caller already has the
        // success+slug from the create call).
        void (async () => {
          try {
            const { people } = await api.list()
            set(produce((s: PeopleState) => { s.people.people = people }))
          } catch { /* soft-fail */ }
        })()
      }
      return r
    },

    deletePerson: async (slug) => {
      const r = await api.remove(slug)
      if (r.ok) {
        void (async () => {
          try {
            const { people } = await api.list()
            set(produce((s: PeopleState) => { s.people.people = people }))
          } catch { /* soft-fail */ }
        })()
      }
      return r
    },
  }))
}
