// OBJ -> GLB converter for the bike models (decimates, flattens materials, splits wheels).
// Usage: node tools/convert-models.mjs <sradObj> <ninjaObj>
// The output keeps wheels as separate nodes pivoted on their axle so the game can spin them,
// and tags tintable body panels with the material name "paint" so each bike can get its own colour.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const [sradObj, ninjaObj] = process.argv.slice(2);
if (!sradObj || !ninjaObj) {
  console.error('usage: node tools/convert-models.mjs <Srad750.obj> <Ninja.obj>');
  process.exit(1);
}

const hex = (c) => c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// ---- material slots --------------------------------------------------------------------
const SLOTS = {
  paint: { color: [0.9, 0.1, 0.1], metal: 0.3, rough: 0.35 },
  silver: { color: [0.72, 0.74, 0.78], metal: 0.9, rough: 0.3 },
  dark: { color: [0.12, 0.12, 0.13], metal: 0.6, rough: 0.45 },
  tire: { color: [0.05, 0.05, 0.05], metal: 0.0, rough: 0.9 },
  rim: { color: [0.55, 0.57, 0.6], metal: 0.9, rough: 0.35 },
  glass: { color: [0.55, 0.7, 0.85], metal: 0.1, rough: 0.05, alpha: 0.4 },
  lamp: { color: [1, 0.95, 0.75], metal: 0, rough: 0.2, emissive: [0.9, 0.85, 0.55] },
  tail: { color: [1, 0.1, 0.05], metal: 0, rough: 0.3, emissive: [0.6, 0.02, 0.0] },
};

const SRAD_PAINT = new Set([
  'carenagem', 'carenagem_baixo', 'carenagem_de_baixo', 'carenagem_principal', 'tanque',
  'tanque_parte_da_frente', 'rabeta', 'rabeta_pincipal', 'rabetabaixo', 'parte_da_frente',
  'parte_da_frente_smile', 'paralama', 'entradas_de_ar',
]);

function sradSlot(group, mtl) {
  if (group === 'wheel_front' || group === 'wheel_rear') return mtl.startsWith('renan') ? 'tire' : 'rim';
  if (SRAD_PAINT.has(group)) return mtl.includes('FFFFFFFF') ? 'paint' : 'dark';
  if (group === 'far') return mtl.includes('FFFF3C00') ? 'tail' : mtl.includes('env_6') ? 'lamp' : 'silver';
  if (group === 'sliuda' || group === 'Cylinder') return 'glass';
  if (mtl.startsWith('aluminium') || mtl.startsWith('metalpipe') || mtl.startsWith('dourado')) return 'silver';
  if (mtl.startsWith('renan') || mtl.startsWith('fronts')) return 'dark';
  if (mtl.startsWith('branco')) return 'silver';
  if (mtl.includes('CCCCCC') || mtl.includes('AAAAAA')) return 'silver';
  if (mtl.includes('trans')) return 'glass';
  return 'dark';
}

function ninjaSlot(group, mtl) {
  if (group === 'FrontWheel' || group === 'BackWheel') return mtl.includes('rubber') ? 'tire' : 'rim';
  if (mtl === 'bike1_glass') return 'glass';
  if (mtl === 'bike1_rubber') return 'tire';
  if (mtl === 'BodyRed') return 'paint';
  if (mtl === 'bike1_carpaint') return group === 'Kawasaki_Ninja_ZX-6R' ? 'paint' : 'dark';
  return 'silver';
}

