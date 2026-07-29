# Full-island procedural prototype

This is throwaway visual prototype code on `experiment/full-island-scene`.

## Question

Can a code-only procedural scene reproduce the authored `gt_designer` island's overall layout, material palette, mesh silhouettes, sea plane, and distant mountain horizon closely enough to justify a full reconstruction pass?

## Current answer

The first hand-authored layout was rejected. The current pass uses a development-only Ground Truth Extractor to measure the baked reference geometry and retain only compact Semantic Measurements: object bottom-centres, bounds, footprint orientation, 48 coastline radii, and a bounded set of terrain relief anchors. Variant A uses those measurements to reconstruct the authored placement of the village, bridges, paths, vegetation zones, sea opening, and distant mountains. Individual meshes and materials remain procedural approximations rather than accepted object-level reconstructions.

## Run

```bash
npm run prototype:island
```

The page opens on variant A. Use the bottom arrows, keyboard left/right arrows, or `?variant=A|B|C` to compare:

- A — closest reference match
- B — denser terrain, architecture, foliage, shore, and horizon meshes
- C — reduced low-poly budget while retaining the same layout

## Code-only boundary

The development extractor may read the Authored Reference and dense terrain evidence:

```bash
npm run extract:full-island-layout
npm run check:full-island-layout
```

It emits `full-island-layout.generated.js`, which contains only resolution-independent scene parameters. The prototype runtime imports that code module, Three.js, and OrbitControls. Terrain, water, sky, mountains, paths, bridges, buildings, vegetation, rocks, flowers, birds, and clouds are constructed at startup from code and a deterministic seed. It does not request authored meshes, heightfields, scene manifests, textures, or other image/data assets.

The current semantic layout contains 16 distant mountain groups, 10 primary structures, 2 bridges, 2 plazas, 55 path stones, 33 rocks, 43 prop groups, 46 palms, 33 blossom trees, 70 bamboo clumps, and 14 wildlife anchors. The default camera is the reference overview camera (`390,190,410 → 80,26,-20`); it can also be set with `?campos=px,py,pz,lx,ly,lz`.

Verify all three variants and their browser requests with:

```bash
npm run check:prototype:island
```
