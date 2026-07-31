import { createMesh } from "../geometry/mesh.mjs";

/**
 * Parse Wavefront OBJ text into one selector per `o`/`g` group.
 *
 * Only the subset the kernel needs is honoured: `v`, `f`, `o`, `g`. Faces with
 * more than three corners are fanned; a face referencing a texture or normal
 * index keeps only its position index. Anything the kernel cannot turn into
 * triangles is reported rather than silently dropped.
 */
export function parseObj(text, { sourceName = null } = {}) {
  const positions = [];
  const groups = [];
  const rejected = [];
  let current = null;

  const openGroup = (name) => {
    current = { name, faces: [] };
    groups.push(current);
  };

  const lines = text.split(/\r?\n/);
  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const keyword = parts[0];

    if (keyword === "v") {
      const components = parts.slice(1, 4).map(Number);
      if (components.length !== 3 || components.some((value) => !Number.isFinite(value))) {
        throw new RangeError(`OBJ line ${lineIndex + 1}: vertex needs three finite numbers`);
      }
      positions.push(...components);
      continue;
    }

    if (keyword === "o" || keyword === "g") {
      openGroup(parts.slice(1).join(" ") || `group-${groups.length}`);
      continue;
    }

    if (keyword === "f") {
      if (current === null) openGroup("group-0");
      const corners = parts.slice(1).map((corner) => {
        const positionToken = corner.split("/")[0];
        const parsed = Number.parseInt(positionToken, 10);
        if (!Number.isInteger(parsed) || parsed === 0) return null;
        return parsed > 0 ? parsed - 1 : positions.length / 3 + parsed;
      });
      if (corners.some((corner) => corner === null)) {
        rejected.push({ line: lineIndex + 1, reason: "unparsable-face-index" });
        continue;
      }
      if (corners.length < 3) {
        rejected.push({ line: lineIndex + 1, reason: "non-triangle-primitive" });
        continue;
      }
      for (let corner = 2; corner < corners.length; corner += 1) {
        current.faces.push(corners[0], corners[corner - 1], corners[corner]);
      }
      continue;
    }

    if (keyword === "l" || keyword === "p") {
      rejected.push({ line: lineIndex + 1, reason: "non-triangle-primitive" });
    }
  }

  if (positions.length === 0) {
    throw new RangeError("OBJ contains no vertices");
  }

  const selectors = groups
    .filter((group) => group.faces.length > 0)
    .map((group) => {
      const used = new Map();
      const localPositions = [];
      const localIndices = [];
      for (const globalIndex of group.faces) {
        if (globalIndex < 0 || globalIndex >= positions.length / 3) {
          throw new RangeError(`OBJ face index ${globalIndex} is outside the vertex array`);
        }
        let localIndex = used.get(globalIndex);
        if (localIndex === undefined) {
          localIndex = localPositions.length / 3;
          used.set(globalIndex, localIndex);
          localPositions.push(
            positions[globalIndex * 3],
            positions[globalIndex * 3 + 1],
            positions[globalIndex * 3 + 2],
          );
        }
        localIndices.push(localIndex);
      }
      return {
        selector: group.name,
        mesh: createMesh({
          positions: localPositions,
          indices: localIndices,
          name: group.name,
        }),
      };
    });

  if (selectors.length === 0) {
    throw new RangeError("OBJ contains no triangle faces");
  }

  return { sourceName, format: "obj", selectors, rejected };
}
