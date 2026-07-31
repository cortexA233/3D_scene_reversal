import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../schemas",
);

const cache = new Map();

export function loadSchema(fileName) {
  if (!cache.has(fileName)) {
    cache.set(
      fileName,
      JSON.parse(readFileSync(path.join(SCHEMA_DIRECTORY, fileName), "utf8")),
    );
  }
  return cache.get(fileName);
}

export function schemaRef(fileName) {
  return `schemas/${fileName}`;
}
