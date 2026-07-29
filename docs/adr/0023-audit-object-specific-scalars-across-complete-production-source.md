---
status: accepted
---

# Audit object-specific scalars across complete production source

Every numeric choice that encodes one Reconstruction Unit's geometry or appearance counts against its scalar budget whether it resides in a recipe, Object Generator, generated shader source, or object-specific helper; only documented universal algorithm and control-flow constants may be excluded. The Stage 1 Umbrella report's `86/96` result counted recipe literals alone despite object-specific geometry and pattern constants in generator and shader code, so Stage 1.5 treats that result as incomplete evidence, repairs the audit contract, and re-audits all four Stage 1 objects before assigning appearance headroom or accepting any nonvisual result; the 96-scalar Umbrella ceiling remains unchanged.