// ---- OBJ parsing -----------------------------------------------------------------------
function parseObj(file) {
  const text = fs.readFileSync(file, 'utf8');
  const pos = [];
  const parts = new Map(); // group -> Map(mtl -> number[] of position indices (triangles))
  let group = 'default';
  let mtl = 'none';
  for (const line of text.split('\n')) {
    const c = line.charCodeAt(0);
    if (c === 118 && line.charCodeAt(1) === 32) {
      const p = line.split(/\s+/);
      pos.push(+p[1], +p[2], +p[3]);
    } else if (c === 102 && line.charCodeAt(1) === 32) {
      const p = line.trim().split(/\s+/).slice(1).map((s) => {
        const i = parseInt(s, 10);
        return i < 0 ? pos.length / 3 + i : i - 1;
      });
      let g = parts.get(group);
      if (!g) parts.set(group, (g = new Map()));
      let arr = g.get(mtl);
      if (!arr) g.set(mtl, (arr = []));
      for (let i = 1; i < p.length - 1; i++) arr.push(p[0], p[i], p[i + 1]);
    } else if ((c === 103 || c === 111) && line.charCodeAt(1) === 32) {
      group = line.slice(2).trim();
    } else if (line.startsWith('usemtl ')) {
      mtl = line.slice(7).trim();
    }
  }
  return { pos: new Float32Array(pos), parts };
}

// ---- geometry helpers ------------------------------------------------------------------
function weld(pos, tris, q) {
  const map = new Map();
  const outPos = [];
  const remap = new Map();
  const idx = new Uint32Array(tris.length);
  for (let i = 0; i < tris.length; i++) {
    const v = tris[i];
    let r = remap.get(v);
    if (r === undefined) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const key = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
      r = map.get(key);
      if (r === undefined) {
        r = outPos.length / 3;
        outPos.push(x, y, z);
        map.set(key, r);
      }
      remap.set(v, r);
    }
    idx[i] = r;
  }
  return { pos: new Float32Array(outPos), idx };
}

function smoothNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

