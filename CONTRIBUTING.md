# Contributing

Symbiosis Lab is an experimental artificial-life sandbox. Small, reproducible changes are welcome.

## Development

1. Fork and clone [the repository](https://github.com/JerrettDavis/symbiosis-lab).
2. Install Node 22.16+ (Node 24 LTS or Node 26 current).
3. Run `npm ci`, then `npm run verify`.
4. Run `npm run dev` and open http://localhost:8080.
5. Create a branch, make a focused change, and open a pull request against `main`.

The dev command builds once; rerun it after source changes. Generated `dist/`, local
checkpoints, environment files, and session notes are excluded from Git.

## Validation

- `npm run verify`: strict compilation, engine/HTTP tests, real-process persistence smoke test.
- UI changes: install `scripts/requirements-test.txt`, run `python -m playwright install chromium`, then `npm run test:browser`.
- Container changes: run `npm run test:docker` with a running Docker daemon.
- Packaging changes: run `python scripts/test-package.py` and `python scripts/package.py` after building.

CI tests Node 22, 24, and 26 on Linux and Windows, Chromium desktop/mobile, Docker
checkpoint recovery, and clean release extraction. The `Required checks` status
must pass before merging. Keep deterministic replay, energy accounting, snapshot
validation, and the engine's isolation from host state intact.

For model changes, document assumptions and use matched seeds and controls from
[the experiment protocol](docs/EXPERIMENTS.md). A favorable screenshot or a single
trajectory does not establish an evolutionary benefit.

## Issues and reviews

Use the issue forms for bugs and proposals. Include reproducible steps, version,
runtime, seed, and expected behavior. Follow the [code of conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities through [private reporting](https://github.com/JerrettDavis/symbiosis-lab/security/advisories/new).

Dependabot groups updates weekly for npm, Actions, browser tooling, and Docker.
Patch/minor updates can auto-merge after required CI passes; major updates require
maintainer review. Maintainers can enable GitHub auto-merge for other reviewed PRs.
See [repository maintenance](docs/MAINTAINING.md) for settings and releases.
