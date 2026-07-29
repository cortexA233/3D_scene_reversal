import { generateStone } from "./stone-generator.js";
import { STONE_RECIPE } from "./stone-recipe.js";

export const STONE_DEFINITION = Object.freeze({
  id: "stone",
  label: "Stone",
  recipe: STONE_RECIPE,
  generator: generateStone,
  fixture: false,
});
