import { generateMushroom } from "./mushroom-generator.js";
import { MUSHROOM_RECIPE } from "./mushroom-recipe.js";

export const MUSHROOM_DEFINITION = Object.freeze({
  id: "mushroom",
  label: "Mushroom",
  recipe: MUSHROOM_RECIPE,
  generator: generateMushroom,
  fixture: false,
});
