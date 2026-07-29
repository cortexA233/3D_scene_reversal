// Builds the authored village scene using static batching and shared resources.
// Transforms are consumed exactly as stored in the compact scene schema; baked
// geometry is preferred whenever it is available.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  matrixFromRows as sceneMatrix,
  vector3,
  colorOf,
  numberProperty,
  booleanProperty,
  materialProperties,
  wedgeGeometry,
} from "./scene-utils.js";

const MESH_TYPES = new Set(["Mesh"]);
const BAKED_MESH_TYPES = new Set(["BakedMesh"]);
const SHAPE_TYPES = new Set(["Shape"]);

const TEX_BASE = "./assets/textures/";
const GLB_BASE = "./assets/glb/";

function assetKey(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{3,})/);
  return match ? match[1] : null;
}

export class SceneBuilder {
  constructor({
    scene,
    assetIndex,
    materialPacks,
    loadingManager,
    maxAnisotropy = 8,
  }) {
    this.scene = scene;
    this.assetIndex = assetIndex || {};
    this.materialPacks = materialPacks || {};
    this.maxAnisotropy = Math.min(maxAnisotropy, 8);
    this.gltf = new GLTFLoader(loadingManager);
    this.texLoader = new THREE.TextureLoader(loadingManager);
    this.geomCache = new Map();
    this.texCache = new Map();
    this.meshGroups = new Map();
    this.partGroups = new Map();
    this.colliders = [];
    this.seats = [];
    this.prompts = [];
    this.lights = [];
    this.effects = []; // fire / smoke / particle anchors at real world positions
    this.bounds = new THREE.Box3();
    // ground-height accumulation grid (filled from object bases) — see groundField()
    this._gcell = 8; // authored units per ground sample cell
    this._gmin = new Map(); // "ix,iz" -> lowest base Y seen in that cell
    this.stats = {
      meshes: 0,
      bakedMeshes: 0,
      bakedFallbacks: 0,
      shapes: 0,
      referencedMeshes: 0,
      skipped: 0,
    };
  }

  // ---- traversal -------------------------------------------------------
  collect(node) {
    const type = node.type;
    const props = node.properties;
    if (props) this._consume(type, node, props);
    const kids = node.children;
    if (kids) for (let i = 0; i < kids.length; i++) this.collect(kids[i]);
  }

  _consume(type, node, props) {
    if (MESH_TYPES.has(type)) return this._mesh(node, props);
    if (BAKED_MESH_TYPES.has(type)) return this._bakedMesh(node, props);
    if (SHAPE_TYPES.has(type)) return this._shape(node, props);
    if (type === "Light") return this._light(node, props);
    if (type === "Particles") return this._effect(node, props);
  }

  _materialMaps(node) {
    if (!node.children) return null;
    for (const child of node.children)
      if (child.type === "Material") return child.properties;
    return null;
  }
  _interaction(node) {
    if (!node.children) return null;
    for (const child of node.children)
      if (child.type === "Interaction") return child.properties;
    return null;
  }

  // A referenced geometry child replaces its host's simple shape.
  _geometryReference(node) {
    if (!node.children) return null;
    for (const c of node.children) {
      if (c.type !== "GeometryReference") continue;
      const geometryId = assetKey(c.properties?.geometry);
      if (geometryId && this.assetIndex[geometryId]?.type === "mesh")
        return c.properties;
    }
    return null;
  }

  _addGeometryReference(node, props, reference, m, size) {
    const meshId = assetKey(reference.geometry);
    const texId = assetKey(reference.texture);
    const scale = vector3(reference.scale, 1);
    const matKey = `S|${meshId}|${texId || ""}`;
    let g = this.meshGroups.get(matKey);
    if (!g) {
      g = {
        meshId,
        texId,
        materialMaps: null,
        transparency: 0,
        foliage: true,
        items: [],
      };
      this.meshGroups.set(matKey, g);
    }
    g.items.push({
      matrix: m,
      size,
      color: colorOf(props),
      transparency: 0,
      specialScale: scale,
      reflectance: 0,
    });
    this.stats.referencedMeshes++;
  }

