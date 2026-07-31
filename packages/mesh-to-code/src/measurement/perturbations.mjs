/**
 * The generic half of the host repository's perturbation helpers.
 *
 * The vendored original is half generic and half object-specific: alongside these
 * four it carries Stone-specific constructors that belong to one Reconstruction
 * Unit's calibration and are not re-exported here. Ticket 05 builds the generic
 * perturbation manifest on top of this surface.
 *
 * These functions operate on Three.js geometry, which is why they are a separate
 * entry point from `./index.mjs`: the kernel's measurement path resolves no
 * package of its own, and only a caller that already has a Three.js namespace
 * reaches this module.
 */

export {
  createLocalReferenceClone,
  quantizeRadialResolution,
  removeMeaningfulComponent,
  removeMeaningfulComponentFamily,
} from "./vendor/tools/evaluation/calibration-perturbations.mjs";
