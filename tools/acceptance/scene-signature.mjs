import { createHash } from "node:crypto";
import * as THREE from "three";

/**
 * A digest of everything a generated scene decided.
 *
 * One implementation, imported by the Foundation certification's determinism check and by
 * the dynamic-moment stability check. Two copies of a signature is how the reference and
 * the candidate came to be sampled differently while both formulas read identically
 * (ADR-0055), and a digest is exactly the kind of definition that drifts unnoticed —
 * two digests that disagree look like a candidate defect.
 *
 * It covers CPU-side geometry, world matrices, semantic part identity, bounds, and derived
 * seeds. It deliberately does not cover material instances or renderer state: those are
 * not what Deterministic Generation is about, and the appearance layers measure them.
 */
export function geometrySignature(object) {
  object.updateMatrixWorld(true);
  const hash = createHash("sha256");
  object.traverse((child) => {
    if (!child.isMesh) return;
    hash.update(child.userData.semanticPart ?? "");
    hash.update(new Float32Array(child.matrixWorld.elements));
    hash.update(child.geometry.attributes.position.array);
  });
  return hash.digest("hex");
}

export function sceneSignature(generated) {
  const rows = [];
  for (const [semanticId, record] of [...generated.semanticIndex.entries()].sort()) {
    if (!record.object?.isObject3D) continue;
    const bounds = new THREE.Box3().setFromObject(record.object);
    rows.push(
      [
        semanticId,
        record.kind,
        record.group ?? "",
        JSON.stringify(record.seeds ?? null),
        bounds.min.toArray().map((value) => value.toFixed(6)).join(","),
        bounds.max.toArray().map((value) => value.toFixed(6)).join(","),
        geometrySignature(record.object),
      ].join("|"),
    );
  }
  return {
    semanticIdCount: generated.semanticIndex.size,
    digest: createHash("sha256").update(rows.join("\n")).digest("hex"),
  };
}
