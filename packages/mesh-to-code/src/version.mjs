import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(
  readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json"),
    "utf8",
  ),
);

export const KERNEL_VERSION = manifest.version;

/**
 * The Operator Library is versioned independently of the kernel because a
 * newly admitted operator changes what compositions are reachable without
 * changing the loop, the gates, or the budgets.
 */
export const OPERATOR_LIBRARY_VERSION = "operator-library-v0";
