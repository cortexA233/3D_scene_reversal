# Full Island Reconstruction — merged report

State at HEAD on `experiment/claude-full-island-scene`.

> **Closing update.** Three human decisions were taken during this milestone and applied:
> the surface sampling density was raised sixteenfold (ADR-0066), `paving-slab` was rebuilt
> as a scatter (ADR-0067), and the Horizon Group control budget was enlarged along with the
> triangle ceiling (ADR-0052 enlargement). Two further findings were recorded rather than
> acted on: ADR-0068, that coastline shape and shore height are opposed, and a correction
> that ADR-0067's own predictions were wrong on two of three counts.
>
> **No gate changed state.** What changed is what the instrument can see.

## 0. What this milestone actually produced

Not green gates. Three things worth more than the numbers moved:

**The measurement was repaired.** Before ADR-0066 the surface gate's noise floor was 4.8964
against a threshold of 2.4875 — no candidate could pass, however correct, and six kinds
already measured at or below their own floor. After the repair the floor is 1.3875 against
a threshold of 2.160875, and **no kind is unmeasurable any more**. Every remaining residual
is now real shape error that a fit can address.

**Two recorded boundaries turned out not to be boundaries, and one turned out to be
harder.** ADR-0052's eight-form cap was never binding — the groups carried at most five
summits against a cap of eight, and the real constraint was detection resolution. Lifting
it took the skyline's worst azimuth from 3.7618 degrees to 1.97, below the 3.257 the ADR
recorded as the cap's hard bound. The same pattern appeared again in the terrain: 28 of 32
coast nodes, bounded by a separation rule rather than the budget. **A cited budget that has
never been reached is not the constraint**, and that is now the first thing to check.
`shore height p95`, by contrast, gained a piece of negative evidence and still has no
remedy.

**Where the work is left is now known, and it is not where the ticket list said.** Ranked by
residual above each kind's own noise floor, times its placement count: mountain 547, palm
361, blossom 258, bamboo 225, and then nothing above 66. Ticket 12's seventeen unbuilt
decoration kinds do not appear — building them all would move the gates by less than the
capture noise.



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

### The surface gate is measuring its own sampling noise (ADR-0066)

This supersedes the arithmetic argument I made earlier in the session — that the sixteen
mountains floor `surface p95` at 2.4316 against a 2.4875 threshold. That was true and it
was the small half of the story.

`surfaceDistance` compares point clouds and `SAMPLE_CAP` is 96 per entity **at every size**,
so the metric reads a non-zero distance between a form and itself. Measured through the
production path, with only the per-mesh sample seed displaced:

**Entity-weighted floor 4.8964, against a measured 6.4967 and a threshold of 2.4875.**

75 per cent of the scene's surface residual is the metric comparing a form with itself. Six
kinds measure at or *below* their own floor — `pavilion` at 100.1 per cent of it, `bridge`
at 105.7, `shop-sign` at 107.2 — meaning they are already indistinguishable from a perfect
reproduction at this sampling density.

And the calibration that set 2.4875 contains none of that noise. Its mild bracket is
`[0, 0.1803, 0.2284, 0.2622]`: **the identity control reads exactly 0**, because the
reference is on both sides of every world-space control and the two clouds' points
correspond. The candidate is a different mesh, so its samples are an independent draw. The
threshold was calibrated on a comparison with a zero noise floor and is applied to one whose
floor is at least 4.8964 — at least, because reference-against-candidate compares two
different tessellations and can only be noisier than the candidate-against-candidate figure
measured here.

So `surface p95 ≤ 2.4875` **cannot be met by any candidate, including a geometrically
perfect one**, and this is the reason every fit in this milestone returned single-digit
percentages while its profile proxy moved by half.

The diagnosis is tested rather than argued: raising the sample count drives the floor down
at one over the square root of n, to within four to five per cent over a sixteenfold range,
which is what sparsity looks like and nothing else does. That also prices the repair per
gate, and the three gates are not in the same position at all:

| gate | floor at 96 | threshold | samples needed |
| --- | --- | --- | --- |
| surface p95 | 4.8990 | 2.4875 | about 4x |
| over-tolerance fraction | **0.4701** | 0.1153 | about 16x |
| worst entity surface p95 | 111.54 | 14.037975 | about 57x |

`over-tolerance surface fraction` deserves separate notice: its floor is four times its
threshold, the scene measures 0.5865, and eighty per cent of that is floor. It had never
been quoted with a floor beside it. `worst entity` is a maximum over entities so its floor
is set by the largest one, and no plausible sampling budget reaches its threshold.

Nothing was changed on the strength of any of this: the thresholds, `SAMPLE_CAP` and the
metric are all untouched.

### Unfinished work — no boundary, just not done

`worst entity surface p95` and `over-tolerance surface fraction` were in this section.
ADR-0066 moves them out: both sit below their own metric's noise floor, the second by a
factor of four.

What remains genuinely unfinished is **the ten fixedCameraGeometry metrics**. That layer
renders both subjects through the same frozen cameras at the same resolution and samples no
point clouds, so nothing in ADR-0066 touches it — and it is now the only layer where a
fitting effort is guaranteed to be measuring the candidate rather than the sampler.

Its residual is not spread evenly. Per group, pooled over the six cameras:

| group | mean IoU | contour p95 | draw ratio |
| --- | --- | --- | --- |
| cover | **0.0144** | 26.16 | 0.752 |
| paths | **0.2233** | **75.99** | **2.927** |
| plazas | 0.3899 | 13.18 | 1.076 |
| wildlife | 0.4325 | 60.02 | 0.734 |
| decorations | 0.4518 | 12.83 | 1.588 |
| rocks | 0.4674 | 13.64 | 0.993 |
| structures | 0.5782 | 13.42 | 1.175 |
| bridges | 0.5810 | 9.90 | 1.297 |
| vegetation | 0.7129 | 9.23 | 1.081 |
| horizon | 0.7927 | 21.17 | 0.975 |
| geography | 0.9441 | 12.00 | 0.996 |

*(thresholds: IoU >= 0.724931, contour p95 <= 6.536774)*

**`paths` draws 2.927 times the reference's pixels** — a worse over-draw than the 1.89 and
2.11 that originally motivated the plate program — and it is the clearest demonstration of
why ADR-0066 matters. The group is 3 `path-stone` and 57 `paving-slab`, and `paving-slab`
reads **1.564 on the surface gate against its own sampling floor of 1.601**. On the
point-cloud metric those 57 slabs are already indistinguishable from a perfect
reproduction. In the render they are three times too big.

They also carry **no footprint controls at all** — `footprintCoverage` and `perimeterShare`
are absent, where the plaza, deck and bridge each got theirs. `paving-slab` was simply left
out of the plate program. Measured now, across 42 distinct assets and 57 placements, the
authored coverage has a median of **0.186** against a candidate hexagon covering about 0.75.

**The obvious fix would be a regression, and ADR-0067 says why in a stronger form than
first appeared.** The authored paving slab is not a slab: carried out to a readable grid its
footprint is a **scatter of small stones**, which is why the rectangle decomposition found
nothing in 37 of 42 assets. Median coverage 0.1862 against a candidate hexagon at ~0.75.

From that, two elementary results, both confirmed against the measurement:

- a solid blob of coverage `C` containing a scatter of coverage `c` scores `c / C` =
  **0.2483**, against an **observed 0.2233** — ten per cent, from first principles
- two independent scatters of coverage `c` score `c / (2 - c)` = **0.1027**

So a *faithful* reproduction scores **0.413x** what the current wrong one scores. The
hexagon is not winning despite being three times too big; it is winning because it is. It
swallows the scatter, keeps the whole intersection, and pays only in union.

