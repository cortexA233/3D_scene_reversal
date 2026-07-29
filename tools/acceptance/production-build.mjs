import { gzipSync } from "node:zlib";

import { build } from "esbuild";

export async function buildProductionBundle({
  entryPoint,
  projectRoot,
  includeThree = false,
}) {
  return buildWithOptions({
    projectRoot,
    includeThree,
    entryPoints: [entryPoint],
  });
}

export async function buildProductionSource({
  source,
  sourcefile,
  projectRoot,
  includeThree = false,
}) {
  return buildWithOptions({
    projectRoot,
    includeThree,
    stdin: { contents: source, sourcefile, resolveDir: projectRoot },
  });
}

async function buildWithOptions({
  projectRoot,
  includeThree,
  entryPoints,
  stdin,
}) {
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints,
    stdin,
    bundle: true,
    minify: true,
    legalComments: "none",
    metafile: true,
    platform: "browser",
    format: "esm",
    target: ["chrome150", "firefox140", "safari26"],
    external: includeThree ? [] : ["three"],
    sourcemap: false,
    write: false,
    outfile: "bundle.js",
    logLevel: "silent",
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(`expected one production output, found ${result.outputFiles.length}`);
  }
  const contents = result.outputFiles[0].contents;
  return {
    contents,
    metafile: result.metafile,
    bytes: contents.byteLength,
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
    sourceMapBytes: 0,
    minified: true,
    threeBundled: includeThree,
  };
}
