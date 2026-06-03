import { test, expect } from '@playwright/test'

/** Standalone-mode smoke + contract tests for the people satellite.
 *
 *  Verifies (without mutating per-person state beyond an isolated
 *  smoke-test slug that the create/delete pair cleans up):
 *  - SPA loads + standalone header strip + People list renders
 *  - HTTP contract: /health, /people, /script shapes
 *  - /settings round-trip (data_root)
 *  - Create + delete a smoke-test person (round-trips the full mutation surface)
 *  - WS /events emits a hello frame on connect
 *
 *  Run from satellites/yz-people/ui/:  npx playwright test
 *
 *  Idempotent: the smoke-test slug is deleted at the end. Re-running
 *  the suite is safe even after a partial failure (cleanup is best-
 *  effort + tolerates 404). */


// ─────────────────────── SPA shell ────────────────────────────────


test('standalone SPA loads + header strip + people list renders', async ({ page }) => {
  await page.goto('/')

  // Header strip rendered (from App.tsx StandaloneHeader). Selector by
  // src instead of role because the logo is decorative (alt="") so its
  // ARIA role flips to "presentation" — getByRole('img') wouldn't find
  // it. Asserting by src also proves the public/logo.svg is being
  // served by FastAPI StaticFiles.
  await expect(page.locator('header img[src="/logo.svg"]')).toBeVisible()
  await expect(page.locator('header').getByText('People', { exact: true })).toBeVisible()
  await expect(page.getByText(/satellite · standalone/i)).toBeVisible()

  // List rendered. Either a PersonCard for an existing slug, OR the
  // empty-state ("No people enrolled yet.") block. Both are valid
  // satellite states — assert the listing surface exists either way.
  await expect(
    page.getByRole('button', { name: /add person|add the first person/i }).first(),
  ).toBeVisible({ timeout: 10_000 })
})


// ─────────────────────── /health ──────────────────────────────────


test('GET /health responds 200 ok', async ({ request }) => {
  const res = await request.get('/health')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(body.python).toMatch(/^\d+\.\d+/)
  expect(body.platform).toMatch(/linux|win32|darwin/)
  expect(body.data_root).toMatch(/people$/)
})


// ─────────────────────── /people shape ────────────────────────────


test('GET /people returns {people: []} shape', async ({ request }) => {
  const res = await request.get('/people')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body).toHaveProperty('people')
  expect(Array.isArray(body.people)).toBe(true)

  // Empty list is valid (fresh install). Shape assertions only when
  // there's at least one person to inspect.
  if (body.people.length > 0) {
    const sample = body.people[0]
    expect(sample).toHaveProperty('slug')
    expect(sample).toHaveProperty('display_name')
    expect(sample).toHaveProperty('language')
    expect(sample).toHaveProperty('can_command')
    expect(sample).toHaveProperty('is_wake_owner')
    expect(sample).toHaveProperty('buckets')
    expect(sample).toHaveProperty('enrolled_at')
    expect(sample.buckets).toHaveProperty('clone_source')
    expect(sample.buckets).toHaveProperty('speaker_ref')
    expect(sample.buckets).toHaveProperty('wake_positives')
    expect(sample.buckets).toHaveProperty('wake_negatives')
    expect(sample.slug).toMatch(/^[a-z][a-z0-9_]{0,31}$/)
  }
})


// ─────────────────────── /script shape ────────────────────────────


test('GET /script returns the full enrollment SCENE_SCRIPT', async ({ request }) => {
  const res = await request.get('/script')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()

  expect(body).toHaveProperty('clone_source')
  expect(body).toHaveProperty('speaker_ref')
  expect(body).toHaveProperty('wake_positives')
  expect(body).toHaveProperty('wake_negatives')

  expect(body.clone_source.mode).toBe('single_take')
  expect(Array.isArray(body.clone_source.scenes)).toBe(true)
  expect(body.clone_source.scenes.length).toBeGreaterThan(0)

  expect(body.wake_positives.mode).toBe('batch_reps')
  expect(body.wake_positives.phrase).toBeTruthy()
  expect(Array.isArray(body.wake_positives.batches)).toBe(true)

  expect(body.wake_negatives.mode).toBe('batch_script')
  expect(Array.isArray(body.wake_negatives.script_lines)).toBe(true)
})


// ─────────────────────── /settings round-trip ─────────────────────


test('PATCH /settings round-trips data_root + restores', async ({ request }) => {
  const before = await (await request.get('/settings')).json()
  expect(before).toHaveProperty('data_root')

  // Patch to the same value (no-op safe round-trip — actually changing
  // the data_root would orphan all existing people for the next test
  // run on a shared dev box).
  const patchRes = await request.patch('/settings', {
    data: { data_root: before.data_root },
  })
  expect(patchRes.ok()).toBeTruthy()
  const after = await patchRes.json()
  expect(after.data_root).toBe(before.data_root)
})


// ─────────────────────── Create + delete round-trip ───────────────


test('POST /people then DELETE /{slug} round-trips cleanly', async ({ request }) => {
  // Use a fixed slug + clean it up at the end. If the previous run died
  // mid-test the slug may still exist — pre-delete to be safe (ignore
  // 404 on fresh boxes).
  const slug = 'smoketest_person'
  await request.delete(`/${slug}`).catch(() => { /* may not exist */ })

  // Create
  const createRes = await request.post('/people', {
    data: {
      slug,
      display_name: 'Smoke Test',
      language: 'en',
      can_command: false,
      is_wake_owner: false,
    },
  })
  expect(createRes.ok()).toBeTruthy()
  const created = await createRes.json()
  expect(created.ok).toBe(true)
  expect(created.slug).toBe(slug)

  // Read it back
  const detailRes = await request.get(`/${slug}`)
  expect(detailRes.ok()).toBeTruthy()
  const detail = await detailRes.json()
  expect(detail.slug).toBe(slug)
  expect(detail.meta.display_name).toBe('Smoke Test')
  expect(detail.buckets).toHaveProperty('clone_source')

  // Clean up
  const delRes = await request.delete(`/${slug}`)
  expect(delRes.ok()).toBeTruthy()

  // Verify gone
  const goneRes = await request.get(`/${slug}`)
  expect(goneRes.status()).toBe(404)
})


// ─────────────────────── WS /events emits ─────────────────────────


test('WS /events pushes a hello frame on connect', async ({ page }) => {
  // Open WS from inside the page so it shares origin + CORS context.
  await page.goto('/')

  const frame = await page.evaluate(
    () => new Promise<unknown>((resolve, reject) => {
      const ws = new WebSocket(`ws://${location.host}/events`)
      const t = setTimeout(() => {
        ws.close()
        reject(new Error('timeout waiting for /events frame'))
      }, 5_000)
      ws.onmessage = (e) => {
        clearTimeout(t)
        ws.close()
        try { resolve(JSON.parse(e.data)) } catch { resolve(e.data) }
      }
      ws.onerror = () => {
        clearTimeout(t)
        reject(new Error('ws error'))
      }
    }),
  )

  expect(frame).toHaveProperty('event')
  expect((frame as { event: string; kind?: string }).event).toBe('people')
  // server.py's @events handler sends an initial hello frame before
  // entering the queue loop.
  expect((frame as { kind?: string }).kind).toBe('hello')
})
