---
status: accepted
amends: 0048
---

# Migrate the authoritative observation host to windows-edge-150-swiftshader-subzero

The authoritative Immutable Reference Observation profile moves from
`macos-chrome-150-swiftshader-llvm-10-0-0` to
`windows-edge-150-swiftshader-subzero`. ADR-0048's structure is unchanged: there
is still exactly one authoritative profile, a non-authoritative host still may
never rewrite it, and the separately versioned
`cross-host-observation-contract-v1` still governs only native appearance. Only
which host holds the authority changes.

ADR-0049 re-derives the auxiliary camera set, and a camera set is a fact the
Assembled Authored Scene determines, so `cross-host-observation-contract-v1`
requires it to be exact on every normative host. That makes re-freezing the
authoritative profile a required step of the ADR-0049 migration rather than an
optional one. The authoritative profile can only be written by its own host, and
no macOS machine with Chrome 150 and the SwiftShader LLVM 10.0.0 backend is
available to this project. The available normative host is Windows with Edge 150
and the SwiftShader Subzero backend, which ADR-0048 already registered as a
normative host and which had already reproduced every scene-determined fact of
the macOS profile exactly.

ADR-0048 warned that "re-freezing the authoritative profile on whichever machine
happens to run would erase the original evidence". That warning is honoured in
two ways. The macOS profile is not erased: it is preserved verbatim at
`.scratch/scene-parity-foundation/evidence/superseded/macos-chrome-150-swiftshader-llvm-10-0-0-camera-set-v1.json`,
together with the Windows secondary profile it was verified against, so the
evidence that the two hosts agreed under camera set v1 remains inspectable. And
this is a single declared migration tied to a specific superseding ADR, not a
standing policy that the last machine to run wins; the authoritative host key
stays a single hard-coded constant that only an ADR may change.

The cost is real and is not confined to the camera set. The camera set itself is
host-invariant, being pure geometry derived from authored bounds, so migrating it
across hosts risks nothing. Native appearance is not host-invariant. The
authoritative channel means, standard deviations, histograms, and perceptual hash
will now be frozen against Edge and the Subzero rasterizer rather than Chrome and
LLVM 10.0.0. This inverts ADR-0048's relationship: the profile that previously
carried the widened cross-host perceptual bound becomes the profile that defines
the centre, and a future macOS host would be the one measured against a widened
bound. Any appearance threshold that reconstruction ticket 01 calibrates will
therefore be a Subzero-referenced threshold. Because both sides of every parity
comparison are rendered on the same host in the same run, this does not bias the
candidate's result; it does mean that a later change of observation host would
require its own recalibration.

The migration is only legitimate because the two hosts had already been shown to
agree on every scene-determined fact. If they had not, promoting the secondary
host would be adopting unverified evidence. The preserved profiles are what makes
that prior agreement checkable after the fact.
