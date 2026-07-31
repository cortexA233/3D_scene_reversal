# 01 — Package skeleton, suspend-resume decision protocol, mock decider

Type: task
Status: resolved
Blocked by: None — can start immediately

**What to build:** running the decompiler on a trivial generated fixture walks one Decision Point end
to end and emits a complete artifact directory. Geometry is stubbed on purpose — this ticket proves
the protocol and the harness-neutral shape, so that every later ticket only has to fill in real
geometry behind an interface that already works.

The walking skeleton: the command suspends at a Decision Point with a numeric evidence document and a
declared response schema, an external decider answers by writing a file, and resuming produces the
same result as an uninterrupted run.

- [x] Running the pipeline with the mock decider on a code-generated fixture emits an artifact
      directory containing a recipe, a generator, a Structure Manifest, and a development-only
      evidence document carrying a Reconstruction Tier
- [x] The pending-decision document contains the mechanical evidence in numeric form and the allowed
      response schema; imagery paths are an optional field
- [x] Suspension exits with a code distinguishable from success and from error
- [x] Resuming from a written decision reaches the same artifact as an uninterrupted mock run
- [x] A schema-invalid decision is rejected without advancing the loop
- [x] The Structure Manifest is hash-bound and the artifact reproduces bit-for-bit from it
- [x] The mock decider ships as part of the package, not as test-only code
- [x] CI runs the full pipeline with the mock decider in an environment with no agent harness
      installed
- [x] CI packs the package, installs it into a clean directory, and runs it there
- [x] `three` is a peer dependency and no dependency requires native compilation
- [x] Test fixtures are generated from code; the package contains no binary asset
- [x] The package is NOT a workspace of this repository: it has its own manifest and its own lockfile
      and is installed independently. The repository's dependency manifest and lockfile are frozen
      candidate files in two calibration contracts, so touching either fails those checks
- [x] Nothing in the existing repository tree is modified, and both calibration contract checks plus the
      eight-object certification check still pass unchanged

## Resolution

`packages/mesh-to-code` is a sibling package with its own manifest, its own
`package-lock.json`, and a `mesh-reverse` binary. It declares no dependencies at
all and `three` as its only peer dependency, so no dependency can require native
compilation. The root `package-lock.json` is byte-identical before and after the
package install: `sha256 196401e3ca0ede3e31f80ccacbed2132eb55f6459dbadfb230963a989d337193`
on both sides of `npm install --package-lock-only` run inside the package.

The command runs a trivial code-generated fixture end to end. `run --decider mock`
emits `runtime/recipe.js`, `runtime/generator.js`, `evidence/structure-manifest.json`,
`evidence/evidence.json`, and `evidence/decision-trace.json`, and exits `0`.

Exit codes are the harness-neutral contract surface: `0` complete, `1` error,
`2` suspended at a Decision Point, `3` emission withheld by a contract violation,
`4` decision failed its schema. All five are exercised by the suite.

The `unit-division` Decision Point walks end to end. The pending document carries
mechanical evidence in numeric form only — component count, per-component
triangle count, vertex count, bounds, centroid, surface area, relative scale,
aspect ratio, pairwise bounds gaps, separation ratio, shape-descriptor clusters —
plus the exact response schema and an `imagery` field that is present and empty,
so a text-only decider can answer. The neutrality check proves that by answering
with nothing but one written file.

Suspend-and-resume is byte-equivalent to an uninterrupted mock run: `recipe.js`,
`generator.js`, `generator.inline.js`, `structure-manifest.json`, and
`evidence.json` all compare identical. A schema-invalid decision returns `4` and
leaves both `pending-decision.json` and `run-state.json` unchanged, and emits no
runtime code, so the loop provably did not advance. An envelope answering the
wrong Decision Point is rejected the same way.

The Structure Manifest is hash-bound over its own canonical form.
`emit --manifest … --input …` reproduces all three runtime files byte-for-byte
from the frozen manifest; a manifest edited by one field is refused with a hash
mismatch, and a mismatched input is refused before emission.

The stubbed geometry is reported, not disguised. The composition kind is
`stub-bounds-placeholder` and all three quality axes record
`evaluated: false` with a reason, so the tier is `below-gate` and
`admittedToReferenceLayoutDelivery` is `false`. The two contract constraints this
build cannot yet measure — the global complexity ceiling and multi-scale material
consistency — are recorded `not-applicable` with a reason rather than `pass`.
Asset dependency, executability, and determinism are measured for real: the
emitted generator is imported twice under distinct specifiers and both fresh
module instances hash to the same geometry.

Evidence produced:

- package suite: 21 tests, 0 failures, also discovered by the repository's
  `node --test`, taking `npm test` from 92 to 113 passing with 0 failures;
- `npm run check:neutrality`: PASS — SKILL.md scanned against 33 harness-specific
  tool and product names, 19 harness environment variables scrubbed, full mock
  pipeline plus a text-only file-writing decider both complete;
- `npm run check:pack-install-run`: PASS — 35-entry tarball, installed into a
  clean directory with no other dependency, `mesh-reverse` runs the whole
  pipeline from there, installed tree is `README.md, SKILL.md, bin, package.json,
  schemas, src`;
- `npm run check:package-contents`: PASS — no asset, no image, no report;
- `node scripts/check-decompiler-package.mjs`: PASS (4 checks), the
  repository-side entry point that reaches the package by relative path only;
- `.github/workflows/decompiler-program.yml` runs the same scripts, asserts no
  agent harness is on `PATH` before running, installs the package with `npm ci`
  independently of the root, and asserts the root manifest and lockfile are
  untouched.

Verification block: `npm test` 113 passing / 0 failing; Stone v2 contract PASS;
Patterned Appearance v2 contract PASS; eight-object certification
`PASS under versioned category-specific baselines (8/8)`; `git status --short`
shows no modification to any red-line file.

Deliberately not built, and recorded rather than assumed: geometry fitting, the
Operator Library, appearance solving, the Complexity Budget Formula, multi-unit
composition, and the glTF/GLB, PLY, and STL arms of the input contract. An
unsupported extension the contract names is classified
`format-not-implemented` instead of being read as empty geometry.

## Comments

The emitted generator takes the Three.js namespace as an argument to
`createObject3D` rather than importing `three`. That keeps `three` a genuine peer
dependency, lets the build-time contract audit execute emitted code from any
directory without a resolvable `three`, and leaves `buildParts` a pure geometry
function the CPU rasterizer in ticket 03 can score directly.
