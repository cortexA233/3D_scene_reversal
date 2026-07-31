import { loadSchema, schemaRef } from "./schemas.mjs";

/**
 * The four Decision Points. Each publishes mechanical evidence in numeric form
 * and the exact response schema a decider must satisfy. Imagery is always
 * optional so a text-only decider can answer.
 */
export const DECISION_POINTS = Object.freeze({
  "unit-division": Object.freeze({
    id: "unit-division",
    question:
      "How do the mechanical components divide into Reconstruction Units? Five separated mushroom forms are one unit while a table and a cup are two; geometry alone cannot tell them apart.",
    responseSchemaFile: "response.unit-division.schema.json",
  }),
  "semantic-grouping": Object.freeze({
    id: "semantic-grouping",
    question:
      "Which of the recomputable candidate groupings is the semantic grouping for this Reconstruction Unit?",
    responseSchemaFile: "response.semantic-grouping.schema.json",
  }),
  "structure-proposal": Object.freeze({
    id: "structure-proposal",
    question:
      "Which mutually dissimilar Contract Operator compositions should this round of the beam search try?",
    responseSchemaFile: "response.structure-proposal.schema.json",
  }),
  "operator-authoring": Object.freeze({
    id: "operator-authoring",
    question:
      "The library-only search failed this unit's geometry gate. Author a new Contract Operator, or accept the best library-only composition?",
    responseSchemaFile: "response.operator-authoring.schema.json",
  }),
});

export function decisionPoint(id) {
  const definition = DECISION_POINTS[id];
  if (!definition) throw new Error(`unknown Decision Point: ${id}`);
  return definition;
}

export function responseSchemaFor(id) {
  return loadSchema(decisionPoint(id).responseSchemaFile);
}

export function responseSchemaRefFor(id) {
  return schemaRef(decisionPoint(id).responseSchemaFile);
}
