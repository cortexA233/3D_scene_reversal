# 06 — End-to-end geometry reconstruction on a single-operator path

Type: task
Status: resolved
Blocked by: 05

**What to build:** the first real tracer bullet. Point the command at a generated single-component
lathe-able fixture and get back working, asset-free Three.js code with a Reconstruction Tier earned
from real geometry evidence.

Everything before this ticket produced infrastructure and frozen reports. This is the first ticket
whose output a person can open and look at. It deliberately uses one operator, one component, and
geometry only, so that the complete path is exercised without the search breadth, decomposition, or
appearance machinery that later tickets add.

- [x] One profile-lathe Contract Operator exists with a declared parameter signature and scalar count,
      pure and deterministic
- [x] Running on the fixture emits a recipe and a generator that build the replacement without loading
      any asset
- [x] Fitting runs L0 coarse search then L1 refinement, scored with the copied metric functions
      against the automatically frozen baseline from ticket 05
- [x] The emitted code executes and produces identical geometry across two runs
- [x] The contract audit runs and covers asset-freedom, determinism, executability, the global ceiling,
      and the complete-source scalar count
- [x] A Reconstruction Tier is assigned from geometry evidence, with appearance explicitly recorded as
      not yet evaluated rather than silently passing
- [x] The inline output mode emits a self-contained single file whose geometry matches the
      library-importing output
- [x] A mock decider variant that returns a contract-violating operator causes emission to be withheld
      with a classified diagnosis, and this path is covered by a test
- [x] Tests assert only externally observable output, never the chosen operator or fitted parameter
      values

## Resolution

`mesh-reverse run --input <fixture> --out <dir> --decider mock --inline` now walks
the whole path and emits working, asset-free Three.js code.

### The milestone measurement

One command on a code-generated lathe-able fixture, at the complete twelve-view
512-pixel protocol:

| Measure | Value |
| ------- | ----- |
| Reconstruction Tier | `below-gate` |
| Geometry gate | **passed**, 8 of 8 metrics hard, 0 diagnostic |
| Mean silhouette IoU | `0.99002` |
| Worst-view IoU | `0.98962` |
| Mean symmetric edge distance | `0.55867` pixels |
| Edge distance P95 | `2` pixels |
| Depth MAE / P95 | `0.00486` / `0.01473` |
| World-normal mean / P95 | `4.497` / `10.582` degrees |
| Max axis relative error | `2.902e-7` |
| Bottom anchor error | `0` |
| Triangles | 768, against a formula budget of 768 |
| Draw calls | 1, against 2 |
| Object-specific Scalars | 36, against 80 |
| Recipe bytes | 1,313, against 1,792 |

The tier is `below-gate` and not `accepted`, and that is the correct answer rather
than a shortfall: `accepted` means every hard gate passed, and appearance is a hard
gate axis that this build does not measure. The evidence records
`appearance: { evaluated: false, passed: null, reason: … }` and the tier rationale
names it, so an unmeasured axis reads as unmeasured. Geometry, meanwhile, is
measured for real against the automatically frozen baseline from ticket 05 with
every metric hard — which is what "a Reconstruction Tier earned from real geometry
evidence" asks for.

That result is also a useful counterweight to ticket 05's finding. The automatic
reference-only baseline was unreachable for compact approximations of complex
references; here, where the operator genuinely matches the reference's shape
family, the same rule produces a baseline the fit clears with 8 of 8 metrics hard
and nothing demoted.

### The operator

`profile-lathe` is the Operator Library's only member. It revolves one axial
`[radius, height]` profile into a closed capped solid, with a declared parameter
signature — `profile` as a `scalarPairArray` bounded at 48 pairs, `radialSegments`
as an integer in `[3, 64]` — and a scalar count of `profile.length * 2 + 1`.
Conformance is checked by measurement, not assertion: the source is scanned for
ambient randomness, ambient time, module access, global access, asset access, and
dynamic evaluation, and the builder is called twice with identical parameters and
its geometry compared.

It was seeded by *reading* Vase's hollow lathe and Candle's measured pedestal
profile, which are the two generators that made the shape family obvious. Neither
was modified and neither imports anything from the library.

The builder's own `Function.prototype.toString()` is what gets emitted, so the code
the fitting loop scored and the code that ships are the same code and cannot drift.
That also forces the builder to close over nothing, which is what makes the inline
output genuinely self-contained.

### Fitting

L0 is analytic and touches no renderer: bin vertices by height about the
bounds-centre vertical axis and take the outer radius per bin, interpolating empty
bins and anchoring the end rings on the measured extents. The ring and segment
ladders are then searched analytically for the finest rung whose triangle count
fits the budget — 12 rings by 32 segments, 768 triangles, on this fixture.

