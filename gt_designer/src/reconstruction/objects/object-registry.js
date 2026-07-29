import {
  generateProbe,
  PROBE_RECIPE,
} from "../testing/probe-generator.js";
import { generateStonePath } from "./stone-path-generator.js";
import { STONE_PATH_RECIPE } from "./stone-path-recipe.js";
import { generateStone } from "./stone-generator.js";
import { STONE_RECIPE } from "./stone-recipe.js";
import { generateVase } from "./vase-generator.js";
import { VASE_RECIPE } from "./vase-recipe.js";
import { generateUmbrella } from "./umbrella-generator.js";
import { UMBRELLA_RECIPE } from "./umbrella-recipe.js";

const DEFINITIONS = Object.freeze({
  probe: Object.freeze({
    id: "probe",
    label: "Acceptance Probe",
    recipe: PROBE_RECIPE,
    generator: generateProbe,
    fixture: true,
  }),
  "stone-path": Object.freeze({
    id: "stone-path",
    label: "Stone Path",
    recipe: STONE_PATH_RECIPE,
    generator: generateStonePath,
    fixture: false,
  }),
  stone: Object.freeze({
    id: "stone",
    label: "Stone",
    recipe: STONE_RECIPE,
    generator: generateStone,
    fixture: false,
  }),
  vase: Object.freeze({
    id: "vase",
    label: "Vase",
    recipe: VASE_RECIPE,
    generator: generateVase,
    fixture: false,
  }),
  umbrella: Object.freeze({
    id: "umbrella",
    label: "Umbrella",
    recipe: UMBRELLA_RECIPE,
    generator: generateUmbrella,
    fixture: false,
  }),
});

export function getObjectDefinition(id) {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown procedural object: ${id}`);
  return definition;
}

export function listObjectDefinitions() {
  return Object.values(DEFINITIONS);
}
