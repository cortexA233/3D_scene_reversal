import { canonicalHash, canonicalize } from "../util/canonical-json.mjs";
import { loadSchema } from "../protocol/schemas.mjs";
import { formatFailures, validate } from "../util/schema.mjs";

export const STRUCTURE_MANIFEST_SCHEMA_VERSION = "mesh-to-code-structure-manifest-v1";

/**
 * Build the Structure Manifest and bind it to a hash over its own canonical
 * form. The decider's output is confined to this document, so the hash is the
 * boundary between "a rerun may choose differently" and "everything downstream
 * reproduces bit-for-bit".
 */
export function buildStructureManifest({
  kernelVersion,
  operatorLibraryVersion,
  input,
  unitId,
  unitDivision,
  semanticGrouping,
  composition,
  authoredOperators = [],
}) {
  const body = {
    schemaVersion: STRUCTURE_MANIFEST_SCHEMA_VERSION,
    artifactRole: "development-only-structure-manifest",
    productionUse: "prohibited",
    kernelVersion,
    operatorLibraryVersion,
    input,
    unitId,
    unitDivision,
    semanticGrouping,
    composition,
    authoredOperators,
  };
  const manifest = { ...body, manifestHash: canonicalHash(body) };
  assertValidManifest(manifest);
  return manifest;
}

export function manifestBody(manifest) {
  const { manifestHash, ...body } = manifest;
  return body;
}

export function verifyManifestHash(manifest) {
  const expected = canonicalHash(manifestBody(manifest));
  return {
    passed: expected === manifest.manifestHash,
    expected,
    actual: manifest.manifestHash,
  };
}

export function assertValidManifest(manifest) {
  const result = validate(manifest, loadSchema("structure-manifest.schema.json"));
  if (!result.valid) {
    throw new Error(`invalid Structure Manifest: ${formatFailures(result.failures)}`);
  }
  const hash = verifyManifestHash(manifest);
  if (!hash.passed) {
    throw new Error(
      `Structure Manifest hash mismatch: expected ${hash.expected}, found ${hash.actual}`,
    );
  }
  return manifest;
}

/**
 * A stable unsigned 32-bit seed derived from the manifest hash, so the recipe
 * carries an explicit versioned seed and no ambient randomness enters.
 */
export function seedFromManifest(manifest) {
  return Number.parseInt(manifest.manifestHash.slice(0, 8), 16) >>> 0;
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(JSON.parse(canonicalize(manifest)), null, 2)}\n`;
}