async function convert({ name, file, slotOf, skip, wheels, up, outDir, lengthM, noSimplify = false }) {
  console.log(`\n== ${name}`);
  const { pos, parts } = parseObj(file);
  // remap axes so Y is up, then find the length axis from the two wheel centres
  const axisIdx = { x: 0, y: 1, z: 2 };
  const U = axisIdx[up.axis];
  const sign = up.sign;
  const rotated = new Float32Array(pos.length);
  const others = [0, 1, 2].filter((a) => a !== U);
  // new (x, y, z) = (others[0], U*sign, others[1]) -- keep handedness by flipping when needed
  for (let i = 0; i < pos.length; i += 3) {
    rotated[i] = pos[i + others[0]];
    rotated[i + 1] = pos[i + U] * sign;
    rotated[i + 2] = pos[i + others[1]];
  }
  const center = (g) => {
    const m = parts.get(g);
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const tris of m.values()) for (const v of tris) for (let k = 0; k < 3; k++) {
      const val = rotated[v * 3 + k];
      if (val < mn[k]) mn[k] = val;
      if (val > mx[k]) mx[k] = val;
    }
    return { mn, mx, c: mn.map((v, i) => (v + mx[i]) / 2) };
  };
  const fw = center(wheels.front);
  const bw = center(wheels.rear);
  console.log('front wheel', fw.c.map((v) => v.toFixed(1)), 'rear wheel', bw.c.map((v) => v.toFixed(1)));
  // longitudinal axis = the horizontal axis (x or z) with the larger front-rear difference
  const dx = fw.c[0] - bw.c[0], dz = fw.c[2] - bw.c[2];
  const longAxis = Math.abs(dz) >= Math.abs(dx) ? 2 : 0;
  const frontSign = Math.sign(longAxis === 2 ? dz : dx);
  const allMin = [1e9, 1e9, 1e9], allMax = [-1e9, -1e9, -1e9];
  for (const [g, m] of parts) {
    if (skip.has(g)) continue;
    for (const tris of m.values()) for (const v of tris) for (let k = 0; k < 3; k++) {
      const val = rotated[v * 3 + k];
      if (val < allMin[k]) allMin[k] = val;
      if (val > allMax[k]) allMax[k] = val;
    }
  }
  const length = allMax[longAxis] - allMin[longAxis];
  const scale = lengthM / length;
  const midLong = (fw.c[longAxis] + bw.c[longAxis]) / 2;
  const midLat = (allMin[longAxis === 2 ? 0 : 2] + allMax[longAxis === 2 ? 0 : 2]) / 2;
  const latAxis = longAxis === 2 ? 0 : 2;
  console.log('length units', length.toFixed(1), 'scale', scale, 'frontSign', frontSign);
  // final transform: X=lateral, Y=up(from lowest point), Z=-forward (front toward -Z).
  // latSign is picked so the mapping is a proper rotation (no mirrored winding).
  const latSign = longAxis === 2 ? -frontSign : frontSign;
  const xf = (p) => [
    (p[latAxis] - midLat) * scale * latSign,
    (p[1] - allMin[1]) * scale,
    -(p[longAxis] - midLong) * frontSign * scale,
  ];

  await MeshoptSimplifier.ready;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const mats = new Map();
  const getMat = (slot) => {
    if (mats.has(slot)) return mats.get(slot);
    const s = SLOTS[slot];
    const m = doc.createMaterial(slot).setBaseColorFactor([...s.color, s.alpha ?? 1])
      .setMetallicFactor(s.metal).setRoughnessFactor(s.rough).setDoubleSided(true);
    if (s.emissive) m.setEmissiveFactor(s.emissive);
    if (s.alpha) m.setAlphaMode('BLEND');
    mats.set(slot, m);
    return m;
  };

  let totalIn = 0, totalOut = 0;
  for (const [g, m] of parts) {
    if (skip.has(g)) continue;
    const isWheel = g === wheels.front || g === wheels.rear;
    const node = doc.createNode(isWheel ? (g === wheels.front ? 'wheel_front' : 'wheel_rear') : g);
    let pivot = [0, 0, 0];
    if (isWheel) {
      const c = center(g).c;
      pivot = xf(c);
      node.setTranslation(pivot);
    }
    const mesh = doc.createMesh(g);
    // group primitives by slot
    const bySlot = new Map();
    for (const [mtl, tris] of m) {
      const slot = slotOf(g, mtl);
      let a = bySlot.get(slot);
      if (!a) bySlot.set(slot, (a = []));
      for (const t of tris) a.push(t);
    }
    for (const [slot, tris] of bySlot) {
      const welded = weld(rotated, tris, 0.0005 * length);
      let idx = welded.idx;
      const inCount = idx.length / 3;
      totalIn += inCount;
      const keep = noSimplify ? 1 : isWheel ? 0.14 : 0.065;
      const target = Math.min(inCount, Math.max(Math.round(inCount * keep), 60)) * 3;
      if (target < idx.length) {
        const [simp] = MeshoptSimplifier.simplify(idx, welded.pos, 3, target, 0.03, []);
        idx = simp;
      }
      totalOut += idx.length / 3;
      // compact + transform
      const used = new Map();
      const outPos = [];
      const outIdx = new Uint32Array(idx.length);
      for (let i = 0; i < idx.length; i++) {
        let r = used.get(idx[i]);
        if (r === undefined) {
          r = outPos.length / 3;
          const v = idx[i] * 3;
          const p = xf([welded.pos[v], welded.pos[v + 1], welded.pos[v + 2]]);
          outPos.push(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
          used.set(idx[i], r);
        }
        outIdx[i] = r;
      }
      const posArr = new Float32Array(outPos);
      const nrm = smoothNormals(posArr, outIdx);
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(posArr).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(outIdx).setBuffer(buffer))
        .setMaterial(getMat(slot));
      mesh.addPrimitive(prim);
    }
    node.setMesh(mesh);
    scene.addChild(node);
  }
  console.log(`triangles ${totalIn} -> ${totalOut}`);
  const io = new NodeIO();
  const out = path.join(outDir, `${name}.glb`);
  fs.mkdirSync(outDir, { recursive: true });
  await io.write(out, doc);
  console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}

const outDir = path.resolve('public/models');
await convert({
  name: 'srad750', file: sradObj, slotOf: sradSlot, skip: new Set(['zchassis']),
  wheels: { front: 'wheel_front', rear: 'wheel_rear' }, up: { axis: 'y', sign: 1 }, outDir, lengthM: 2.05,
});
await convert({
  name: 'ninja', noSimplify: true, file: ninjaObj, slotOf: ninjaSlot, skip: new Set(['shadow']),
  wheels: { front: 'FrontWheel', rear: 'BackWheel' }, up: { axis: 'y', sign: 1 }, outDir, lengthM: 2.05,
});