  _mesh(node, props) {
    const meshId = assetKey(props.geometry);
    if (!meshId) {
      this.stats.skipped++;
      return;
    }
    if (!this.assetIndex[meshId] || this.assetIndex[meshId].type !== "mesh") {
      this.stats.skipped++;
      return;
    }
    const size = vector3(props.size, 1);
    if (!props.matrix) return;
    const m = sceneMatrix(props.matrix).clone();
    this._track(m, size);
    const transparency = numberProperty(props, "transparency");
    this._meshCollider(props, m, size, transparency);
    this._maybeSeatPrompt(node, props, m, size);
    if (transparency >= 0.98) return;

    const materialMaps = this._materialMaps(node);
    const texId = assetKey(props.texture);
    const tb = Math.round(Math.min(transparency, 0.9) * 4);
    const matKey = `${meshId}|${texId || ""}|${materialMaps ? materialMaps.texturePack || materialMaps.colorMap || "s" : ""}|t${tb}`;
    let g = this.meshGroups.get(matKey);
    if (!g) {
      g = { meshId, texId, materialMaps, transparency, items: [] };
      this.meshGroups.set(matKey, g);
    }
    g.items.push({
      matrix: m,
      size,
      color: colorOf(props),
      transparency,
      reflectance: numberProperty(props, "reflectance"),
    });
    this.stats.meshes++;
  }

  // Baked geometry is scaled to the authored bounds; a simple shape remains as
  // a guarded fallback only when the corresponding GLB is unavailable.
  _bakedMesh(node, props) {
    if (!props.matrix) return;
    const size = vector3(props.size, 1);
    const m = sceneMatrix(props.matrix).clone();
    this._track(m, size);
    const transparency = numberProperty(props, "transparency");
    this._maybeSeatPrompt(node, props, m, size);
    const meshId = assetKey(props.geometry);
    const haveMesh =
      meshId &&
      this.assetIndex[meshId] &&
      this.assetIndex[meshId].type === "mesh";
    this._maybeCollider(props, m, size, false);
    if (transparency >= 0.98) return;

    if (haveMesh) {
      const tb = Math.round(Math.min(transparency, 0.9) * 4);
      const matKey = `U|${meshId}|t${tb}`;
      let g = this.meshGroups.get(matKey);
      if (!g) {
        g = {
          meshId,
          texId: null,
          materialMaps: null,
          transparency,
          baked: true,
          items: [],
        };
        this.meshGroups.set(matKey, g);
      }
      g.items.push({
        matrix: m,
        size,
        color: colorOf(props),
        transparency,
        reflectance: numberProperty(props, "reflectance"),
      });
      this.stats.bakedMeshes++;
    } else {
      const materialName = props.material || "Polymer";
      const key = `1|${materialName}|0`;
      let g = this.partGroups.get(key);
      if (!g) {
        g = {
          shape: 1,
          params: materialProperties(materialName),
          transparency: 0,
          items: [],
        };
        this.partGroups.set(key, g);
      }
      g.items.push({
        matrix: m,
        size,
        color: colorOf(props),
        reflectance: numberProperty(props, "reflectance"),
      });
      this.stats.bakedFallbacks++;
    }
  }