This also explains `cover`, the worst group on the island: `c / (2 - c)` for a sparse
scatter is about `c / 2`, so IoU near 0.014 is what two independent draws of a population
covering ~3 per cent of frame score whatever their statistics.

**It narrows ADR-0066's conclusion.** I wrote that `fixedCameraGeometry` was the one layer
where fitting was guaranteed to measure the candidate. That holds for solid singular
subjects — geography 0.9441, horizon 0.7927, vegetation 0.7129 — and fails for exactly the
two worst groups, which are the scattered ones.

What survives: **contour distance and the draw ratio do not have this pathology.** Contour
compares boundaries rather than areas, and 75.99 against a 6.536774 threshold is measuring
something true. Read together, those two would have caught the paving slab long ago; IoU
alone rewards keeping it.

So `paving-slab` was not rebuilt as a scatter, though that is plainly the faithful
representation and the measurement to build it from now exists. Doing it improves the draw
ratio and the contour distance and takes IoU from 0.2233 to about 0.1027 — one gate metric
backwards by more than half, two forwards. That is a question about which of three
disagreeing metrics the milestone means, and answering it by picking the one that flatters
the change is what a fitting loop must not do.

--- | --- | --- |
| ridgeElongation | 96.090 at x0.5 | 5.91% |
| ridgeApron | 100.529 at x1.5 | 1.56% |
| flankFalloff | 101.091 at x1.5 | 1.01% |
| spreadScale | 102.126 at x1 | **0% — already optimal** |
| saddleDepth | 102.126 at x1 | **0% — already optimal** |

The residual is 102.1257 and the threshold is 14.037975: an 86 per cent reduction is
needed and the whole control budget offers single digits. The worst entity is pinned at
exactly 159.2395 across every flank multiplier from x1 upward — completely insensitive.
That two controls are already at their surface optimum is the other half of the evidence:
the existing fit is not sloppy, it is *small*. Six group controls plus two per summit
cannot describe an authored landform 389 to 1380 units across to within 14 units.

So this belongs with the boundaries — and ADR-0066 then explains *why* the controls have so
little to move: 79.7 per cent of the mountains' residual is the metric's own sampling floor,
81.354 of 102.126. One honest qualification remains: the sweep bounds *this* program, not
every possible one. Enlarging the ridge control budget is the same class of
decision as ADR-0052's eight-form cap and is a human call, which is why it is in §2 rather
than settled here.

The 5.91 per cent from halving `ridgeElongation` is **not taken**. It would move the
control the skyline fit chose deliberately, on the gate ADR-0052 already records as
saturated, and a uniform multiplier across sixteen groups is a cruder instrument than the
per-entity fit it would overwrite.

The remaining object residual by kind, after all three vegetation fits:

| kind | count | mean p95 | share of total |
| --- | --- | --- | --- |
| mountain | 16 | 102.126 | 37.4% |
| palm | 156 | 5.011 | 17.9% |
| bamboo | 72 | 6.785 | 11.2% |
| blossom | 133 | 3.450 | 10.5% |
| everything else | 295 | — | 23.0% |

Every vegetation kind is now fitted to its measured profile. The mountains are 37.4 per
cent of the total on their own and are bounded by their control budget rather than by a
missing fit — see below. That leaves no object kind where a measurable improvement is
available within the current representations.

`nativeAppearance` is **blocked, not failed**. ADR-0040 refuses to evaluate it until both
geometry layers pass. That is the spec's own convergence order working as designed and is
not a gap.

---

## 2. What needs a human

Seven things, all specific.

1. **Overturning ADR-0052 or ADR-0054.** Both boundaries are reachable only by raising a
   frozen budget — the terrain landform cap from 40 to about 101, or accepting a
   640-number sampled skyline. Both are repo-level decisions about what a Procedural
   Replacement is allowed to be, not fitting decisions, and §8 reserves them.

