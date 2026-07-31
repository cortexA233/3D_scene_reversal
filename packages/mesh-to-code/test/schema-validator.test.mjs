import assert from "node:assert/strict";
import test from "node:test";

import { canonicalHash, canonicalize } from "../src/util/canonical-json.mjs";
import { formatFailures, validate } from "../src/util/schema.mjs";
import { loadSchema } from "../src/protocol/schemas.mjs";
import { DECISION_POINTS, responseSchemaFor } from "../src/protocol/decision-points.mjs";

test("canonical serialization is independent of key insertion order", () => {
  assert.equal(
    canonicalize({ b: 1, a: [3, { d: 4, c: 5 }] }),
    canonicalize({ a: [3, { c: 5, d: 4 }], b: 1 }),
  );
  assert.equal(canonicalHash({ x: -0 }), canonicalHash({ x: 0 }));
  assert.throws(() => canonicalize({ x: Number.NaN }), /finite/);
});

test("the validator enforces the keywords the protocol relies on", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["name", "count"],
    properties: {
      name: { type: "string", pattern: "^[a-z-]+$" },
      count: { type: "integer", minimum: 1 },
      tags: { type: "array", items: { type: "string" }, minItems: 1 },
    },
  };
  assert.equal(validate({ name: "unit-a", count: 2 }, schema).valid, true);
  assert.equal(validate({ name: "Unit A", count: 2 }, schema).valid, false);
  assert.equal(validate({ name: "unit-a", count: 0 }, schema).valid, false);
  assert.equal(validate({ name: "unit-a", count: 1.5 }, schema).valid, false);
  assert.equal(validate({ count: 1 }, schema).valid, false);
  assert.equal(validate({ name: "unit-a", count: 1, extra: 1 }, schema).valid, false);
  assert.equal(validate({ name: "unit-a", count: 1, tags: [] }, schema).valid, false);
  assert.match(formatFailures(validate({ count: 1 }, schema).failures), /\$\.name is required/);
});

test("every Decision Point publishes a loadable response schema", () => {
  for (const id of Object.keys(DECISION_POINTS)) {
    const schema = responseSchemaFor(id);
    assert.equal(schema.type, "object");
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0);
    assert.equal(
      schema.additionalProperties,
      false,
      `${id} must reject fields it did not declare`,
    );
  }
});

test("a decision may not carry a field that decides what passes", () => {
  const forbidden = /threshold|tier|baseline|gate|accept|pass/i;
  for (const id of Object.keys(DECISION_POINTS)) {
    const serialized = canonicalize(responseSchemaFor(id));
    const properties = Object.keys(responseSchemaFor(id).properties ?? {});
    for (const property of properties) {
      assert.equal(
        forbidden.test(property),
        false,
        `${id}.${property} would let a decider influence what passes`,
      );
    }
    assert.equal(typeof serialized, "string");
  }
});

test("the published artifact schemas keep evidence out of the Production Runtime", () => {
  for (const file of [
    "pending-decision.schema.json",
    "structure-manifest.schema.json",
    "evidence.schema.json",
  ]) {
    const schema = loadSchema(file);
    assert.equal(schema.properties.productionUse.const, "prohibited");
    assert.match(schema.properties.artifactRole.const, /^development-only/);
  }
});
