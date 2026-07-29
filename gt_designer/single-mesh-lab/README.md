# Single Mesh Reconstruction Lab

This scene isolates eight static, one-mesh/one-material references from the
authored village for procedural reconstruction experiments.

Run the normal local server:

```sh
./run.sh --lab
```

To start the server without opening a browser, run `./run.sh --lab --no-open`
and open the URL it prints, normally:

```text
http://localhost:8000/single-mesh-lab/
```

## Reconstruction contract

- The fixed object selection, layout, camera, and normalization live in
  `scene-config.js`.
- Each source geometry is baked into local coordinates with a bottom-center
  pivot.
- Uniform scale makes the largest bounding-box dimension exactly 7 units.
- The floor grid is one world unit per cell.
- The page exposes `window.singleMeshLab`; `ready` becomes `true` after all
  references load, and `references` maps each config ID to its Three.js mesh.

The reference page deliberately loads the original authored GLB as ground truth.
Once procedural replacements are ready, they can use the same slots without
depending on that GLB.
