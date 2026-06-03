// Lib (IIFE) entry. The IIFE attaches these exports to `window.YzPeople`;
// JarvYZ loads it via @yz-dev/react-dynamic-module.
export { PeoplePage } from './PeoplePage'
export type { PeoplePageProps } from './PeoplePage'
export type { WSApi } from './lib/ws'
export type { Capabilities } from './lib/capabilities'
export { createSatelliteApi, NotSupportedError } from './lib/api'
export type { PeopleApi, SatelliteSettings } from './lib/api'
export type {
  Bucket,
  PersonDetail,
  PersonSummary,
  PersonMeta,
  AutoMeta,
  AutoMetaAttribute,
  AutoMetaNote,
  RecordingItem,
  SceneScript,
  SingleTakeSection,
  SingleTakeScene,
  BatchRepsSection,
  BatchRepsBatch,
  BatchScriptSection,
} from './types'