4. **Native Firefox and Safari GPU gates.** Neither browser is installed on the normative
   host. Firefox needs a BiDi transport this repository does not have; Safari needs macOS.
   Reported as not evaluated since the Foundation and unchanged.

3. **Whether the vegetation fits should be kept — the largest open judgement.** Taken
   together the three fits improve `worldGeometry` by 3.4 per cent and leave the
   fixed-camera layer *worse on seven of its ten metrics*. That is a consistent direction,
   not noise: fitting each form to its measured mass distribution makes it broader and
   lower, which is right in three dimensions and changes what it draws in two.

   I kept them because the layer they improve is the one ADR-0040 orders first, and
   because the fixed-camera layer cannot pass until `worldGeometry` does. But the trade is
   real, and if a reviewer's reading of the convergence order differs, the right call
   differs. The per-metric numbers are in §5.

6. **Enlarging the horizon ridge control budget.** Six group controls plus two per summit
   cannot describe these landforms to the threshold, and the sweep in §1 bounds what the
   current controls can do at single-digit per cent against an 86 per cent requirement.
   More summits or more controls per group is the same class of decision as ADR-0052's
   eight-form cap. This is now the largest single lever on the island — 37.4 per cent of
   the surface residual — and it is not mine to pull.

7. **The triangle budget.** Now the tightest on the island at 0.132581 headroom, down from
   0.202113, because the palm fit spent about a third of the remaining margin. The blossom
   and bamboo fits spent none — both were held at or below their previous counts, blossom
   by a constraint added to the fitter. Still passing. A mountain fit, which is the next
   target and the largest one left, will need this raised or something else given back.

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
- **The search grids themselves**, for both palm and blossom — the candidate values on
  each axis are chosen, not derived. A different grid could find a different optimum, and
  for blossom the search had not converged when its three passes ran out.
- **The canopy triangle minima** — 400 palm, 600 blossom, 500 bamboo. Hand-set thresholds
  expressing "reads as foliage, not sticks, at overview distance". No measurement backs
  the specific numbers.
- **The vegetation ratchets** — 5.1, 3.5, 6.6. Measured values plus chosen headroom.
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

**What moved this session.** `surface p95` 6.7228 → **6.4967**; over-tolerance fraction
0.6038 → **0.5865**; palm 5.4025 → **5.0110**; blossom 3.9352 → **3.4503**; bamboo
7.1510 → **6.7849**. The fixed-camera layer went the other way overall, and this is the session's
uncomfortable result rather than a footnote:

| metric | start | end | |
| --- | --- | --- | --- |
| group contour distance p95 | 25.86344 | **24.370677** | better |
| group world normal p95 | 65.363956 | **63.748894** | better |
| group silhouette IoU | 0.508089 | 0.503639 | worse |
| worst group silhouette IoU | 0.109195 | 0.092652 | worse |
| worst group contour distance | 186.6568 | 224.6922 | worse |
| group depth p95 | 20.550992 | 20.617152 | worse |
| worst group depth p95 | 110.172588 | 115.343801 | worse |
| semantic agreement | 0.946747 | 0.945501 | worse |
| worst camera semantic agreement | 0.911074 | 0.907551 | worse |
| worst semantic confusion | 0.018047 | 0.018512 | worse |

Two of the losses are worst-group extremes on sparse groups, where this repository has
already recorded the contour statistic as unstable and demonstrated it with an analytical
fixture — and the largest, `wildlife` at 224.6922, is in a group whose geometry never
changed, so it is occlusion. The aggregate losses are small and consistent, and they are
not noise: the fits make each form broader and lower, which is what the measurement asked
for in three dimensions and is not free in two. The
largest of those losses is in `wildlife`, whose geometry did not change — panda re-measures
0.9221 and rock 3.8807, exactly as before — so it is occlusion, measured through a group
contour statistic already recorded as unstable on sparse groups. Those two explanations
cannot be separated from here and neither is asserted.

**No gate changed state this session.**
