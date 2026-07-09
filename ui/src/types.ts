// Shared types mirroring web/api/people.py.

export type Bucket =
  | 'clone_source'
  | 'speaker_ref'
  | 'wake_positives'
  | 'wake_negatives'

export const BUCKETS: Bucket[] = [
  'clone_source',
  'speaker_ref',
  'wake_positives',
  'wake_negatives',
]

export type PersonSummary = {
  slug: string
  display_name: string
  language: string
  can_command: boolean
  is_wake_owner: boolean
  /** The singleton owner (mirrors core's settings.user). Rendered as
   *  person #1 by the host and hidden from this roster to avoid a dup. */
  is_owner: boolean
  /** Filename of this person's ref in the host's voice-clone library
   *  (null = not promoted yet). Written by the CloneVoicePanel. */
  voice_clone_id: string | null
  buckets: Record<Bucket, number>
  enrolled_at: number
}

export type PersonMeta = {
  slug: string
  display_name: string
  language: string
  can_command: boolean
  is_wake_owner: boolean
  is_owner?: boolean
  // Profile subset — mirrors core's owner profile (settings.user) so every
  // person carries an identity, not just the owner. display_name is the
  // name. Optional: pre-existing meta.json files predate these fields.
  location?: string
  timezone?: string
  github_username?: string
  about?: string
  enrolled_at: number
  voice_clone_id: string | null
  speaker_embedding_centroid_path: string | null
}

export type AutoMetaAttribute = {
  value: unknown
  confidence: number
  observations: number
  first_seen: number
  last_seen: number
  source_chunks: string[]
}

export type AutoMetaNote = {
  text: string
  ts: number
  source_chunks: string[]
}

export type AutoMeta = {
  tags: string[]
  attributes: Record<string, AutoMetaAttribute>
  notes: AutoMetaNote[]
}

export type RecordingItem = {
  name: string
  size_bytes: number
  mtime: number
}

export type PersonDetail = {
  slug: string
  meta: PersonMeta
  auto_meta: AutoMeta
  buckets: Record<Bucket, RecordingItem[]>
}

// ── Scene script (from GET /api/people/script) ─────────────────────────

export type SingleTakeScene = {
  id: string
  text: string
  instruction?: string
  target_seconds?: number
}

export type SingleTakeSection = {
  mode: 'single_take'
  purpose: string
  scenes: SingleTakeScene[]
  instruction?: string
  target_seconds?: number
}

export type BatchRepsBatch = {
  id: string
  instruction: string
  reps: number
}

export type BatchRepsSection = {
  mode: 'batch_reps'
  purpose: string
  phrase: string
  batches: BatchRepsBatch[]
  auto_segment: boolean
}

export type BatchScriptSection = {
  mode: 'batch_script'
  purpose: string
  instruction: string
  script_lines: string[]
  auto_segment: boolean
}

export type SceneScript = {
  clone_source: SingleTakeSection
  speaker_ref: SingleTakeSection
  wake_positives: BatchRepsSection
  wake_negatives: BatchScriptSection
}
