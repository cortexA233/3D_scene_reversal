# mesh-to-code

An Autonomous Object Decompiler. Given one mesh file it emits a Code-only
Three.js Procedural Replacement plus reproducible evidence and a machine-enforced
Reconstruction Tier, with no human choosing the representation and no human
authoring the generator.

`SKILL.md` is the authoritative agent-facing contract. This file covers install,
layout, and development.

## Install

```
npm ci
```

The package has no dependencies. `three` is a peer dependency, needed only by
callers of `createObject3D` — the kernel itself never imports it.

## Status

Under construction. What works today:

- the package skeleton, the `mesh-reverse` command, and its exit-code contract;
- the file-based suspend-and-resume Decision Point protocol with schema-checked
  decisions;
- the shipped mock decider and its simplest-structure policy;
- ingestion of Wavefront OBJ, code-generated fixtures, and the `list` inventory;
- mechanical decomposition evidence: welded connected components, per-component
  measurements, pairwise gaps, separation ratio, shape-descriptor clusters;
- hash-bound Structure Manifest emission that reproduces bit-for-bit;
- the contract audit for asset dependency, executability, and determinism;
- Reconstruction Tier assignment;
- byte-identical copies of the generic measurement modules, guarded by a drift
  check, so the fitting loop and the terminal gates score with one ruler.

Not yet implemented, and reported rather than assumed: geometry fitting, the
Operator Library, appearance solving, the Complexity Budget Formula and its
global ceiling, the multi-scale material consistency check, multi-unit
composition, and ingestion of glTF/GLB, PLY, and STL. Any axis that has not been
measured is recorded `not evaluated`; it is never recorded as passing.

## Layout

```
bin/                  the mesh-reverse entry point
schemas/              the published JSON schemas the protocol validates against
src/audit/            contract constraints: asset freedom, determinism, executability
src/decider/          the shipped mock decider
src/emit/             deterministic source emission
src/fixtures/         fixtures generated from code, because the package ships no asset
src/geometry/         the internal triangle mesh and the Reconstruction Frame rule
src/ingest/           input formats
src/kernel/           the driver, decomposition, composition, manifest, tier
src/measurement/      the measurement surface over byte-identical vendored copies
src/protocol/         Decision Point definitions and schema loading
src/util/             canonical JSON and the JSON Schema subset validator
scripts/              the neutrality, pack-install-run, and content audits
test/                 the package's own suite
testing/              test support that is not itself a test and does not ship
```

## Checks

```
npm test
npm run check:neutrality
npm run check:pack-install-run
npm run check:package-contents
```

## Boundaries this package keeps

- Dependencies run one way. The host repository may depend on this package; this
  package never references the host repository.
- No dependency may require native compilation, and none may bring a GPU or
  browser rasterizer. The fitting loop is pure JavaScript.
- The package contains no `.glb`, no image, and no report. Fixtures are generated
  from code at test time.
- Deleting every harness distribution adapter must leave the package fully
  usable, which `check:neutrality` proves by running the whole pipeline with no
  harness present.
