---
status: accepted
---

# Sample the surface by area, not by tessellation

Scene Surface Parity compares two point sets, so how those points are spread over each subject decides what the metric can see. ADR-0055 established that and moved the sample budget from each mesh to the entity. It did not go one level further, and one level further is where the rest of the bias was: inside a mesh, `sampleMeshSurface` drew a triangle with **uniform probability per triangle**.

That makes a point's chance of landing somewhere proportional to the *triangle density* there rather than to the surface. The metric therefore reads how each subject happens to be tessellated — and an Exact-ish Reconstruction is explicitly not required to reproduce source topology, UVs, or vertices. A triangle is a division of a form, and ADR-0055's own argument is that the metric must not depend on how a form is divided.

## How it was found, and how far off it was

Ticket 07 records the upright count of the two structural tree kinds as "not recoverable from a radially averaged profile". That is true of the profile and not of the subject: a radial mean cannot separate N posts at radius r from a solid cylinder of radius r, but a scan conversion of the horizontal projection restricted to that height band can, because one is N blobs and the other is a disc. `tools/development/measure-ground-structure.mjs` measures it that way, at full triangle resolution in the reference page.

Running it produced a cross-check nobody had asked for. The same eight placements measured two ways — 96 gate samples against every triangle — agree on five and disagree wildly on three:

| placement | band area share, 96 samples | band area share, all triangles |
| --- | --- | --- |
| `swing-tree-p2360` | 0.240 | 0.215 |
| `swing-tree-p2393` | 0.740 | 0.785 |
| `swing-tree-p2803` | 0.323 | 0.336 |
| `wish-tree-p1195-p0318` | 0.083 | 0.107 |
| `wish-tree-p1207` | 0.198 | 0.217 |
| `swing-tree-p2362` | **0.021** | **0.205** |
| `swing-tree-p2430` | **0.010** | **0.359** |
| `wish-tree-p1195-p0193` | **0.010** | **0.310** |

The three outliers drew one sample of ninety-six from a band holding 20 to 36 per cent of the area. That is not small-sample noise: at a true share of 0.31, the chance of ninety-six draws yielding at most one is about `1e-13`. It is the bias, and the mechanism is visible in the same file — `swing-tree-p2430`'s band is 33 triangles of 1,776 carrying 35.9 per cent of the area, so each is about nineteen times the average size and uniform-per-triangle sampling visits it 1.9 per cent of the time.

Across the whole candidate the total-variation distance between "uniform per triangle" and "uniform per area" averages **0.366**, worst on `plaza` (0.629), `bridge` (0.470) and `deck` (0.468) and best on `stone-block` (0.031). The bias is also *asymmetric between the two subjects*, which is the damaging part: the authored meshes concentrate area in a few large faces with dense small-triangle detail elsewhere, and the candidate's procedural tessellation is comparatively even, so the two point clouds sample different parts of their own surfaces.

## What changed

Both the pick inside a mesh and the split across an entity's meshes now follow **world-space area**. The pick is a cumulative-area table with a binary search; the split passes `surfaceAreaOf` to `allocateSamples` where it used to pass triangle counts.

Area keeps ADR-0055's merge invariance rather than trading it away — splitting a body in two splits its area in two, so a mesh and its own halves still draw the same points — and it removes the tessellation dependence at the same time. The *budget* stays on triangle count, because a budget is a cost ceiling rather than a weighting, and at 96 it binds for nearly every placement here.

World space rather than local, because a mesh may carry a non-uniform scale and the points are compared in the shared world frame. A mesh whose triangles are all degenerate falls back to uniform: it has no surface to weight by, and returning nothing would hide a part that exists.

One residual is named rather than smoothed. An `InstancedMesh` is area-weighted on its base geometry and then placed by a randomly chosen instance matrix, so per-instance scale does not enter the weighting. That affects only the Distributed Scene Cover populations, which are compared by occupancy and distribution rather than by instance pairing, and within one mesh the *relative* triangle areas are what the weighting uses.

## What it cost, in both directions

The reference is on both sides of every world-space control, so its bracket moves with the correction. The controls, their damage magnitudes, and the selection rule are unchanged; only where the points land has changed. Nothing is chosen and no candidate result was an input. The baseline advances to `scene-quality-baseline-v1.4`:

| threshold | before | after |
| --- | --- | --- |
| `surface p95` | 2.454575 | 2.4875 |
| `worst entity surface p95` | 13.9152 | 14.037975 |
| `over-tolerance surface fraction` | 0.1204 | **0.1153** |

Two loosen by about one per cent and one tightens by four. The candidate moved in both directions by comparable amounts:

| candidate metric | before | after |
| --- | --- | --- |
| `surface p95` | 7.1748 | 6.7504 |
| `over-tolerance surface fraction` | 0.62 | 0.6049 |
| `worst entity surface p95` | 155.2008 | **159.2395** |

No gate changed state, and the aggregate stays 2.71 times its threshold — a 1.3 per cent move cannot buy a pass that far away. Per kind the correction is not uniformly kind either: `bridge` 23.96 to 18.80 and `pavilion-single` 21.10 to 17.67 improve, while `swing-tree` 18.02 to 19.63 and `name-plate` 17.05 to 18.57 get worse. That mixture is the signature of points moving onto the surface each subject actually has, rather than of a threshold being relaxed.

The blast radius is small and was checked rather than assumed: re-running the reference observation left `scene-inventory-v1.json`, `terrain-elevation-v1.json` and `horizon-reference-v1.json` **byte-identical**, and only `scene-surface-samples-v1.json` changed. Nothing under `tools/evaluation/scene-pass-metrics.mjs` was touched, so no rendered capture was invalidated and the six-camera passes and sixteen calibration controls stand.

## Why this keeps happening

This is the fourth frozen measurement this milestone has had to repair, after the mask-pass encodings (ADR-0053), the invented cover controls (ticket 09), and the per-mesh sample budget (ADR-0055). All four have the same shape: a defect in a measurement is invisible in the number the measurement produces, so it is indistinguishable from a candidate result until something outside it disagrees.

What found this one is worth generalising: it was a **second measurement of the same quantity by a different method**. The 96-sample band share and the all-triangle band share should have been the same number, and three of eight were off by up to thirty-five fold. The analytical fixture added beside the fix (`sample density follows surface area, not tessellation`) is the standing guard, but the thing that produced the finding was redundancy, not the fixture. Where a fitted control is about to be read off a sampled summary, measure it a second way first.