  _shape(node, props) {
    if (!props.matrix) return;
    const size = vector3(props.size, 1);
    const shape =
      parseInt(props.shape !== undefined ? props.shape : 1, 10) || 0;
    const transparency = numberProperty(props, "transparency");
    const materialName = props.material || "Polymer";
    const material = materialProperties(materialName);
    const m = sceneMatrix(props.matrix).clone();
    this._track(m, size);

    this._maybeSeatPrompt(node, props, m, size);
    if (transparency >= 0.98) {
      this._maybeCollider(props, m, size, false);
      return;
    }

    // A referenced geometry child replaces the host shape (tree canopies, props).
    const reference = this._geometryReference(node);
    if (reference) {
      this._addGeometryReference(node, props, reference, m, size);
      this._maybeCollider(props, m, size, false);
      return;
    }

    // Bare fire/smoke host parts are particle effects, not geometry — handled by
    // the Fire/Smoke child via _effect. Drop the neon placeholder box.
    if (/^(fire|flames?|b ?- ?flames?|smoke)$/i.test(node.name || "")) return;

    const transBucket = Math.round(Math.min(transparency, 0.95) * 5);
    const key = `${shape}|${materialName}|${transBucket}`;
    let g = this.partGroups.get(key);
    if (!g) {
      g = { shape, params: material, transparency, items: [] };
      this.partGroups.set(key, g);
    }
    g.items.push({
      matrix: m,
      size,
      color: colorOf(props),
      reflectance: numberProperty(props, "reflectance"),
    });
    this._maybeCollider(props, m, size, false);
    this.stats.shapes++;
  }

  _light(node, props) {
    if (!booleanProperty(props, "enabled", true)) return;
    if (this.lights.length > 60) return;
    const range = numberProperty(props, "range", 16);
    const bright = numberProperty(props, "intensity", 1);
    const c = props.color
      ? new THREE.Color().setRGB(
          props.color[0],
          props.color[1],
          props.color[2],
          THREE.SRGBColorSpace,
        )
      : new THREE.Color(1, 0.95, 0.85);
    this.lights.push({
      color: c,
      range,
      intensity: bright,
      position: this._lastPos ? this._lastPos.clone() : null,
    });
  }

  // Particle / fire / smoke / beam — record the host part's world position so the
  // effects module can place a faithful effect there (rule 4: effects, not boxes).
  _effect(node, props) {
    if (!booleanProperty(props, "enabled", true)) return;
    const pos = this._lastPos ? this._lastPos.clone() : null;
    if (!pos) return;
    const effectColor = (key) => {
      const value = props[key];
      if (value)
        return new THREE.Color().setRGB(
          value[0],
          value[1],
          value[2],
          THREE.SRGBColorSpace,
        );
      return null;
    };
    this.effects.push({
      kind: props.effect || "particles",
      pos,
      size: numberProperty(props, "size", 5),
      color: effectColor("color"),
      secondary: effectColor("secondaryColor"),
      rate: numberProperty(props, "rate", 20),
      name: node.name || "Effect",
    });
  }

  _maybeSeatPrompt(node, props, m, size) {
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    if (props.role === "seat" || (node.name && /seat/i.test(node.name))) {
      this.seats.push({
        pos,
        matrix: m.clone(),
        size: size.clone(),
        name: node.name || "Seat",
      });
    }
    const pp = this._interaction(node);
    if (pp) {
      this.prompts.push({
        pos,
        action: pp.action || "Interact",
        object: pp.object || node.name || "",
        dist: numberProperty(pp, "maxDistance", 10),
      });
    }
  }

  _maybeCollider(props, m, size, isMesh) {
    if (!booleanProperty(props, "collidable", true)) return;
    const maxs = Math.max(size.x, size.y, size.z);
    if (maxs < 2.2) return;
    if (this.colliders.length > 6000) return;
    this._pushBox(m, size);
  }

  _pushBox(m, size) {
    const pos = new THREE.Vector3(),
      quat = new THREE.Quaternion(),
      scl = new THREE.Vector3();
    m.decompose(pos, quat, scl);
    this.colliders.push({
      hx: Math.abs(size.x) / 2,
      hy: Math.abs(size.y) / 2,
      hz: Math.abs(size.z) / 2,
      pos: [pos.x, pos.y, pos.z],
      quat: [quat.x, quat.y, quat.z, quat.w],
    });
  }

  _meshCollider(props, m, size, transparency) {
    if (!booleanProperty(props, "collidable", true)) return;
    const maxs = Math.max(size.x, size.y, size.z);
    if (maxs < 2.2) return;
    if (Math.min(size.x, size.z) < 9) return;
    const meshId = assetKey(props.geometry);
    if (transparency >= 0.98 || !meshId) {
      if (this.colliders.length <= 6000) this._pushBox(m, size);
      return;
    }
    (this.meshColliderItems || (this.meshColliderItems = [])).push({
      meshId,
      matrix: m.clone(),
      size,
    });
  }

