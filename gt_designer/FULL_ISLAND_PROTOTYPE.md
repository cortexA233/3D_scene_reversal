# Full-island procedural prototype

This is throwaway visual prototype code on `experiment/full-island-scene`.

## Question

Can a code-only procedural scene reproduce the authored `gt_designer` island's overall layout, material palette, mesh silhouettes, sea plane, and distant mountain horizon closely enough to justify a full reconstruction pass?

## Current answer

Yes at scene-composition level. Variant A preserves the recognizable foreground water mouth, central water garden and red bridges, village and pagoda landmarks, rear blossom grove, right bamboo bank, perimeter palm ring, sandy coast, reflective sea, haze, clouds, and a low-poly mountain ring. Individual buildings and vegetation remain prototype approximations rather than accepted object-level reconstructions.

## Run

```bash
npm run prototype:island
```

The page opens on variant A. Use the bottom arrows, keyboard left/right arrows, or `?variant=A|B|C` to compare:

- A — closest reference match
- B — denser terrain, architecture, foliage, shore, and horizon meshes
- C — reduced low-poly budget while retaining the same layout

## Code-only boundary

The prototype runtime imports only Three.js and OrbitControls. Terrain, water, sky, mountains, paths, bridges, buildings, vegetation, rocks, flowers, birds, and clouds are constructed at startup from code and a deterministic seed. It does not request authored meshes, heightfields, scene manifests, textures, or other image/data assets.

Verify all three variants and their browser requests with:

```bash
npm run check:prototype:island
```
