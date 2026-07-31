import { readFile } from "node:fs/promises";
import path from "node:path";

import { sha256Hex } from "../util/canonical-json.mjs";
import { meshBounds } from "../geometry/mesh.mjs";
import { parseObj } from "./obj.mjs";

const READERS = new Map([[".obj", { format: "obj", read: readObj }]]);

/**
 * Formats the input contract names but this build does not yet decode. Naming
 * them here keeps `list` and `run` honest: an unsupported input is classified,
 * never silently treated as empty geometry.
 */
const DECLARED_NOT_IMPLEMENTED = new Map([
  [".glb", "gltf-binary"],
  [".gltf", "gltf-json"],
  [".ply", "ply"],
  [".stl", "stl"],
]);

async function readObj(file) {
  const bytes = await readFile(file);
  return {
    bytes,
    parsed: parseObj(bytes.toString("utf8"), { sourceName: path.basename(file) }),
  };
}

export function supportedExtensions() {
  return [...READERS.keys()];
}

export async function ingestMeshFile(file) {
  const extension = path.extname(file).toLowerCase();
  const reader = READERS.get(extension);
  if (!reader) {
    const declared = DECLARED_NOT_IMPLEMENTED.get(extension);
    throw new IngestionError(
      declared
        ? `input format ${declared} (${extension}) is declared by the input contract but not decoded by this build`
        : `unsupported input extension: ${extension || "(none)"}`,
      declared ? "format-not-implemented" : "format-unsupported",
    );
  }
  const { bytes, parsed } = await reader.read(file);
  return {
    sourceName: path.basename(file),
    format: parsed.format,
    encodedBytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
    rejectedPrimitives: parsed.rejected,
    selectors: parsed.selectors.map(({ selector, mesh }) => ({
      selector,
      mesh,
      triangleCount: mesh.triangleCount,
      vertexCount: mesh.vertexCount,
      bounds: meshBounds(mesh),
    })),
  };
}

export class IngestionError extends Error {
  constructor(message, classification) {
    super(message);
    this.name = "IngestionError";
    this.classification = classification;
  }
}
