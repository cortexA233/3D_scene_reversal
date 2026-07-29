---
status: accepted
---

# Evaluate every object with a reference-framed twelve-view set

Each Reconstruction Unit uses a fixed 12-view perspective Evaluation View Set at 512×512 with a 38-degree field of view: eight azimuths spaced by 45 degrees at 20-degree elevation and four diagonal azimuths at 60-degree elevation. Bottom views are excluded for the current ground-supported references, while object-specific extra views remain diagnostic. The reference bottom-center, source bounds, and maximum-dimension scale define the canonical transform, framing, target, distance, and clipping planes once; the identical transform and cameras are then used for the replacement, which is never independently normalized or reframed. Aggregate and worst-view results are both retained under identical renderer, lighting, tone-mapping, and pass conditions.
