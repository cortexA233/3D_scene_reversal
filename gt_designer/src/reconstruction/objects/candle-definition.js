import { generateCandle } from "./candle-generator.js";
import { CANDLE_RECIPE } from "./candle-recipe.js";

export const CANDLE_DEFINITION = Object.freeze({
  id: "candle",
  label: "Candle",
  recipe: CANDLE_RECIPE,
  generator: generateCandle,
  fixture: false,
});
