# Model specification: symbiosis-0.1

All quantities use arbitrary simulation units. A tick is not a millisecond of biological time. Receptors, hormones, cells, repair, and genomes are analogies, not molecular simulations.

## World

A finite rectangular lattice has reflecting outer boundaries. At most one cell occupies a site. Four-neighbor adjacency is used for sensing candidate locations, transfers, growth, clustering, and diffusion. There is no wraparound.

Fields: nutrient energy `F`, waste/toxicity `W`, channel A `A`, channel B `B`, barrier mask. Food diffuses at 0.045; waste at 0.09 with 0.012 decay; A at 0.18 with 0.045 decay; B at 0.13 with 0.035 decay.

```text
field'[i] = (field[i] + d * sum(field[j] - field[i])) * (1 - decay)
```

The sum covers only passable neighboring sites. All diffusion coefficients are below the four-neighbor explicit-stencil bound of 0.25. Walls transmit no fields or cells.

Food is added up to a site cap of 10, with actual additions charged to the external-input ledger. Cap 10 limits replenishment and manual food brushes; recycled cell material can temporarily push a site above that value. A fixed, deterministic fertility map shapes input by seed and location. Seasonal mode scales input by `0.55 + 0.45*sin(2*pi*tick/900)`. This is an externally specified environment, not an evolved sun or metabolism.

## Cell state

Each cell has identity, parent and founder IDs, generation, position, age, stored energy, integrity, 11 traits, 49 weights, two receptor gains, stress memory, most recent controller inputs/outputs, last summarized action, and the number of loci changed at its birth. The action summary is not a complete event trace: several actions can happen in one tick.

The founder controller and trait centers are hand-designed for viability and perturbed by seeded bounded variation. Cells are not created by spontaneous chemistry. The model contains no organism, tissue, brain, or species class.

## Controller

Seven inputs:

1. Constant bias 1.
2. Energy deficit: clamped `1 - energy / divisionThreshold`.
3. Local food: `tanh(food / 3)`.
4. Local waste: `tanh(waste / 2)`.
5. `tanh(A) * inheritedReceptorA * currentGainA`, or zero when signaling is disabled.
6. Corresponding channel B input.
7. `tanh(stressMemory)`.

A 7 × 7 matrix maps inputs to sigmoid output gates for uptake, repair, division, A emission, B emission, movement, and sharing. Signed inherited receptor traits allow the same channel to have different effects in different cells. The action executor applies explicit feasibility conditions and costs; a gate is not an unconditional API call.

Stress combines toxicity, low integrity, and low energy; memory follows an exponential moving average with rate 0.08. This is a small dynamical state, not autobiographical memory.

When receptor adaptation is enabled, each gain moves toward `1 / (1 + concentration * 0.5)` at a heritable adaptation rate. When signaling is disabled, the gain target is 1. When adaptation is disabled, existing gains freeze. Genomes do not change during a lifetime. Newborn gains reset to 1 and stress resets to 0.

## Actions and accounting

Cells acquire limited local food, convert it to energy at inherited efficiency, and deposit proportional waste. Inefficiency is dissipated energy. Maintenance depends on uptake capacity, motility, and secretion traits. Integrity declines from baseline damage and local toxicity. A funded repair action restores integrity at an energy cost. Emissions, movement, and transfers also cost energy.

Cells can donate energy to a lower-energy adjacent cell when their sharing gate and reserves permit; 5% of the transferred amount is dissipated. This behavior is provided in the scaffold. Its evolutionary persistence, utility, or status as cooperation has not been established.

Space choices depend on neighboring food, waste, decoded signals, and seeded noise. Local competition is resolved in the shuffled cell update order. Division requires free adjacent space, sufficient energy, sufficient integrity, and a successful draw against the division gate. It costs one dissipated unit plus two units stored as new cell biomass; remaining parental energy is divided equally between parent and child.

Death returns 60% of remaining energy plus biomass to local food and dissipates the remainder. Lifespan is inherited and bounded. Removing cells uses the same recycling rule; placing a wall instead exports the removed food/biomass/energy from the modeled world and records it in `ledger.removed`.

The observer calculates:

```text
stored = sum(food) + sum(cell.energy) + 2 * livingCells
residual = initial + supplied - removed - dissipated - stored
```

The ledger conserves an **energy-equivalent bookkeeping quantity** to floating-point tolerance. Waste and signal concentrations are abstract state variables, not conserved matter/chemical energy pools. Integrity is dimensionless. This is not a physically complete chemical or thermodynamic model.

## Heredity

Each of 11 traits and 49 weights independently mutates with the configured per-locus probability on division. Trait mutations are signed uniform perturbations scaled by the trait range; weights use a signed perturbation of `4 * mutationScale`. Values are clamped to documented bounds. `counters.mutations` counts actual changed loci, not every mutation attempt and not the number of new species. One birth can change several loci or none.

A cell's `lineage` remains its original founder ID regardless of mutations. `parentId` identifies its immediate parent, which may already be dead. These identifiers are labels, not information available to the controller.

There is no population-wide fitness evaluation or selection sweep. Survival and offspring production determine realized representation. The manually chosen costs and environment still implicitly determine selection pressures; removing an explicit fitness function does not remove the designer's assumptions.

## Observer metrics

Population, cumulative births/deaths/mutated loci/transfers, maximum generation among living cells, surviving founder lines, mean energy/integrity/receptor gain, mean A/B concentrations, total resource, total stored energy, and ledger residual.

`traitSpread` is the square root of the mean across the 11 traits of their population variance after normalization to their allowed ranges. It excludes neural weights. It is not a fitness, intelligence, complexity, novelty, or speciation metric.

Connected patches are four-neighbor occupied connected components, ignoring ancestry. Adjacency lines in the UI show those local spatial relationships, not measured packet flow. Clustering alone does not show developmental coordination, organism-level reproduction, or a shared identity.

## Intervention semantics

Food and signal/toxin brushes add a tapered circular dose. Damage reduces integrity. Remove kills cells and recycles their stored energy. Barrier exports energy/material at affected sites, clears fields, and blocks transport. Unblock removes only walls; it does not refill food or restore cells. All manual interventions are observer actions, not emergent organism behavior.
