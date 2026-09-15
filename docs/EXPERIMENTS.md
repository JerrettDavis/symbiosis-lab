# Experiments and interpretation

## Hypothesis 1: signals change local decisions

Save a paused checkpoint. Identify a cell by ID and position. Apply the same A pulse within reach, then step the same tick count. Compare A input, receptor gain, action gates, position, energy, and survival. Repeat from that checkpoint with signaling off.

Expect a nonzero signal field in both branches, but zero A/B controller inputs and no new secretion in the knockout. The unit tests establish this mechanism directly. They do not establish that signaling improves survival.

A signaling-off treatment changes both information and secretion costs. To isolate the value of information in future experiments, split the setting into emission, sensing, and cost controls. Do not interpret the present combined knockout as an isolated measure of communication benefit.

## Hypothesis 2: lifetime adaptation and mutation are different

With mutation zero, reproduce and verify that each child genome exactly matches its founder lineage's genome. Expose cells to a persistent signal and observe receptor gains changing even though inherited loci do not. Disable adaptation to freeze those gains. Mutation occurs at division; it does not explain all within-lifetime changes.

## Hypothesis 3: sustained external input changes persistence

Compare zero supply and the meadow input setting from matching initial states. The initial world still contains nutrient stores when the supply slider reaches zero. Cells can consume and recycle those stores for a while. Ledger dissipation prevents energy-equivalent quantity from appearing spontaneously. Observe eventual extinction or persistence over a prespecified finite window, rather than declaring a system perpetual after a short run.

## Matched-initial-state batch

```sh
npm run build
npm run experiment -- --seeds=1,7,42 --ticks=2000 --out=data/experiments
```

For each seed, the command constructs one complete initial state, clones it for all treatments, applies the relevant config patch, and advances exactly N ticks. The four variants are baseline, signals-off, plasticity-off, and mutation-off. Summary CSV contains final state metrics; each per-run JSON includes its sampled history and final full-state SHA-256 checksum.

No trial is discarded for extinction. A zero population is a result, not a reason for hidden regeneration. Runs use the same starting PRNG state, but different actions consume draws differently. They do not share an exogenously aligned random stream after divergence. The simulation seed is not a guarantee of identical stochastic noise across treatments.

The bundled example data are descriptive results, not inferential statistics or a test of consciousness. Three seeds are insufficient for strong claims. Define primary outcomes and run more seeds before comparing mechanisms. Suggested outcomes are survival at a fixed tick, cumulative offspring, time to extinction, and resource conversion efficiency; include intervention costs.

## Recommended next experiments

- Compare a cost-matched signal receiver knockout against baseline.
- Compare intact and scrambled receptor/channel mappings with matched costs and identical initial genomes.
- Track parent lifetime offspring counts and trait distributions to distinguish selection from mutation-driven spread and drift.
- Evaluate damage response against equal-energy unperturbed controls; distinguish repair by surviving cells from recolonization by neighbors.
- Require repeated, lineage-preserving collective reproduction before calling spatial clusters organisms.

## Known measurement limits

The browser retains only the last 600 ten-tick samples, while experiments currently export that same bounded history. Runs beyond 6,000 ticks therefore omit early history in the output, though cumulative counters and final checksums remain. For longitudinal research, add a streaming recorder rather than treating retained samples as a complete lifetime trace.

The notebook records config changes and brushes with tick positions but is not a lossless replay log: reset and import replace history, older events expire, and every per-cell action is not recorded. Full snapshots are the reliable replay boundary. A checkpoint's checksum includes metadata such as config-event history, so a changed checksum alone does not demonstrate changed biology.
