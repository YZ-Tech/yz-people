import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { CloneVoicePanel } from './CloneVoicePanel'
import { SceneRecorder } from './SceneRecorder'
import { BatchRepsRecorder } from './BatchRepsRecorder'
import { BatchScriptRecorder } from './BatchScriptRecorder'
import { useUploadRecording, useDeleteRecording } from '../hooks/usePeople'
import type {
  Bucket,
  PersonDetail,
  SceneScript,
  SingleTakeScene,
  SingleTakeSection,
  BatchRepsBatch,
  BatchScriptSection,
} from '../types'

type BucketKey = Bucket

type Step =
  | {
      kind: 'single_take'
      bucket: BucketKey
      scene: SingleTakeScene
      section: SingleTakeSection
    }
  | {
      kind: 'batch_reps'
      bucket: 'wake_positives'
      batch: BatchRepsBatch
      phrase: string
    }
  | {
      kind: 'batch_script'
      bucket: 'wake_negatives'
      section: BatchScriptSection
    }

/** Walks the full enrollment sequence: clone_source → speaker_ref →
 *  wake_positives (only if is_wake_owner) → wake_negatives. Lands on
 *  the first incomplete step for quit-and-resume. */
export function EnrollmentWizard({
  detail,
  script,
  onClose,
  onChanged,
}: {
  detail: PersonDetail
  script: SceneScript
  onClose: () => void
  onChanged: () => void
}) {
  const flow = useMemo(() => buildFlow(detail, script), [detail, script])
  const uploadRecording = useUploadRecording()
  const deleteRecording = useDeleteRecording()
  const [idx, setIdx] = useState(() => flow.firstUnfinishedIndex)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = flow.steps[idx]
  const done = idx >= flow.steps.length

  // Single-take handler — one blob, named `{scene.id}.wav`
  const handleSingleTakeSave = async (
    scene: SingleTakeScene,
    bucket: BucketKey,
    blob: Blob,
  ): Promise<void> => {
    setSaving(true)
    setError(null)
    const r = await uploadRecording(detail.slug, bucket, `${scene.id}.wav`, blob)
    setSaving(false)
    if (!r.ok) {
      setError(r.error || 'Upload failed')
      return
    }
    onChanged()
    setIdx((i) => i + 1)
  }

  // Batch handler — N blobs, named `{prefix}_NN.wav`. Uploaded in
  // parallel; any failure surfaces an error and aborts the advance.
  const handleBatchSave = async (
    bucket: BucketKey,
    prefix: string,
    blobs: Blob[],
  ): Promise<void> => {
    setSaving(true)
    setError(null)
    const results = await Promise.all(
      blobs.map((blob, i) =>
        uploadRecording(
          detail.slug,
          bucket,
          `${prefix}_${String(i).padStart(3, '0')}.wav`,
          blob,
        ),
      ),
    )
    setSaving(false)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      setError(`${failed.length} uploads failed (${failed[0].error || ''})`)
      return
    }
    onChanged()
    setIdx((i) => i + 1)
  }

  const handleSkip = () => setIdx((i) => i + 1)

  const handleRedoExisting = async (scene: SingleTakeScene, bucket: BucketKey) => {
    const existing = `${scene.id}.wav`
    if (detail.buckets[bucket].some((r) => r.name === existing)) {
      await deleteRecording(detail.slug, bucket, existing)
      onChanged()
    }
  }

  if (done) {
    return (
      <Box>
        <Header onClose={onClose} title={`${detail.meta.display_name} — enrollment complete`} />
        <Alert severity="success" sx={{ mb: 2 }}>
          All scenes recorded. Speaker-embedding extraction (Phase 4) lands in
          a follow-up; the voice clone is ready below.
        </Alert>
        <CloneVoicePanel detail={detail} onChanged={onChanged} />
        <Button variant="contained" onClick={onClose}>
          Back to People
        </Button>
      </Box>
    )
  }

  if (!step) return null

  return (
    <Box>
      <Header
        onClose={onClose}
        title={detail.meta.display_name}
        chips={[stepLabel(step), `${idx + 1} / ${flow.steps.length}`]}
      />
      <LinearProgress
        variant="determinate"
        value={((idx + 1) / flow.steps.length) * 100}
        sx={{ mb: 2, height: 6, borderRadius: 3 }}
      />

      {step.kind === 'single_take' && (
        <SingleTakeStep
          step={step}
          alreadyExists={detail.buckets[step.bucket].some(
            (r) => r.name === `${step.scene.id}.wav`,
          )}
          saving={saving}
          onSave={(blob) => handleSingleTakeSave(step.scene, step.bucket, blob)}
          onSkip={handleSkip}
          onRedo={() => handleRedoExisting(step.scene, step.bucket)}
        />
      )}

      {step.kind === 'batch_reps' && (
        <BatchRepsRecorder
          phrase={step.phrase}
          batchId={step.batch.id}
          instruction={step.batch.instruction}
          targetReps={step.batch.reps}
          saving={saving}
          onSave={(wavs) => handleBatchSave(step.bucket, step.batch.id, wavs)}
          onSkip={handleSkip}
        />
      )}

      {step.kind === 'batch_script' && (
        <BatchScriptRecorder
          instruction={step.section.instruction}
          scriptLines={step.section.script_lines}
          saving={saving}
          onSave={(wavs) => handleBatchSave(step.bucket, 'negatives', wavs)}
          onSkip={handleSkip}
        />
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  )
}

function SingleTakeStep({
  step,
  alreadyExists,
  saving,
  onSave,
  onSkip,
  onRedo,
}: {
  step: { kind: 'single_take'; bucket: BucketKey; scene: SingleTakeScene; section: SingleTakeSection }
  alreadyExists: boolean
  saving: boolean
  onSave: (blob: Blob) => Promise<void>
  onSkip: () => void
  onRedo: () => Promise<void>
}) {
  return (
    <>
      {alreadyExists && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button size="small" color="inherit" onClick={onRedo}>
              Re-record
            </Button>
          }
        >
          Already recorded. Click "Re-record" to redo, or "Skip" to keep + move on.
        </Alert>
      )}
      <SceneRecorder
        instruction={step.scene.instruction || step.section.instruction || ''}
        text={step.scene.text}
        targetSeconds={step.scene.target_seconds || step.section.target_seconds}
        saving={saving}
        onSave={async (blob) => {
          await onSave(blob)
        }}
        onSkip={onSkip}
      />
    </>
  )
}