  _buildMeshColliders() {
    this.meshColliders = [];
    const area = this.colliderArea;
    const v = new THREE.Vector3(),
      p0 = new THREE.Vector3();
    const safe = (x) => (Math.abs(x) < 1e-5 ? 1 : x);
    let vAcc = [],
      iAcc = [],
      base = 0,
      chunkTris = 0,
      total = 0,
      skipped = 0;
    const flush = () => {
      if (!iAcc.length) return;
      this.meshColliders.push({
        vertices: new Float32Array(vAcc),
        indices: new Uint32Array(iAcc),
      });
      vAcc = [];
      iAcc = [];
      base = 0;
      chunkTris = 0;
    };
    for (const it of this.meshColliderItems || []) {
      if (area) {
        p0.setFromMatrixPosition(it.matrix);
        if (Math.hypot(p0.x - area.x, p0.z - area.z) > area.r) {
          skipped++;
          continue;
        }
      }
      const geo = this.geomCache.get(it.meshId);
      if (!geo || !geo.geometry) {
        this._pushBox(it.matrix, it.size);
        continue;
      }
      const g = geo.geometry,
        bbox = geo.bbox;
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const ns = new THREE.Vector3();
      bbox.getSize(ns);
      const local = new THREE.Matrix4()
        .makeScale(
          it.size.x / safe(ns.x),
          it.size.y / safe(ns.y),
          it.size.z / safe(ns.z),
        )
        .multiply(
          new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z),
        );
      const world = it.matrix.clone().multiply(local);
      const pos = g.attributes.position,
        n = pos.count;
      const idxSrc = g.index ? g.index.array : null;
      const tc = idxSrc ? idxSrc.length / 3 : n / 3;
      if (tc > 80000) {
        this._pushBox(it.matrix, it.size);
        continue;
      }
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(world);
        vAcc.push(v.x, v.y, v.z);
      }
      if (idxSrc)
        for (let i = 0; i < idxSrc.length; i++) iAcc.push(base + idxSrc[i]);
      else for (let i = 0; i < n; i++) iAcc.push(base + i);
      base += n;
      chunkTris += tc;
      total += tc;
      if (chunkTris > 350000) flush();
    }
    flush();
    this.meshColliderStats = {
      chunks: this.meshColliders.length,
      tris: total,
      skippedFar: skipped,
    };
  }

  _track(m, size) {
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    this._lastPos = p;
    this._lastMatrix = m;
    const maxs = Math.max(size.x, size.y, size.z);
    // Record a ground sample: the underside of sizable, roughly-flat parts marks the
    // local terrain surface. Skip tall thin things and the giant mountain meshes.
    if (maxs > 3 && maxs < 140 && size.y < 60) {
      const baseY = p.y - size.y / 2;
      const ix = Math.round(p.x / this._gcell),
        iz = Math.round(p.z / this._gcell);
      const k = ix + "," + iz;
      const cur = this._gmin.get(k);
      if (cur === undefined || baseY < cur) this._gmin.set(k, baseY);
      (this.baseYs || (this.baseYs = [])).push(baseY);
    }
    (this.xs || (this.xs = [])).push(p.x);
    (this.ys || (this.ys = [])).push(p.y);
    (this.zs || (this.zs = [])).push(p.z);
    const r = maxs * 0.5;
    this.bounds.expandByPoint(new THREE.Vector3(p.x - r, p.y - r, p.z - r));
    this.bounds.expandByPoint(new THREE.Vector3(p.x + r, p.y + r, p.z + r));
  }

  robustBounds() {
    const med = (a) => {
      const s = [...a].sort((x, y) => x - y);
      return s[s.length >> 1] || 0;
    };
    const cx = med(this.xs || [0]),
      cy = med(this.ys || [0]),
      cz = med(this.zs || [0]);
    const xs = this.xs || [0],
      zs = this.zs || [0];
    const d = xs
      .map((x, i) => Math.hypot(x - cx, (zs[i] || 0) - cz))
      .sort((a, b) => a - b);
    const radius = d[Math.floor(d.length * 0.95)] || 200;
    return { center: new THREE.Vector3(cx, cy, cz), radius };
  }

  // A bilinear ground-height sampler built from the per-cell lowest object bases.
  // Faithful: the ground is wherever the village's objects actually rest, not a
  // procedurally invented surface.
  groundField(fallbackY) {
    const cell = this._gcell,
      gmin = this._gmin;
    // fill holes with a coarse nearest/blur so sparse areas still return sane heights
    const get = (ix, iz) => gmin.get(ix + "," + iz);
    const sample = (x, z) => {
      const fx = x / cell,
        fz = z / cell;
      const ix = Math.floor(fx),
        iz = Math.floor(fz);
      let acc = 0,
        w = 0;
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          const v = get(ix + dx, iz + dz);
          if (v === undefined) continue;
          const wd = 1 / (1 + dx * dx + dz * dz);
          acc += v * wd;
          w += wd;
        }
      return w > 0 ? acc / w : fallbackY;
    };
    return sample;
  }

  // ---- asset loading ---------------------------------------------------
  async loadGeometry(meshId) {
    if (this.geomCache.has(meshId)) return this.geomCache.get(meshId);
    const p = new Promise((resolve) => {
      this.gltf.load(
        GLB_BASE + meshId + ".glb",
        (gltf) => {
          let geom = null;
          gltf.scene.traverse((o) => {
            if (!geom && o.isMesh) geom = o.geometry;
          });
          if (geom) geom.computeBoundingBox();
          resolve(
            geom ? { geometry: geom, bbox: geom.boundingBox.clone() } : null,
          );
        },
        undefined,
        () => resolve(null),
      );
    });
    const r = await p;
    this.geomCache.set(meshId, r);
    return r;
  }

  loadTexture(id, srgb = true) {
    if (!id) return null;
    if (this.texCache.has(id)) return this.texCache.get(id);
    const info = this.assetIndex[id];
    const ext = info && info.jpg ? ".jpg" : ".png";
    const t = this.texLoader.load(
      TEX_BASE + id + ext,
      undefined,
      undefined,
      () => {},
    );
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.maxAnisotropy;
    this.texCache.set(id, t);
    return t;
  }

  _surfaceTextures(materialMaps) {
    const out = {};
    let color = assetKey(materialMaps.colorMap),
      normal = assetKey(materialMaps.normalMap),
      rough = assetKey(materialMaps.roughnessMap),
      metal = assetKey(materialMaps.metalnessMap);
    const packId = assetKey(materialMaps.texturePack);
    if (packId && this.materialPacks[packId]) {
      const tp = this.materialPacks[packId];
      color = color || tp.color;
      normal = normal || tp.normal;
      rough = rough || tp.roughness;
      metal = metal || tp.metalness;
    }
    const has = (id) =>
      id && this.assetIndex[id] && this.assetIndex[id].type === "texture";
    if (has(color)) out.map = this.loadTexture(color, true);
    if (has(normal)) out.normalMap = this.loadTexture(normal, false);
    if (has(rough)) out.roughnessMap = this.loadTexture(rough, false);
    if (has(metal)) out.metalnessMap = this.loadTexture(metal, false);
    return out;
  }

  // ---- build instanced meshes -----------------------------------------
  async build(onProgress) {
    const meshKeys = [...this.meshGroups.keys()];
    const total = meshKeys.length + this.partGroups.size;
    let done = 0;
    const tick = () => {
      done++;
      if (onProgress) onProgress(done / total);
    };
    this._buildParts(tick);
    const CONC = 8;
    for (let i = 0; i < meshKeys.length; i += CONC) {
      await Promise.all(
        meshKeys
          .slice(i, i + CONC)
          .map((k) => this._buildMeshGroup(k).then(tick)),
      );
    }
    this._buildMeshColliders();
  }

  _buildParts(tick) {
    const unit = {
      0: new THREE.SphereGeometry(0.5, 20, 14),
      1: new THREE.BoxGeometry(1, 1, 1),
      2: (() => {
        const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 22);
        g.rotateZ(Math.PI / 2);
        return g;
      })(),
      3: wedgeGeometry(),
    };
    const tmpColor = new THREE.Color();
    for (const [key, g] of this.partGroups) {
      const geom = unit[g.shape] || unit[1];
      const p = g.params;
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: p.roughness,
        metalness: p.metalness,
        transparent: g.transparency > 0.02,
        opacity: 1 - g.transparency,
        emissive: p.emissive ? 0xffffff : 0x000000,
        emissiveIntensity: p.emissive ? 1.0 : 0,
      });
      if (p.glass) {
        mat.transparent = true;
        mat.opacity = Math.min(mat.opacity, 0.35);
        mat.roughness = 0.05;
      }
      const inst = new THREE.InstancedMesh(geom, mat, g.items.length);
      inst.castShadow = !p.emissive;
      inst.receiveShadow = true;
      inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const sm = new THREE.Matrix4();
      for (let i = 0; i < g.items.length; i++) {
        const it = g.items[i];
        sm.copy(it.matrix).multiply(
          new THREE.Matrix4().makeScale(it.size.x, it.size.y, it.size.z),
        );
        inst.setMatrixAt(i, sm);
        tmpColor.copy(it.color);
        inst.setColorAt(i, tmpColor);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.frustumCulled = true;
      inst.matrixAutoUpdate = false;
      this.scene.add(inst);
      tick();
    }
  }

  async _buildMeshGroup(key) {
    const g = this.meshGroups.get(key);
    const geo = await this.loadGeometry(g.meshId);
    if (!geo || !geo.geometry) return;
    const bbox = geo.bbox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const nativeSize = new THREE.Vector3();
    bbox.getSize(nativeSize);
    const safe = (v) => (Math.abs(v) < 1e-5 ? 1 : v);

    let mat;
    const groupTransparency = g.transparency || 0;
    if (g.materialMaps) {
      const tx = this._surfaceTextures(g.materialMaps);
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.75,
        metalness: 0.0,
        ...tx,
      });
      if (tx.metalnessMap) mat.metalness = 1.0;
    } else if (
      g.texId &&
      this.assetIndex[g.texId] &&
      this.assetIndex[g.texId].type === "texture"
    ) {
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.0,
        map: this.loadTexture(g.texId, true),
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.0,
      });
    }
    mat.transparent = groupTransparency > 0.02;
    if (mat.transparent) {
      mat.opacity = 1 - groupTransparency;
      mat.depthWrite = false;
    }
    if (g.foliage && mat.map) {
      mat.alphaTest = 0.5;
      mat.transparent = false;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;
      mat.roughness = 0.9;
    }
    mat.shadowSide = THREE.FrontSide;
    const inst = new THREE.InstancedMesh(geo.geometry, mat, g.items.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    const local = new THREE.Matrix4();
    const sm = new THREE.Matrix4();
    const tmpColor = new THREE.Color();
    for (let i = 0; i < g.items.length; i++) {
      const it = g.items[i];
      const sx = it.specialScale
        ? it.specialScale.x
        : it.size.x / safe(nativeSize.x);
      const sy = it.specialScale
        ? it.specialScale.y
        : it.size.y / safe(nativeSize.y);
      const sz = it.specialScale
        ? it.specialScale.z
        : it.size.z / safe(nativeSize.z);
      local
        .makeScale(sx, sy, sz)
        .multiply(
          new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z),
        );
      sm.copy(it.matrix).multiply(local);
      inst.setMatrixAt(i, sm);
      tmpColor.copy(it.color);
      inst.setColorAt(i, tmpColor);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.name = `${g.baked ? "Baked Mesh" : "Mesh"} · ${g.items.length}`;
    inst.matrixAutoUpdate = false;
    this.scene.add(inst);
  }
}
