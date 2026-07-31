# Full Island Reconstruction — merged report

State at `d3d7108` on `experiment/claude-full-island-scene`.

---

## 1. What is still red, and why

The four-layer stack reads
`structuralCorrespondence=pass · worldGeometry=fail · fixedCameraGeometry=fail · nativeAppearance=blocked`.

Eighteen numbers are red. They divide into three kinds, and the division matters more than
the count.

### Recorded representation boundaries — cannot be reached without overturning an ADR

| gate | measured | threshold | held by |
| --- | --- | --- | --- |
| horizon profile p95 | 0.043636 | 0.0165 | ADR-0052 |
| worst azimuth horizon error | 0.065655 | 0.0165 | ADR-0052 |
| terrain height p95 | 8.532 | 5.26875 | ADR-0054 |
| shore height p95 | 7.9996 | 2.85035 | ADR-0054 |
| land and sea agreement | 0.922721 | 0.931361 | ADR-0054 |

ADR-0052's eight-form cap bounds the worst azimuth at 3.257° against a 0.945° threshold.
The declared escape — more nodes in a shared piecewise table — was implemented and tested
this milestone and **does not open**: a genuinely shared table saturates at 3.670°
regardless of node count. My first report of that experiment claimed the boundary was
crossable at 0.680° and was wrong; the rebuild check caught it and the correction stands.

ADR-0054's 40-landform budget reaches terrain height p95 8.657 where the gate needs about
101 landforms. Shore p95 is worse than that: it **is not reachable by adding forms at all**.

### A gate that is unreachable by arithmetic, which is worth separating from the above

`surface p95 ≤ 2.4875` cannot be met while the horizon sits where ADR-0052 records it, and
this is not a judgement:

- the 16 horizon mountains contribute **2.4316** to the 672-entity mean on their own
- that leaves **0.056** of headroom for the other 656 entities
- every one of them would have to average under **0.09** world units of surface distance

No amount of object work reaches it. This is a *consequence* of a recorded boundary rather
than a boundary itself, and nothing in the repository said so before — it is the single
most useful thing I found, because it retires a target that would otherwise look like
unfinished work.

### Unfinished work — no boundary, just not done

| gate | measured | threshold |
| --- | --- | --- |
| worst entity surface p95 | 159.2395 | 14.037975 |
| over-tolerance surface fraction | 0.5892 | 0.1153 |
| all ten fixedCameraGeometry metrics | — | — |

`worst entity surface p95` is entirely horizon mountains — all eight worst entities are
`horizon/mountain-*` — but the worst reads **41 per cent of its own 389-unit extent**,
which is not a representation floor. The mountains have a fitted crest-ridge program and
it is a poor fit; that is generator work nobody has done.

The remaining object residual by kind, after this milestone's palm fit:

| kind | count | mean p95 | share of total |
| --- | --- | --- | --- |
| mountain | 16 | 102.126 | 36.2% |
| palm | 156 | 5.011 | 17.4% |
| blossom | 133 | 3.935 | 11.6% |
| bamboo | 72 | 7.151 | 11.4% |
| everything else | 295 | — | 23.4% |

`nativeAppearance` is **blocked, not failed**. ADR-0040 refuses to evaluate it until both
geometry layers pass. That is the spec's own convergence order working as designed and is
not a gap.

---

## 2. What needs a human

Four things, all specific.

1. **Overturning ADR-0052 or ADR-0054.** Both boundaries are reachable only by raising a
   frozen budget — the terrain landform cap from 40 to about 101, or accepting a
   640-number sampled skyline. Both are repo-level decisions about what a Procedural
   Replacement is allowed to be, not fitting decisions, and §8 reserves them.

2. **Native Firefox and Safari GPU gates.** Neither browser is installed on the normative
   host. Firefox needs a BiDi transport this repository does not have; Safari needs macOS.
   Reported as not evaluated since the Foundation and unchanged.

3. **Whether the palm fit should be kept.** It improves the layer ADR-0040 orders first and
   degrades the one behind it — the numbers are in §3 below. I kept it and recorded both
   sides. A reviewer may reasonably decide the opposite; nothing about that decision is
   measurable from here.

4. **The triangle budget.** Now the tightest on the island at 0.132581 headroom, down from
   0.202113, because the palm fit spent about a third of the remaining margin. Still
   passing. The next form change of any size will need this raised or something else
   given back.

---

## 3. Reverted attempts, with their numbers

Everything here is reverted in the tree and reproduced only in ADRs.

**Vegetation as an Axial Layer Family (ADR-0065).** On `correspondence.surface.p95.mean`:

