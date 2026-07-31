# Decompiler Program — implementation handoff

Branch: `claude/decompiler-program-impl-102f84` (worktree). Never pushed, never
merged, never rebased.

Scope of this run: tickets 01 → 06 in order. Ticket 07 and later are untouched.

## Ticket status

| Ticket | Status |
| ------ | ------ |
| 01 package skeleton, decision protocol, mock decider | resolved |
| 02 measurement core copied with drift checks | resolved |
| 03 CPU rasterizer, divergence tolerance, wall-clock | not started |
| 04 Complexity Budget Formula, global ceiling, Budget Proxy | not started |
| 05 generic perturbations, automatic Calibration Bracket | not started |
| 06 end-to-end geometry reconstruction | not started |

Last commit: `8e39af8` — ticket 02. Ticket 01 was `de7b2d9`.

## Ticket 03 judgement gate

Not yet reached. The gate runs after ticket 03 and before ticket 04, comparing
per-metric CPU-rasterizer-versus-browser divergence against the discrimination
margin the fitting loop needs, and measured wall-clock against the declared
budget. Numbers will be recorded here verbatim.

## Verification block, current state

```
npm test                                                    138 passing / 0 failing
npm run check:stone-v2-contract                             PASS (6 candidate, 3 evidence files)
npm run check:patterned-appearance-v2-contract              PASS
node scripts/run-stage-2-eight-object-certification.mjs --check
                                                            PASS under versioned category-specific baselines (8/8)
git status --short                                          no red-line file modified
```

Baseline before any work: `npm test` was 92 passing / 0 failing. The package's own
21 tests live in `packages/mesh-to-code/test/` and are discovered by the
repository's `node --test` as well as by the package's own runner, which is why
the count rose. The package suite is 46 tests after ticket 02, and the
repository's own count is unchanged at 92: 92 + 46 = 138. Both suites pass
standalone.

Repository-side aggregator, all passing (5 checks):

```
node scripts/check-decompiler-package.mjs        (relative path only, never a workspace)
node scripts/check-decompiler-measurement-drift.mjs
cd packages/mesh-to-code && npm test
cd packages/mesh-to-code && npm run check:neutrality
cd packages/mesh-to-code && npm run check:package-contents
cd packages/mesh-to-code && npm run check:pack-install-run
```

## Things worth knowing

**The root `package.json` cannot gain a `check:*` script.** It is a frozen
candidate file in both calibration contracts, which also assert
`git diff --quiet HEAD` over their lists. So every repository-side entry point
this program adds is a plain `scripts/*.mjs` invoked as
`node scripts/<name>.mjs [--check]`, never an npm script. The spec's phrasing
"`run-*.mjs` plus `--check` plus frozen JSON report plus `check:*` script pattern"
therefore holds except for the npm-script half. Tickets 03–05 only require
`--check` plus a frozen JSON report, so nothing in this run is blocked; tickets
13–15 should be read with this constraint in mind.

**`--inline` is implemented without esbuild.** Brief decision 16 says `--inline`
produces an "esbuild-treeshaken self-contained single file". esbuild ships
platform-specific prebuilt Go binaries, and red line 5 of this run's instructions
is "No native dependencies … Pure JavaScript only", stated as a hard
cross-agent-neutrality requirement. Red line 5 takes precedence, so inline
emission inlines the recipe and exactly the operators the composition uses, with
nothing it does not use carried, and `three` stays external in both modes. The
observable contract — one self-contained file whose geometry matches the
library-importing output — is met, and the package keeps zero dependencies.
**This is a flagged deviation for review.** If esbuild is wanted, ticket 12 is
the place, and it needs an explicit exemption from red line 5.

**The emitted generator does not import `three`.** `createObject3D(THREE, recipe)`
takes the namespace as an argument. This keeps `three` a real peer dependency,
lets the contract audit execute emitted code in any directory, and leaves
`buildParts(recipe)` a pure positions-and-indices function that the ticket 03
rasterizer can score without a renderer.

**Spec and brief use "Stage 3a/3b/3c" in places** (spec lines 226 and 272; brief
staged-exit table) where this program's phases are Phase A / B / C. Nothing was
amended. Code, commits, reports, and tickets in this run say Phase A / B / C only.

**The eight-object certification does not depend on `node_modules` being fresh.**
`node_modules` was absent at the start of this run and was installed with
`npm ci`. The root lockfile hash is unchanged:
`196401e3ca0ede3e31f80ccacbed2132eb55f6459dbadfb230963a989d337193`.

**The vendored measurement copies carry object-specific symbols on purpose.**
Byte-identity with `tools/evaluation/visual-metrics.mjs` means the copy contains
`evaluateQualityGate`, and byte-identity with `calibration-perturbations.mjs`
means it contains the Stone-specific constructors. The alternative was editing a
frozen file. They are not re-exported, `OBJECT_SPECIFIC_EXPORTS_WITHHELD` names
them, and a test asserts they stay unreachable. Ticket 02's two checkboxes are in
literal tension here; the resolution and the reasoning are recorded in that
ticket.

**`tools/evaluation/patterned-appearance-metrics.mjs` was not copied.** Its
`HUMAN_ANCHORED_PATTERN_ROLES_V3` is one unit's declared motif palette, which is
object-specific baseline material, and semantic-pattern appearance belongs to
ticket 10.

**`dev/` was already untracked before this run started** and is not this work.

**`.github/` did not exist.** Ticket 01 requires CI to run the pipeline with the
mock decider in a harness-free environment and to pack-install-run the package,
so `.github/workflows/decompiler-program.yml` is new. Every step in it invokes a
script that also runs locally, and all of them were run locally and pass — the
workflow file is not standing in for unverified evidence.

**Input formats.** Only Wavefront OBJ is decoded. The glTF/GLB, PLY, and STL arms
of the input contract are declared and classified `format-not-implemented` rather
than silently mishandled. No ticket in 01–06 requires them: fixtures are
code-generated OBJ, and ticket 03's calibration reads the reference GLB on the
repository side, where `@gltf-transform` already exists, and injects geometry
into the package by array.

## Open questions

None blocking. One flagged for review: the esbuild deviation above.
