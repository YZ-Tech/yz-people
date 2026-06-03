// Per-mount StoreContext. Each PeoplePage mount creates its own store
// (factory bound to the injected PeopleApi) and provides it via this
// context. Children call `usePeopleStore(selector)` — same body shape as
// JarvYZ's `useStore(selector)`, only the hook name + identity differ.

import { createContext, useContext } from 'react'
import type { PeopleState, PeopleStore } from '../store'

const StoreContext = createContext<PeopleStore | null>(null)

export const StoreProvider = StoreContext.Provider

/** Read from the People store. Throws when used outside a StoreProvider —
 *  catches the "forgot to wrap" mistake at the first hook call. */
export function usePeopleStore<T>(selector: (s: PeopleState) => T): T {
  const store = useContext(StoreContext)
  if (!store) throw new Error('usePeopleStore called outside StoreProvider')
  return store(selector)
}