| | palm | blossom | aggregate |
| --- | --- | --- | --- |
| before | 5.4020 | 3.9350 | 6.7228 |
| pure lathe | 8.3360 | 4.3750 | 7.4909 |
| lathe + tips to the box | 6.7270 | **3.7697** | 6.9975 |
| lathe + tips, narrowed | 7.0560 | 3.8427 | 7.0883 |
| lathe + tips, default plan | — | 3.9692 | 6.7295 |

The one apparent gain — blossom at 3.7697 — was banked and then withdrawn. It existed only
at an eight-sided plan, which violates a standing 600-triangle canopy requirement that
predates the lathe. At the plan satisfying it, blossom regresses. The gain was an octagon
under-filling its own bounding box by three per cent, not a better shape.

The general finding it produced: a lathe's mean reach and its maximum are the same number,
so under exact AABB normalisation a measured mean-reach profile always comes out multiplied
by `1/max(reach)`. Every kind already built this way is inflated — pavilion 0.699 authored
against 1.000 candidate, shop-sign 0.783 against 1.000, across seven kinds.

**Earlier in the milestone**, also reverted with numbers recorded: tree ground structure,
the cover support polyhedron, and the bridge mirror attempt (IoU 0.2885, below the
uncorrelated prediction of 0.33, caused by `ExtrudeGeometry` under `rotateX(-π/2)` mapping
shape-Y to world −Z).

**Corrections to things I reported wrong** before catching them: the horizon "boundary is
crossable" claim (committed and reported before correction); a swing-tree number that
compared a p95 against a mean and was withdrawn; an intermediate bridge evaluation taken
before the recipe wiring landed.

---

## 4. Numbers that are declared rather than measured

Stated plainly, because a declared number that looks measured is the most expensive kind
of mistake in this repository.

- **The palm's unfitted controls.** `trunkHeight 0.62`, `trunkTop 0.028`, `lengthScale 1`
  are hand-authored values the coordinate search did not move. They are starting points
  that survived, not fitted results. Only `trunkBase`, `crownSpan`, `whorls` and
  `widthScale` were fitted.
- **The palm search grid itself** — the candidate values on each axis are chosen, not
  derived. A different grid could find a different optimum.
- **The canopy triangle minima** — 400 palm, 600 blossom, 500 bamboo. Hand-set thresholds
  expressing "reads as foliage, not sticks, at overview distance". No measurement backs
  the specific numbers.
- **The vegetation ratchets** — 5.1, 4.0, 6.7. Measured values plus chosen headroom.
- **Eight-sided plans** for the pavilions: "the closest single family value to both",
  chosen from two placements. The residual is recorded rather than tuned away.
- **The pavilion's two interpolated reach bands** — 0.605 and 0.45 — linearly interpolated
  from measured neighbours because those bands came back empty at 96 samples.
- **`roughness: 0.16`** in the horizon crest ridge, and `curl 0.35` in the blade geometry.
- **Material spatial statistics are measured, but no pattern program was built from them.**
  The numbers describing what one would need to reproduce are real; nothing claims a
  program exists.

---

## 5. Final state

**Workspace.** Clean. `experiment/claude-full-island-scene` at `d3d7108`, in sync with
origin, 84 commits ahead of `main`. The main repository at
`C:/recent_project/3d_pcg_reversal` is untouched on `generalized-single-model-pipeline` at
`144470f`; its branch was never switched and no file in it was modified.

**`npm test`.** 312 tests — **305 pass, 1 fail, 6 todo**. The single failure is ticket 04's
ocean appearance threshold and predates this session's work. The six todos each carry a
recorded reason; five name the ADR holding them.

**The four gate layers.**

| layer | state |
| --- | --- |
| structuralCorrespondence | **pass** |
| worldGeometry | fail — 8 metrics, 5 boundary-held, 3 unfinished |
| fixedCameraGeometry | fail — 10 metrics |
| nativeAppearance | blocked by ADR-0040's ordering rule |

`check:scene-parity-foundation` passes and was re-certified for the palm fit; the diff was
measured values only, with no contract, threshold or budget moved.

**What moved this session.** `surface p95` 6.7228 → **6.6319**; over-tolerance fraction
0.6038 → **0.5892**; palm 5.4025 → **5.0110**. In the fixed-camera layer, depth
20.550992 → 20.539355, worst depth 110.172588 → 109.561054 and world normals
65.363956 → 64.994407 all improved, while silhouette IoU 0.508089 → 0.502066, contour p95
25.86344 → 28.575683 and semantic agreement 0.946747 → 0.94511 went the other way. The
largest of those losses is in `wildlife`, whose geometry did not change — panda re-measures
0.9221 and rock 3.8807, exactly as before — so it is occlusion, measured through a group
contour statistic already recorded as unstable on sparse groups. Those two explanations
cannot be separated from here and neither is asserted.

**No gate changed state this session.**
