import {
  generateProbe,
  PROBE_RECIPE,
} from "../testing/probe-generator.js";
import { generateStonePath } from "./stone-path-generator.js";
import { STONE_PATH_RECIPE } from "./stone-path-recipe.js";
import { generateVase } from "./vase-generator.js";
import { VASE_RECIPE } from "./vase-recipe.js";
import { STONE_DEFINITION } from "./stone-definition.js";
import { UMBRELLA_DEFINITION } from "./umbrella-definition.js";
import { generateBambooShoot } from "./bamboo-shoot-generator.js";
import { BAMBOO_SHOOT_RECIPE } from "./bamboo-shoot-recipe.js";
import { MUSHROOM_DEFINITION } from "./mushroom-definition.js";

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
  stone: STONE_DEFINITION,
  vase: Object.freeze({
    id: "vase",
    label: "Vase",
    recipe: VASE_RECIPE,
    generator: generateVase,
    fixture: false,
  }),
  umbrella: UMBRELLA_DEFINITION,
  "bamboo-shoot": Object.freeze({
    id: "bamboo-shoot",
    label: "Bamboo Shoot",
    recipe: BAMBOO_SHOOT_RECIPE,
    generator: generateBambooShoot,
    fixture: false,
  }),
  mushroom: MUSHROOM_DEFINITION,
});

export function getObjectDefinition(id) {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown procedural object: ${id}`);
  return definition;
}

export function listObjectDefinitions() {
  return Object.values(DEFINITIONS);
}
