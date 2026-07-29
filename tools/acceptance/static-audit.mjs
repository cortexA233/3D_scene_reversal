import { readFile } from "node:fs/promises";
import path from "node:path";

const NUMERIC_LITERAL =
  /(?<![\w$.])(?:0[xob][\da-f_]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?![\w$])/gi;

function maskCommentsAndStrings(source) {
  let result = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (character === "/" && next === "/") {
        state = "line-comment";
        result += "  ";
        index += 1;
      } else if (character === "/" && next === "*") {
        state = "block-comment";
        result += "  ";
        index += 1;
      } else if (character === "'" || character === '"' || character === "`") {
        state = character;
        result += " ";
      } else {
        result += character;
      }
    } else if (state === "line-comment") {
      if (character === "\n") {
        state = "code";
        result += "\n";
      } else {
        result += " ";
      }
    } else if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "code";
        result += "  ";
        index += 1;
      } else {
        result += character === "\n" ? "\n" : " ";
      }
    } else if (character === "\\") {
      result += "  ";
      index += 1;
    } else if (character === state) {
      state = "code";
      result += " ";
    } else {
      result += character === "\n" ? "\n" : " ";
    }
  }
  return result;
}

function maskComments(source) {
  let result = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (character === "/" && next === "/") {
        state = "line-comment";
        result += "  ";
        index += 1;
      } else if (character === "/" && next === "*") {
        state = "block-comment";
        result += "  ";
        index += 1;
      } else {
        result += character;
      }
    } else if (state === "line-comment") {
      if (character === "\n") {
        state = "code";
        result += "\n";
      } else {
        result += " ";
      }
    } else if (character === "*" && next === "/") {
      state = "code";
      result += "  ";
      index += 1;
    } else {
      result += character === "\n" ? "\n" : " ";
    }
  }
  return result;
}

function numericValue(literal) {
  return Number(literal.replaceAll("_", ""));
}

export function numericLiteralEvidence(source) {
  const masked = maskCommentsAndStrings(source);
  const literals = [...masked.matchAll(NUMERIC_LITERAL)].map((match) => ({
    literal: match[0],
    offset: match.index,
  }));
  return {
    definition:
      "JavaScript numeric literals outside comments and string/template literals",
    count: literals.length,
    literals,
  };
}

/**
 * Find numeric choices outside recipe data, including literals embedded in
 * generated shader/template source. Only explicitly declared universal
 * algorithm and control-flow values are excluded.
 */
export function objectSpecificLiteralEvidence(
  source,
  { universalValues = [0, 0.01, 0.5, 1, 2, 3, 4] } = {},
) {
  const universal = new Set(universalValues);
  const visible = maskComments(source);
  const literals = [...visible.matchAll(NUMERIC_LITERAL)].map((match) => {
    const before = visible.slice(0, match.index);
    const line = before.split("\n").length;
    const lineStart = before.lastIndexOf("\n") + 1;
    const value = numericValue(match[0]);
    return {
      literal: match[0],
      value,
      line,
      column: match.index - lineStart + 1,
      classification: universal.has(value)
        ? "universal-algorithm-or-control-flow"
        : "object-specific",
    };
  });
  const objectSpecific = literals.filter(
    (entry) => entry.classification === "object-specific",
  );
  return {
    definition:
      "numeric literals in generator and generated shader source, excluding only the declared universal algorithm/control-flow values",
    universalValues: [...universal].sort((a, b) => a - b),
    count: objectSpecific.length,
    objectSpecific,
    classifiedLiteralCount: literals.length,
    literals,
  };
}

const SOURCE_PATTERNS = [
  ["authored-model-extension", /\.(?:glb|gltf)\b/i],
  ["authored-image-extension", /\.(?:png|jpe?g|webp|ktx2?|hdr|exr)\b/i],
  ["heightfield-reference", /heightfield/i],
  ["model-cdn-url", /https?:\/\//i],
  ["ground-truth-loader", /(?:GLTF|DRACO|Texture)Loader|ground-truth/i],
  ["evaluation-import", /single-mesh-(?:evaluation|lab)/i],
  ["source-manifest-reference", /scene-config|sourceNode|authoredReference/i],
  ["ambient-randomness", /Math\.random\s*\(/],
  [
    "gpu-feedback-into-generation",
    /readRenderTargetPixels|readPixels|getBufferSubData|transformFeedback/i,
  ],
  ["wasm-runtime", /WebAssembly|\.wasm\b/i],
  ["base64-payload", /(?:data:[^,]+;base64,|[A-Za-z0-9+/]{512,}={0,2})/],
  [
    "oversized-inline-numeric-array",
    /\[(?:\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?\s*,){128,}/i,
  ],
  [
    "oversized-typed-array-literal",
    /new\s+(?:Float\d+|Uint\d+|Int\d+)Array\s*\(\s*\[(?:[^\]]*,){128,}/i,
  ],
];

export function auditSourceText(source, { sourceNodeIds = [] } = {}) {
  const failures = [];
  for (const [rule, pattern] of SOURCE_PATTERNS) {
    if (pattern.test(source)) failures.push({ rule, detail: String(pattern) });
  }
  for (const sourceNodeId of sourceNodeIds) {
    if (sourceNodeId && source.includes(sourceNodeId)) {
      failures.push({ rule: "source-node-id", detail: sourceNodeId });
    }
  }
  return { passed: failures.length === 0, failures };
}

export async function auditProductionGraph({
  projectRoot,
  metafile,
  sourceNodeIds = [],
}) {
  const files = Object.keys(metafile.inputs)
    .filter((file) => !file.startsWith("node_modules/"))
    .sort();
  const failures = [];
  const filesEvidence = [];
  for (const file of files) {
    const normalized = file.split(path.sep).join("/");
    if (
      /(?:single-mesh-evaluation|single-mesh-lab|tools\/|ground-truth)/.test(
        normalized,
      )
    ) {
      failures.push({ rule: "dependency-direction", file: normalized });
      continue;
    }
    const source = await readFile(path.resolve(projectRoot, file), "utf8");
    const audit = auditSourceText(source, { sourceNodeIds });
    filesEvidence.push({ file: normalized, bytes: Buffer.byteLength(source) });
    for (const failure of audit.failures) failures.push({ ...failure, file });
  }
  const thirdPartyInputs = Object.keys(metafile.inputs)
    .filter((file) => file.startsWith("node_modules/"))
    .sort();
  for (const file of thirdPartyInputs) {
    if (!file.startsWith("node_modules/three/")) {
      failures.push({ rule: "unapproved-production-dependency", file });
    }
  }
  return {
    passed: failures.length === 0,
    productionFiles: filesEvidence,
    thirdPartyInputs,
    failures,
  };
}
