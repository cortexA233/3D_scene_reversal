---
status: accepted
---

# Use non-compensating scene parity gates

Full-scene acceptance uses a Scene Parity Gate Stack rather than a weighted overall score: stable semantic correspondence and placement, direct world-space geometry, fixed-camera semantic/silhouette/depth/normal evidence, and finally native appearance each retain their own blocking Quality Baseline plus aggregate and worst-case results. A diagnostic trend index may summarize iteration, but good materials, low average error, or one favorable view cannot compensate for a missing entity, incorrect layout, failed terrain or coastline, wrong horizon, or a worst-view geometry failure; every baseline is calibrated from reference repeatability and controlled reference perturbations before candidate fitting.
