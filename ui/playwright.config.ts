import { defineConfig, devices } from '@playwright/test'

// Standalone-mode smoke test against the people satellite.
//
// The webServer block auto-spawns `python -m yz_people` if it isn't
// already running on :9003. `reuseExistingServer: true` means tests
// happily share a satellite that JarvYZ auto-spawned or that you
// started by hand.
//
// Hardcoded venv path because this repo is set up to use a WSL-side
// venv at `.venv-wsl` (see CLAUDE.md). Override with PYTHON env var
// if you're running from a different setup.
const PY = process.env.PYTHON || '/mnt/y/projects/assistant/.venv-wsl/bin/python'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:9003',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `${PY} -m yz_people`,
    cwd: '..',
    url: 'http://127.0.0.1:9003/health',
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
