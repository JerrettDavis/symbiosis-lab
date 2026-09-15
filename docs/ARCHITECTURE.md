# Architecture and first-demo plan

## Goal

Turn the biological-bus analogy into an inspectable experiment: local receivers interpret shared chemical channels according to their inherited configuration and current state. Make energy costs, adaptation, inheritance, and failures observable before expanding complexity.

## Delivered scope

One cohesive TypeScript codebase. A Node HTTP server hosts the CPU engine and static browser UI. There are no runtime npm dependencies. TypeScript and Node declarations are build-time tools. Python/Playwright are optional test tools only. A database, microservice deployment, GPU service, and message broker would add operational layers without improving the first model.

```text
Browser: Canvas + inspector + controls
          | GET state / cell; POST interventions
          v
HTTP boundary: JSON validation, static files, same-origin writes
          |
          v
Authoritative process clock: bounded steps / callback
          |
          v
Pure World engine
  fields --> local receptors --> 7x7 controller --> actions --> fields
                 |                      |
          stress / gains       energy accounting / mutation
          |
          +--> snapshot: complete state + PRNG + array/map ordering
          |
          v
One persistent volume: /data/latest.json
```

The engine has no HTTP, filesystem, host clock, or ambient random imports. The server owns I/O. The UI is a view/controller, not a second simulator. Cell controllers cannot read global metrics, all cells, the simulation tick, or a goal image. Global metrics exist only in the observer layer.

## Tick scheduling

A 20 ms server timer accumulates the requested ticks per second. It runs at most 12 ticks per callback and caps measured elapsed time at 250 ms to prevent unbounded catch-up after suspension. Rate is a target, not a timing guarantee. All engine mutations execute synchronously on one event loop; asynchronous body parsing does not interleave an individual tick. The clock is not part of the biological state.

Fields update synchronously first. Living cells then process in a seeded random permutation, with resource and occupancy claims resolved in that order. Newborns are appended but do not run in their birth tick. New emissions enter the field after all cells have acted and influence sensing next tick. Nutrient uptake and waste deposits use randomized sequential resolution. These scheduling choices are model assumptions, not biological facts.

## Transport and control surface

| Endpoint | Purpose |
|---|---|
| GET / | Browser app |
| GET /healthz | Process status, tick, running flag, save error |
| GET /api/state | Rounded display fields, cells, metrics, bounded history, runtime state |
| GET /api/cells/:id | Full state and genome of one live cell |
| GET /api/presets | Available starting scenarios |
| GET /api/snapshot | Full-precision, versioned downloadable state |
| POST /api/snapshot | Validate and import a complete state; pause |
| POST /api/checkpoint | `{ "action": "save" }` or `{ "action": "load" }` |
| POST /api/command | Pause, resume, step, speed, config, reset, brush |

Examples:

```json
{"type":"step","ticks":100}
{"type":"config","patch":{"signals":false,"mutationRate":0}}
{"type":"brush","tool":"signalA","x":30,"y":20,"radius":3}
{"type":"reset","preset":"scarcity","seed":42}
```

Step accepts 1–250 ticks at the HTTP boundary and pauses. Requested speed is 1–120 ticks/s. Dynamic config permits supply, mutation rate/scale, signaling, receptor adaptation, sharing, and seasons. Lattice dimensions and founder count can be changed in source/headless construction or a valid checkpoint, not through the live config endpoint. Validated bounds are 16–96 columns, 12–64 rows, and at most 500 initial founders.

Display polling is approximately 3.3 Hz and independent of simulation speed. JSON state is cached between world mutations. Exported checkpoints do not use rounded display fields. Bounded histories store 600 samples at 10-tick intervals; notebook events retain 100 entries. The complete historical lineage tree is intentionally not retained, only each living cell's parent and founder identifiers.

## Persistence and replay

A checkpoint includes model version, config, lattice fields and walls, cells in insertion order, genomes, receptor gains, stress, counters, random state, next ID, ledger, history, and notebook. Derived occupancy and deterministic fertility maps are reconstructed.

The PRNG is Xorshift32 with an explicit zero-seed fallback. A JSON round-trip followed by matching interventions produces the same trajectory on the same runtime/model version. Do not assume bitwise reproducibility across JavaScript engines, floating-point implementations, or future model versions. Checksum comparisons require the same model and runtime.

Saves capture synchronously and rename a same-directory temporary file over `latest.json`. This prevents partially written JSON from being used after an ordinary process interruption. It is not a crash-consistent database or a power-loss durability guarantee: there is no fsync journal or redundant backup. The last successful save can be lost under storage/power failure. Keep exported snapshots for valuable experiments. An invalid saved checkpoint fails startup rather than silently discarding the run.

Autosave occurs every 30 seconds while dirty and on graceful SIGINT/SIGTERM. A force kill can lose changes since the last successful checkpoint. Playback speed, running state, selected cell, and UI layer are not checkpointed. Environment `PAUSED` sets startup behavior; restore/import always pause.

## Deployment boundaries

Compose publishes only `127.0.0.1`, uses a non-root Node process, drops capabilities, makes the root filesystem read-only, and mounts only `/data` as persistent writable storage. A small `/tmp` is ephemeral. No Docker socket or host home directory is mounted.

This is a single-user/local demo, not an Internet-facing authenticated service. See SECURITY.md before changing the bind address. Sharing a browser URL with another user shares control of the same world.

## Extension seams

1. Replace `regulate()` behind a documented perception/action contract while retaining deterministic tests.
2. Introduce a genome schema migration before adding genes/channels or changing controller topology.
3. Add observational connected-component/lineage analyses without giving controllers global knowledge.
4. Add structured event recording for selection analyses; keep bulk telemetry outside hot tick loops.
5. Profile before moving field updates to WebGPU or adding batch workers. Do not exchange determinism for nominal parallelism without checking model equivalence.