L1 is bounded coordinate descent through the copied metric functions: a global
radius scale first, then per-ring passes, scored on the CPU rasterizer at the
coarse stage, confirmed at the refinement stage, and finally scored under the
complete protocol. It is bounded three ways — a 96-iteration per-candidate cap, an
epsilon of `1e-5`, and a two-round stall limit. The run used 76 of 96 iterations
and took the objective from `0.142958` at L0 to `0.081579`.

The objective is a search objective and nothing else. It cannot admit or reject:
acceptance is the frozen baseline's `evaluate`, and the two are separate functions.

### Contract audit

All five contract constraints plus the scalar count, on the emitted bytes:

| Constraint | Status |
| ---------- | ------ |
| asset-dependency | pass |
| executability | pass |
| determinism | pass |
| global-complexity-ceiling | pass |
| multi-scale-material-consistency | not-applicable, with a reason |
| object-specific-scalar-audit | pass, 36 of 80 |

Determinism is measured by importing the emitted generator twice under distinct
specifiers so module-level state cannot hide non-determinism, then hashing the
geometry. The scalar audit uses the same definition the repository's
`auditObjectScalars` uses — every numeric recipe leaf plus every non-universal
numeric literal in the operator source it carries — so it cannot repeat the
Umbrella `86/96` mistake of counting recipe literals only.

### Inline mode

`--inline` emits one file with no import at all, carrying only the operators the
composition uses. Its geometry hashes identically to the library-importing output:
`4b84db4a34a435d4557a622811b7e705f10665a164b4d5172c0ee13ae95f2d03` from both.

### The withheld-emission path

The `contract-violating-operator` mock policy goes through the real escape hatch
rather than a shortcut. On a fixture the lathe cannot fit, the library-only search
fails the geometry gate, which unlocks the `operator-authoring` Decision Point with
the recorded coverage failure attached — six named metrics. The policy then authors
an operator whose source reads a `.glb` from disk.

That operator is deliberately *not* filtered out before emission; filtering would
hide the violation. It is composed in, emitted, and the contract audit catches it:
`asset-dependency` fails on `commonjs-require`, `file-system-read`, and
`asset-extension`; `executability` fails because `require` is not defined in the
emitted module. The tier is `rejected`, `runtime/` is removed, the exit code is `3`,
and `failureClassification` is `contract-violation`. Admission is separately
recorded as refused with its findings. All four Decision Points appear in the
trace: `unit-division → semantic-grouping → structure-proposal → operator-authoring`.

### Tests

Nine cases in `test/end-to-end-reconstruction.test.mjs`, asserting only on emitted
files, manifest and evidence content, and exit codes. None names an operator or a
fitted parameter value — the closest they come is asserting that a metric is a
number and that the iteration count is inside its cap, both of which stay true as
the library grows. The bit-for-bit reproduction test re-emits from the frozen
manifest, which re-runs the fit rather than reading cached parameters, so the claim
is about the pipeline rather than about a cache.

Two earlier surfaces needed updating, not weakening: the ticket 01 resume test and
the neutrality check both answered one Decision Point and resumed once, and the
pipeline now raises three. Both now loop until the command stops asking, which is
closer to how a real decider works. The neutrality check answers all three from
published numeric evidence alone.

Verification block: `npm test` 176 passing / 0 failing; Stone v2 contract PASS;
Patterned Appearance v2 contract PASS; eight-object certification
`PASS under versioned category-specific baselines (8/8)`;
`node scripts/check-decompiler-package.mjs` PASS (5 checks); `git status --short`
shows no modification to any red-line file.

## Comments

**Known limitation, in scope for this ticket and not beyond it.** The profile-lathe
operator builds geometry on its own axis with its base at the origin, so a semantic
group that is off-centre within its unit is reconstructed in the wrong place. For
the one-operator, one-component path this ticket declares, that is exactly right.
Multi-group placement belongs to the decomposition and multi-unit composition
ticket, and until then a multi-group input simply fits badly and fails its gate,
which is visible rather than silent.

**The test suite gained a `--baseline-stage` option for speed.** The Calibration
Bracket scores every declared control, so running it at the full protocol costs
seconds per invocation and put the package suite at 2.9 minutes. The option is a
real capability with a documented meaning — `final` is the default and the complete
protocol — and the milestone test above passes `final` explicitly so the headline
numbers are measured under the real evaluation conditions. The suite is now 50
seconds.
