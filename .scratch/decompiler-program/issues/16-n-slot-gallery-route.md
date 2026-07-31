# 16 — N-slot gallery route for automatic output

Type: task
Status: ready-for-agent
Blocked by: 06

**What to build:** a place in this repository to actually look at automatically produced replacements,
several at a time, under the same viewing conditions the eight-slot delivery uses.

This is a **new** route with its own layout module, not a generalisation of the existing one. Both
eight-slot layout modules participate in the eight-object certification's frozen surface, so
parameterizing them in place would change frozen hashes. The conventions are reproduced; the frozen
files are not touched.

- [ ] A new gallery route accepts a variable number of units and lays them out on an auto-sized grid
- [ ] Normalization to a canonical maximum dimension, bottom-center alignment, and the framing camera
      convention match the existing eight-slot behaviour
- [ ] Neither eight-slot layout module is modified, and the eight-object certification check still
      passes unchanged
- [ ] The gallery loads no Authored Reference asset and passes the existing reference-independence audit
- [ ] Each displayed unit's Reconstruction Tier is read at build time from development-only evidence,
      never exported by the runtime
- [ ] Units below the accepted tier are visibly marked in the gallery
- [ ] The formal Reference-layout Delivery route is untouched and continues to admit only accepted units
