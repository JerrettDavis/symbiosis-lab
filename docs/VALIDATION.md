# Validation

## Public repository verification

[GitHub Actions](https://github.com/JerrettDavis/symbiosis-lab/actions/workflows/ci.yml)
is the source of current verification results. Every push to `main` and pull request runs:

- Node 22 and 24 on Ubuntu and Windows: clean `npm ci`, strict compilation,
  45 engine/HTTP tests, real-process persistence/restart smoke, and `npm audit`.
- Native Chromium navigation on desktop/mobile: controls, signal intervention,
  inspection, knockout, checkpoints, JSON download/import, help, and layout checks.
- Docker image build and Compose startup, health, checkpoint persistence, and exact restart recovery.
- Release packaging regression test, ZIP integrity/checksums, and tests/smoke from
  a clean extraction without `node_modules`.

The `Required checks` job succeeds only when every verification job passes. Inspect
the run for the commit you use; a historical green run does not certify later code.
Release artifacts record the source commit in `BUILDINFO.json`.

## Original archive observations

The remainder records the original archive's execution environment and finite-run
observations. Its tool versions and environment limitations are historical, not
the current dependency versions or CI results.

Date: 2026-09-15. Version: 0.1.0-alpha.1. Model: symbiosis-0.1.

## Executed successfully

| Check | Result |
|---|---|
| TypeScript compilation | Full strict build passed, TypeScript 5.8.3 |
| Automated tests | 45 passed, 0 failed, 0 skipped |
| Actual HTTP process | Server entrypoint started, served app/API, accepted controls |
| Persistence | Saved checkpoint, stopped process, restarted, verified identical full state |
| Deterministic replay | Same seeds and full JSON restore produced identical future states |
| Physical-model invariants | Energy-equivalent accounting, blocked diffusion, occupancy, bounded genes, finite values, hereditary ancestry |
| Failure paths | Bad config/JSON/snapshots, collisions, unknown routes, invalid coordinates, wrong origin/content type |
| Browser UI | Desktop and mobile Chromium rendering/control checks through an in-memory HTTP bridge |
| Browser errors/layout | No unhandled JavaScript errors; no horizontal overflow at 412 × 915 |
| Paired experiments | 12 actual runs: seeds 1, 7, 42 × four variants, 2,000 ticks each |
| Extended run | Seed 42 through 12,100 ticks; exact 100-tick replay after a 12,000-tick checkpoint |
| Clean archive extraction | All 45 tests and actual-process restart smoke passed without `node_modules`; per-file SHA-256 checks passed |
| Compose structure | YAML parsed; loopback publishing, read-only root, named volume, and limits checked structurally, not in Docker |
| Package-lock graph | Fresh-directory offline `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` succeeded |

Test and browser transcripts are included in this directory. The automated suite includes 34 engine/model tests and 11 HTTP tests. The application smoke test is additional to the 45 tests.

## Extended-run observation

The 12,100-tick default run ended with 276 living cells, 3,414 cumulative births, 3,210 deaths, 9,104 mutated loci, and a maximum living generation of 27. Three founder lines remained. Energy-equivalent ledger residual was approximately -6.09e-6 units against approximately 3,345 stored units. Exact checkpoint continuation was verified. See `examples/long-run.json` for the raw result, runtime observation, and state checksum.

This establishes a finite observed trajectory for one setup, not perpetual survival, biological fidelity, adaptive superiority, open-ended evolution, or consciousness. In the included 2,000-tick examples, signaling-off runs ended with more cells than corresponding baselines; signal cost and information loss are confounded. No claim that communication or sharing is already evolutionarily beneficial is warranted.

## Browser qualification

The installed Chromium has a managed policy blocking network navigation. The policy was not modified. Tests used the actual compiled UI, stylesheet, and markup rendered in memory, with `/api/*` fetches bridged by the Python test runner to the real isolated Node HTTP server. State, controls, mutations, signaling, rendering, checkpoint save/restore, and JSON import executed against that server. This is not a mock simulation.

**Native browser navigation, native download behavior, and enforcement of the served Content Security Policy were not end-to-end tested here.** Export JSON was independently verified through the real HTTP endpoint. The regular `npm run test:browser` path performs normal navigation and download checks on an unrestricted development/CI browser. The bridge mode is explicitly opt-in:

```sh
LAB_OFFLINE_BROWSER=1 npm run test:browser
```

Screenshots in `docs/screenshots` are actual Chromium renders from the bridge-mode UI run, not generated concept art.

## Not executed here

**Docker image build, Compose startup, container health, container-volume ownership, and container restart were not executed.** This environment does not provide a Docker CLI/daemon. `Dockerfile`, `compose.yaml`, the container smoke script, and a GitHub Actions Docker job are supplied, but are not evidence that a container has already run.

A full network-backed clean `npm ci` was not executed because registry DNS was unavailable. Compilation used locally available copies of the exact locked package versions: TypeScript 5.8.3, @types/node 24.0.4, undici-types 7.8.0. The lock graph was independently checked offline in a fresh directory. No `node_modules` are shipped.

Executed application runtime: Node v22.16.0 on Linux x64. The Dockerfile targets Node 24; Node 24 and Windows runtime execution are defined in CI but were not run here. CI workflows have not been executed remotely. Do not infer security, accessibility, production-scale load, long-term storage durability, or cross-engine bitwise replay certification from these checks.

## Re-run locally

```sh
npm ci
npm run verify
python -m pip install -r scripts/requirements-test.txt
python -m playwright install chromium
npm run test:browser
npm run test:docker
```

The Docker command requires Docker Desktop or a running Docker service. Browser prerequisites are test-only. The prebuilt release can be started with `npm start` without installing the build/test packages.
