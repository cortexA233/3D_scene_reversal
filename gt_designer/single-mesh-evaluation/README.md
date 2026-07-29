# Single Mesh Evaluation Harness

This development-only page is the public seam for reference-framed captures. It
loads one Authored Reference, imports the same Object Generator used by the
replacement-only runtime, and applies the fixed twelve-view, seven-pass protocol.

Run it locally:

```sh
./run.sh --evaluation
```

The current Procedural Replacement is the synthetic Ticket 01 probe. It is not
expected to resemble Stone Path; it exists to verify the comparison protocol
before Stone Path fitting begins.

The harness exposes `window.singleMeshEvaluation` for development automation.
Its deep interface captures one pass, captures the complete protocol, renders a
diagnostic preview, or disposes its resources. Lab UI state does not participate
in framing or fixed capture.

## Quality Baseline calibration

Run the one-time Stage 1 calibration and rewrite its machine-readable evidence:

```sh
npm run calibrate:quality
```

Verify the frozen baseline with a fresh, non-interactive browser run:

```sh
npm run check:quality-calibration
```

The browser uses Authored Reference copies only; no Procedural Replacement is
used to select or relax a threshold. Stone Path supplies controlled uniform
scale, canonical-X pivot, source-world-Y rotation, and base-color perturbations.
Vase supplies reduced radial resolution, and Umbrella supplies connected-component
deletion. All four Stage 1 references also receive byte-repeatability and
identity-copy checks.

The report at
`baselines/stage-1-quality-calibration-v1.json` contains per-view evidence,
aggregates, worst-view values, capture checksums, environment metadata, the
frozen threshold definition, and 29 acceptance checks. World-normal error,
canonical surface area and valid volume, and vertex-set Chamfer/Hausdorff values
are diagnostic only. The report, its pixels' checksums, and every extracted
measurement are development-only and must never be imported by the replacement
runtime.

Geometry gates are evaluated first. If one fails, the Appearance Gate is marked
`evaluated: false` with reason `geometry-gate-failed`; appearance cannot offset
a failed bound, anchor, silhouette, contour, or depth result.

## Object and Stage 1 acceptance

Run or verify one frozen object result with `npm run accept:<object>` or
`npm run check:<object>`, where `<object>` is `stone-path`, `stone`, `vase`, or
`umbrella`. Run the complete ordered certification with:

```sh
npm run certify:stage-1
```

The command intentionally exits nonzero when any hard gate fails while still
writing `reports/stage-1-certification-v1.json` and
`reports/stage-1-evidence-summary-v1.md`. The frozen v1 result is `FAIL` with
two of four objects accepted; this negative result must not be converted into a
passing command by weakening thresholds or omitting failed objects.
