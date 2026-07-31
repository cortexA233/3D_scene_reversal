/**
 * Asset-dependency detection over emitted source. The code-only asset boundary
 * cannot be a matter of degree, so this returns findings rather than a score and
 * any finding is a contract violation.
 */
const PATTERNS = [
  ["bare-module-import", /(?:^|[\s;])import\s+(?:[\w*{},\s$]+\s+from\s+)?["'](?![./])[^"']+["']/m],
  ["dynamic-import", /\bimport\s*\(/],
  ["commonjs-require", /\brequire\s*\(/],
  ["network-fetch", /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/],
  ["url-construction", /\bnew\s+URL\s*\(/],
  ["file-system-read", /\b(?:readFile|readFileSync|createReadStream)\s*\(/],
  ["data-uri", /["']data:[^"']*base64/i],
  ["asset-extension", /["'][^"']*\.(?:glb|gltf|obj|ply|stl|fbx|png|jpe?g|webp|ktx2?|bin|hdr|exr|svg)["']/i],
  ["texture-loader", /\b(?:TextureLoader|GLTFLoader|ImageBitmap|createImageBitmap|Image)\s*\(/],
  ["encoded-blob", /["'][A-Za-z0-9+/]{512,}={0,2}["']/],
];

export function findAssetDependencies(source, { allowRelativeImports = true } = {}) {
  const findings = [];
  for (const [id, pattern] of PATTERNS) {
    const match = source.match(pattern);
    if (match) {
      findings.push({ id, excerpt: match[0].slice(0, 120).trim() });
    }
  }
  if (!allowRelativeImports) {
    const relative = source.match(/(?:^|[\s;])import\s+[^;]*from\s+["']\.[^"']*["']/m);
    if (relative) {
      findings.push({
        id: "relative-import",
        excerpt: relative[0].slice(0, 120).trim(),
      });
    }
  }
  return findings;
}
