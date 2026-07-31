import { meshBounds } from "../geometry/mesh.mjs";
import { roundScalar } from "../emit/format.mjs";
import { emitGeneratorModule, emitRecipeModule } from "../emit/program.mjs";
import { seedFromManifest } from "./manifest.mjs";

/**
 * Turn a Structure Manifest plus the unit's geometry into emitted source.
 *
 * Everything here is downstream of the manifest, so it must be a pure
 * deterministic function of (manifest, mesh): the same pair reproduces the same
 * bytes. Composition kinds are registered rather than branched inline so a later
 * ticket adds an operator composition without reshaping the driver.
 */
const COMPOSERS = new Map([["stub-bounds-placeholder", composeBoundsPlaceholder]]);

export function registerComposer(kind, composer) {
  if (COMPOSERS.has(kind)) throw new Error(`composer already registered: ${kind}`);
  COMPOSERS.set(kind, composer);
}

export function composeProgram({ manifest, groupMeshes }) {
  const composer = COMPOSERS.get(manifest.composition.kind);
  if (!composer) {
    throw new Error(`unknown composition kind: ${manifest.composition.kind}`);
  }
  return composer({ manifest, groupMeshes });
}

const PLACEHOLDER_BUILDER = [
  "// Universal axis-aligned box construction. Its literals are algorithm",
  "// constants (unit-cube corner offsets and a fixed triangulation), not",
  "// Object-specific Scalars.",
  "function buildBox(center, size) {",
  "  const positions = new Float32Array(24);",
  "  let cursor = 0;",
  "  for (const dz of [-0.5, 0.5]) {",
  "    for (const dy of [-0.5, 0.5]) {",
  "      for (const dx of [-0.5, 0.5]) {",
  "        positions[cursor] = center[0] + dx * size[0];",
  "        positions[cursor + 1] = center[1] + dy * size[1];",
  "        positions[cursor + 2] = center[2] + dz * size[2];",
  "        cursor += 3;",
  "      }",
  "    }",
  "  }",
  "  const indices = new Uint32Array([",
  "    0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4,",
  "    2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5,",
  "  ]);",
  "  return { positions, indices };",
  "}",
];

const PLACEHOLDER_ASSEMBLE = [
  "  return recipe.shape.parts.map((part) => {",
  "    const { positions, indices } = buildBox(part.center, part.size);",
  "    return {",
  "      semanticId: `${recipe.id}/${part.part}`,",
  "      positions,",
  "      indices,",
  "      material: recipe.appearance.roles[part.role],",
  "    };",
  "  });",
].join("\n");

function composeBoundsPlaceholder({ manifest, groupMeshes }) {
  const parts = manifest.semanticGrouping.groups.map((group, index) => {
    const bounds = meshBounds(groupMeshes[group.groupId]);
    return {
      part: group.groupId,
      role: index === 0 ? "primary" : "secondary",
      center: [0, 1, 2].map((axis) =>
        roundScalar((bounds.min[axis] + bounds.max[axis]) * 0.5),
      ),
      size: [0, 1, 2].map((axis) => roundScalar(bounds.size[axis])),
    };
  });

  const recipe = {
    id: manifest.unitId,
    kind: "stub-bounds-placeholder",
    seed: seedFromManifest(manifest),
    shape: { parts },
    appearance: {
      roles: {
        primary: { color: [0.62, 0.6, 0.56], roughness: 0.85, metalness: 0 },
        secondary: { color: [0.5, 0.48, 0.45], roughness: 0.85, metalness: 0 },
      },
    },
  };

  return {
    recipe,
    operatorIds: [],
    modules: {
      "recipe.js": emitRecipeModule(recipe),
      "generator.js": emitGeneratorModule({
        builderSources: PLACEHOLDER_BUILDER,
        assembleBody: PLACEHOLDER_ASSEMBLE,
        recipe,
        mode: "library",
      }),
    },
    inline: emitGeneratorModule({
      builderSources: PLACEHOLDER_BUILDER,
      assembleBody: PLACEHOLDER_ASSEMBLE,
      recipe,
      mode: "inline",
    }),
    operatorSources: { "buildBox (universal)": PLACEHOLDER_BUILDER.join("\n") },
  };
}
