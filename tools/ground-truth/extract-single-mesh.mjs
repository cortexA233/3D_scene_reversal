import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { LAB_SCENE } from "../../gt_designer/single-mesh-lab/scene-config.js";
import { analyzeTriangleMesh } from "./mesh-analysis.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_INPUT = "gt_designer/data/island-village.glb";
const DEFAULT_OUTPUT =
  "gt_designer/single-mesh-lab/ground-truth/evidence-v1.json";
const SCHEMA_VERSION = "single-mesh-ground-truth-v1";
const IDENTITY = new THREE.Matrix4().elements;

function parseArguments(args) {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, check: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--input" || argument === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function cleanNumber(value) {
  if (Object.is(value, -0)) return 0;
  if (Math.abs(value) < 1e-15) return 0;
  return value;
}

function cleanNumbers(values) {
  return Array.from(values, cleanNumber);
}

function matrixIsIdentity(matrix, epsilon = 1e-12) {
  return matrix.every(
    (value, index) => Math.abs(value - IDENTITY[index]) <= epsilon,
  );
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function collectWorldGeometry(node) {
  const mesh = node.getMesh();
  if (!mesh) throw new Error(`Selected node has no mesh: ${node.getName()}`);
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const point = new THREE.Vector3();
  const positions = [];
  const indices = [];
  const primitives = [];

  for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
    if (primitive.getMode() !== 4) {
      throw new Error(
        `${node.getName()} primitive ${primitiveIndex} is not TRIANGLES`,
      );
    }
    const accessor = primitive.getAttribute("POSITION");
    if (!accessor) {
      throw new Error(`${node.getName()} primitive ${primitiveIndex} has no POSITION`);
    }
    const sourcePositions = accessor.getArray();
    if (!sourcePositions) {
      throw new Error(`${node.getName()} primitive ${primitiveIndex} has no position array`);
    }
    const vertexOffset = positions.length / 3;
    for (let offset = 0; offset < sourcePositions.length; offset += 3) {
      point
        .set(
          sourcePositions[offset],
          sourcePositions[offset + 1],
          sourcePositions[offset + 2],
        )
        .applyMatrix4(matrix);
      positions.push(point.x, point.y, point.z);
    }

    const indexArray = primitive.getIndices()?.getArray();
    const primitiveIndices = indexArray
      ? Array.from(indexArray)
      : Array.from(
          { length: sourcePositions.length / 3 },
          (_, index) => index,
        );
    for (const index of primitiveIndices) indices.push(vertexOffset + index);
    primitives.push({
      primitiveIndex,
      vertexCount: sourcePositions.length / 3,
      triangleCount: primitiveIndices.length / 3,
      indexed: Boolean(indexArray),
    });
  }

  return { positions, indices, primitives };
}

function textureEvidence(slot, texture) {
  if (!texture) return null;
  const image = texture.getImage();
  let dimensions = null;
  let dimensionError = null;
  try {
    dimensions = texture.getSize();
  } catch (error) {
    dimensionError = error instanceof Error ? error.message : String(error);
  }
  return {
    slot,
    name: texture.getName() || null,
    mimeType: texture.getMimeType() || null,
    dimensions: dimensions ? cleanNumbers(dimensions) : null,
    encodedBytes: image?.byteLength ?? null,
    dimensionError,
  };
}

function materialEvidence(material) {
  if (!material) return null;
  const textureSlots = [
    ["baseColor", material.getBaseColorTexture()],
    ["metallicRoughness", material.getMetallicRoughnessTexture()],
    ["normal", material.getNormalTexture()],
    ["occlusion", material.getOcclusionTexture()],
    ["emissive", material.getEmissiveTexture()],
  ];
  return {
    name: material.getName() || null,
    baseColor: cleanNumbers(material.getBaseColorFactor()),
    emissive: cleanNumbers(material.getEmissiveFactor()),
    roughness: cleanNumber(material.getRoughnessFactor()),
    metalness: cleanNumber(material.getMetallicFactor()),
    alphaMode: material.getAlphaMode(),
    doubleSided: material.getDoubleSided(),
    textures: textureSlots
      .map(([slot, texture]) => textureEvidence(slot, texture))
      .filter(Boolean),
  };
}

function placementEvidence(node, bounds) {
  const localMatrix = cleanNumbers(node.getMatrix());
  const worldMatrix = cleanNumbers(node.getWorldMatrix());
  const localMatrixIsIdentity = matrixIsIdentity(localMatrix);
  const worldMatrixIsIdentity = matrixIsIdentity(worldMatrix);
  const center = bounds.min.map(
    (value, axis) => (value + bounds.max[axis]) * 0.5,
  );
  const largestDimension = Math.max(...bounds.size);
  const centerDistanceInObjectLengths =
    largestDimension > 0 ? Math.hypot(...center) / largestDimension : null;
  let classification = "node-transform-present";
  let reason = "The node hierarchy contains a non-identity transform.";
  if (localMatrixIsIdentity && worldMatrixIsIdentity) {
    if (centerDistanceInObjectLengths !== null && centerDistanceInObjectLengths > 2) {
      classification = "likely-baked-world-placement";
      reason =
        "The node transform is identity while geometry lies more than two object lengths from the world origin.";
    } else {
      classification = "identity-transform-indeterminate-placement";
      reason =
        "The node transform is identity, but geometry position alone does not prove whether placement was baked.";
    }
  }
  return {
    localTranslation: cleanNumbers(node.getTranslation()),
    localRotation: cleanNumbers(node.getRotation()),
    localScale: cleanNumbers(node.getScale()),
    localMatrix,
    worldTranslation: cleanNumbers(node.getWorldTranslation()),
    worldRotation: cleanNumbers(node.getWorldRotation()),
    worldScale: cleanNumbers(node.getWorldScale()),
    worldMatrix,
    localMatrixIsIdentity,
    worldMatrixIsIdentity,
    placementClassification: classification,
    placementReason: reason,
    geometryCenterDistanceInObjectLengths:
      centerDistanceInObjectLengths === null
        ? null
        : cleanNumber(centerDistanceInObjectLengths),
  };
}

