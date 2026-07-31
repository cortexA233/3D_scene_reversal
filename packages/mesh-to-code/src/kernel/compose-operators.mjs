import { roundScalar } from "../emit/format.mjs";
import { emitGeneratorModule, emitRecipeModule } from "../emit/program.mjs";
import { getOperator } from "../operators/library.mjs";
import { seedFromManifest } from "./manifest.mjs";

/**
 * Emit a composition of Contract Operators.
 *
 * The recipe carries the compact semantic parameters; the generator carries the
 * operators' own source, taken from the same functions the fitting loop scored, so
 * the code that was measured and the code that ships are the same code. In `inline`
 * mode only the operators this composition actually uses are carried.
 */
const ASSEMBLE_BODY = [
  "  return recipe.shape.parts.map((part) => {",
  "    const built = OPERATORS[part.operatorId](part.parameters);",
  "    return {",
  "      semanticId: `${recipe.id}/${part.part}`,",
  "      positions: built.positions,",
  "      indices: built.indices,",
  "      material: recipe.appearance.roles[part.role],",
  "    };",
  "  });",
].join("\n");

function roundProfile(profile) {
  return profile.map(([radius, height]) => [roundScalar(radius), roundScalar(height)]);
}

function roundParameters(parameters) {
  const rounded = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (Array.isArray(value) && Array.isArray(value[0])) {
      rounded[key] = roundProfile(value);
    } else if (Array.isArray(value)) {
      rounded[key] = value.map(roundScalar);
    } else if (typeof value === "number") {
      rounded[key] = Number.isInteger(value) ? value : roundScalar(value);
    } else {
      rounded[key] = value;
    }
  }
  return rounded;
}

/**
 * Build the recipe and the emitted modules from a manifest plus fitted parameters.
 * `authoredOperators` carries any operator the escape hatch produced, so a violating
 * one reaches the audit rather than being filtered out before it can be caught.
 */
export function composeOperatorProgram({ manifest, fits, authoredOperators = new Map() }) {
  const resolve = (operatorId) =>
    authoredOperators.get(operatorId) ?? getOperator(operatorId);

  const parts = manifest.composition.parts.map((part, index) => {
    const fit = fits[part.groupId];
    if (!fit) throw new Error(`no fitted parameters for ${part.groupId}`);
    return {
      part: part.groupId,
      operatorId: part.operatorId,
      role: index === 0 ? "primary" : "secondary",
      parameters: roundParameters(fit.parameters),
    };
  });

  const recipe = {
    id: manifest.unitId,
    kind: "operator-composition-v1",
    seed: seedFromManifest(manifest),
    shape: { parts },
    appearance: {
      // Appearance is not solved in this build. Flat neutral roles are emitted so
      // the runtime is renderable, and the evidence records appearance as not
      // evaluated rather than letting a placeholder read as a result.
      solved: false,
      roles: {
        primary: { color: [0.62, 0.6, 0.56], roughness: 0.85, metalness: 0 },
        secondary: { color: [0.5, 0.48, 0.45], roughness: 0.85, metalness: 0 },
      },
    },
  };

  const usedOperatorIds = [...new Set(parts.map((part) => part.operatorId))].sort();
  const operatorSources = {};
  const builderSources = [];
  const registryEntries = [];
  for (const operatorId of usedOperatorIds) {
    const operator = resolve(operatorId);
    operatorSources[operatorId] = operator.builderSource;
    builderSources.push(
      `// Contract Operator ${operator.operatorId} (${operator.version})`,
      operator.builderSource,
      "",
    );
    registryEntries.push(`  ${JSON.stringify(operatorId)}: ${operator.builderName},`);
  }
  builderSources.push("const OPERATORS = {", ...registryEntries, "};");

  const emit = (mode) =>
    emitGeneratorModule({
      builderSources,
      assembleBody: ASSEMBLE_BODY,
      recipe,
      mode,
    });

  return {
    recipe,
    operatorIds: usedOperatorIds,
    modules: {
      "recipe.js": emitRecipeModule(recipe),
      "generator.js": emit("library"),
    },
    inline: emit("inline"),
    operatorSources,
  };
}