function Header({
  title,
  chips,
  onClose,
}: {
  title: string
  chips?: string[]
  onClose: () => void
}) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={onClose} size="small">
        Back
      </Button>
      <Typography variant="h6" sx={{ flex: 1 }}>
        {title}
      </Typography>
      {chips?.map((c) => (
        <Chip key={c} label={c} size="small" />
      ))}
    </Stack>
  )
}

function stepLabel(step: Step): string {
  if (step.kind === 'single_take') {
    return step.bucket === 'clone_source' ? 'Voice clone source' : 'Speaker ID reference'
  }
  if (step.kind === 'batch_reps') return `Wake reps · ${step.batch.id}`
  return 'Wake negatives'
}

// ── Flow construction ────────────────────────────────────────────────

function buildFlow(detail: PersonDetail, script: SceneScript) {
  const steps: Step[] = []

  // 1. clone_source — single_take per scene
  for (const scene of script.clone_source.scenes) {
    steps.push({ kind: 'single_take', bucket: 'clone_source', scene, section: script.clone_source })
  }
  // 2. speaker_ref — single_take per scene
  for (const scene of script.speaker_ref.scenes) {
    steps.push({ kind: 'single_take', bucket: 'speaker_ref', scene, section: script.speaker_ref })
  }
  // 3. wake_positives — batch per delivery style (owner only)
  if (detail.meta.is_wake_owner) {
    for (const batch of script.wake_positives.batches) {
      steps.push({
        kind: 'batch_reps',
        bucket: 'wake_positives',
        batch,
        phrase: script.wake_positives.phrase,
      })
    }
  }
  // 4. wake_negatives — single batch (read-aloud script)
  steps.push({ kind: 'batch_script', bucket: 'wake_negatives', section: script.wake_negatives })

  // Resume point — first incomplete step
  let firstUnfinishedIndex = steps.length
  for (let i = 0; i < steps.length; i++) {
    if (!stepIsDone(steps[i], detail)) {
      firstUnfinishedIndex = i
      break
    }
  }
  return { steps, firstUnfinishedIndex }
}

function stepIsDone(step: Step, detail: PersonDetail): boolean {
  if (step.kind === 'single_take') {
    const want = `${step.scene.id}.wav`
    return detail.buckets[step.bucket].some((r) => r.name === want)
  }
  if (step.kind === 'batch_reps') {
    // Batch is "done" when at least `reps` files exist matching the prefix
    const prefix = `${step.batch.id}_`
    const got = detail.buckets[step.bucket].filter((r) => r.name.startsWith(prefix)).length
    return got >= step.batch.reps
  }
  // batch_script — any files in wake_negatives means we've recorded once
  return detail.buckets[step.bucket].length > 0
}