function extractObject(document, spec) {
  const matches = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getName() === spec.sourceNode && node.getMesh());
  if (matches.length !== 1) {
    throw new Error(
      `Expected one mesh node named "${spec.sourceNode}", found ${matches.length}`,
    );
  }
  const node = matches[0];
  const geometry = collectWorldGeometry(node);
  const analysis = analyzeTriangleMesh(geometry);
  const bottomCenter = [
    (analysis.bounds.min[0] + analysis.bounds.max[0]) * 0.5,
    analysis.bounds.min[1],
    (analysis.bounds.min[2] + analysis.bounds.max[2]) * 0.5,
  ];
  const reconstructionBounds = {
    min: analysis.bounds.min.map((value, axis) => value - bottomCenter[axis]),
    max: analysis.bounds.max.map((value, axis) => value - bottomCenter[axis]),
    size: analysis.bounds.size,
  };
  const materials = node
    .getMesh()
    .listPrimitives()
    .map((primitive) => materialEvidence(primitive.getMaterial()));

  return {
    id: spec.id,
    label: spec.label,
    developmentSourceNode: spec.sourceNode,
    sourceMapping: {
      matchCount: matches.length,
      meshName: node.getMesh().getName() || null,
      primitiveCount: geometry.primitives.length,
    },
    transform: placementEvidence(node, analysis.bounds),
    sourceWorldBounds: {
      min: cleanNumbers(analysis.bounds.min),
      max: cleanNumbers(analysis.bounds.max),
      size: cleanNumbers(analysis.bounds.size),
      bottomCenter: cleanNumbers(bottomCenter),
      largestDimension: cleanNumber(Math.max(...analysis.bounds.size)),
    },
    reconstructionFrame: {
      originInSourceWorld: cleanNumbers(bottomCenter),
      axisOrientation: "source-world",
      units: "authored-scene-units",
      bounds: {
        min: cleanNumbers(reconstructionBounds.min),
        max: cleanNumbers(reconstructionBounds.max),
        size: cleanNumbers(reconstructionBounds.size),
      },
    },
    geometry: {
      sourceVertexCount: analysis.sourceVertexCount,
      weldedVertexCount: analysis.weldedVertexCount,
      triangleCount: analysis.triangleCount,
      analyzedTriangleCount: analysis.analyzedTriangleCount,
      degenerateTriangleCount: analysis.degenerateTriangleCount,
      connectedComponentCount: analysis.connectedComponentCount,
      boundaryEdgeCount: analysis.boundaryEdgeCount,
      nonManifoldEdgeCount: analysis.nonManifoldEdgeCount,
      closed: analysis.isClosed,
      surfaceArea: cleanNumber(analysis.surfaceArea),
      volume: analysis.volume === null ? null : cleanNumber(analysis.volume),
      volumeUnavailableReason: analysis.volumeUnavailableReason,
      weldTolerance: cleanNumber(analysis.weldTolerance),
      primitives: geometry.primitives,
    },
    materials,
  };
}

export async function extractSingleMeshEvidence(inputFile) {
  const decoder = await draco3d.createDecoderModule();
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({ "draco3d.decoder": decoder });
  const document = await io.read(inputFile);
  const fileStats = await stat(inputFile);
  return {
    schemaVersion: SCHEMA_VERSION,
    artifactRole: "development-only-ground-truth-evidence",
    productionUse: "prohibited",
    sourceAsset: {
      projectRelativePath: path.relative(PROJECT_ROOT, inputFile),
      encodedBytes: fileStats.size,
      sha256: await sha256(inputFile),
    },
    reconstructionFrameDefinition:
      "Preserve source-world axes and translate the source world-space bounding-box bottom-center to the local origin; retain authored scene units.",
    objectCount: LAB_SCENE.objects.length,
    objects: LAB_SCENE.objects.map((spec) => extractObject(document, spec)),
  };
}

export async function loadWorldGeometryForUnit(inputFile, unitId) {
  const spec = LAB_SCENE.objects.find((candidate) => candidate.id === unitId);
  if (!spec) throw new Error(`Unknown Reconstruction Unit: ${unitId}`);
  const decoder = await draco3d.createDecoderModule();
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({ "draco3d.decoder": decoder });
  const document = await io.read(inputFile);
  const matches = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getName() === spec.sourceNode && node.getMesh());
  if (matches.length !== 1) {
    throw new Error(`Expected one mesh node for ${unitId}, found ${matches.length}`);
  }
  return collectWorldGeometry(matches[0]);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputFile = path.resolve(PROJECT_ROOT, options.input);
  const outputFile = path.resolve(PROJECT_ROOT, options.output);
  const report = await extractSingleMeshEvidence(inputFile);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.check) {
    const current = await readFile(outputFile, "utf8");
    if (current !== serialized) {
      throw new Error(
        `Ground-truth evidence is stale; run npm run extract:ground-truth`,
      );
    }
    process.stdout.write(
      `ground-truth evidence: current (${report.objectCount} objects)\n`,
    );
    return;
  }

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, serialized);
  process.stdout.write(
    `ground-truth evidence: wrote ${path.relative(PROJECT_ROOT, outputFile)} (${report.objectCount} objects)\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
