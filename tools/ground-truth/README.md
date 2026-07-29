# Ground Truth Extractor

This development-only tool decodes the authored GLB and emits versioned evidence
for the eight Single Mesh Lab Reconstruction Units. The GLB/Draco dependencies,
source-node mapping, decoded geometry, and extraction code are prohibited from
the production replacement import graph.

Generate the report:

```sh
npm run extract:ground-truth
```

Verify that the checked-in report matches the Authored Reference and extractor:

```sh
npm run check:ground-truth
```

The generic extractor records transforms, Reconstruction Frames, bounds,
topology, area, valid volume, PBR factors, and texture metadata. It deliberately
does not infer primitives, profiles, repetition, or generator programs.
