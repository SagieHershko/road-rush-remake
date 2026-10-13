import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_HALF, type LevelSpec } from './config';
import { Track, rng } from './track';

type Kind = 'box' | 'cone' | 'cyl' | 'sph' | 'pyr';

const geos: Record<Kind, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  sph: new THREE.SphereGeometry(1, 8, 6),
  pyr: new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4),
};

const CHUNK = 450;

interface Inst {
  m: THREE.Matrix4;
  c: THREE.Color;
}

class Scatter {
  private data = new Map<string, { kind: Kind; chunk: number; list: Inst[] }>();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpP = new THREE.Vector3();
  private tmpS = new THREE.Vector3();

  add(kind: Kind, s: number, pos: THREE.Vector3, rotY: number, sx: number, sy: number, sz: number, color: number): void {
    const chunk = Math.floor(s / CHUNK);
    const key = `${kind}|${chunk}`;
    let e = this.data.get(key);
    if (!e) this.data.set(key, (e = { kind, chunk, list: [] }));
    this.tmpQ.setFromEuler(this.tmpE.set(0, rotY, 0));
    const m = new THREE.Matrix4().compose(this.tmpP.copy(pos), this.tmpQ, this.tmpS.set(sx, sy, sz));
    e.list.push({ m, c: new THREE.Color(color) });
  }

  build(parent: THREE.Object3D): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const e of this.data.values()) {
      const mesh = new THREE.InstancedMesh(geos[e.kind], mat, e.list.length);
      e.list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
}

function tint(base: number, r: () => number, amt = 0.12): number {
  const c = new THREE.Color(base);
  const f = 1 + (r() - 0.5) * 2 * amt;
  c.multiplyScalar(f);
  return c.getHex();
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8ccd2';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y * 3) % 3 === 0 ? '#e8d890' : '#3b4a5e';
      g.fillRect(6 + x * 30, 8 + y * 30, 20, 20);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function roadTexture(level: LevelSpec): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + level.theme.asphalt.toString(16).padStart(6, '0');
  g.fillRect(0, 0, w, h);
  const r = rng(7);
  for (let i = 0; i < 5000; i++) {
    const v = Math.floor(r() * 60);
    g.fillStyle = `rgba(${v + 40},${v + 40},${v + 44},0.16)`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  // wheel tracks
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (const lane of [-3.4, 0, 3.4]) {
    for (const off of [-0.9, 0.9]) g.fillRect(((lane + off + ROAD_HALF) / (ROAD_HALF * 2)) * w - 6, 0, 12, h);
  }
  const x = (lat: number) => ((lat + ROAD_HALF) / (ROAD_HALF * 2)) * w;
  g.fillStyle = '#e8e8e0';
  g.fillRect(x(-5.55), 0, 5, h);
  g.fillRect(x(5.55) - 5, 0, 5, h);
  // lane dashes: 4 m on, 8 m off over a 24 m tile
  for (const lat of [-1.7, 1.7]) {
    g.fillRect(x(lat) - 2.5, 0, 5, h / 6);
    g.fillRect(x(lat) - 2.5, h / 2, 5, h / 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(text: string, a = '#111', b = '#fff'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = b;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = a;
  for (let i = 0; i < 32; i++) {
    g.fillRect(i * 16, (i % 2) * 16, 16, 16);
    g.fillRect(i * 16, 80 - (i % 2) * 16, 16, 16);
  }
  g.fillStyle = '#d81818';
  g.fillRect(0, 28, 512, 40);
  g.fillStyle = '#fff';
  g.font = 'bold 34px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 256, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface World {
  group: THREE.Group;
  sky: THREE.Mesh;
  sun: THREE.DirectionalLight;
}

export function buildWorld(track: Track, seed: number): World {
  const level = track.level;
  const th = level.theme;
  const r = rng(seed * 31 + 5);
  const group = new THREE.Group();
  const scatter = new Scatter();
  const v = new THREE.Vector3();
  const sm = { x: 0, y: 0, z: 0, yaw: 0, curv: 0, slope: 0 };

  // ---- lights & sky --------------------------------------------------------------------
  group.add(new THREE.HemisphereLight(th.ambient, th.ground, 1.0));
  const sun = new THREE.DirectionalLight(th.sun, th.sunIntensity);
  sun.position.set(-0.5, 1, -0.4).multiplyScalar(100);
  group.add(sun);

  const skyGeo = new THREE.SphereGeometry(1800, 24, 16);
  const colors: number[] = [];
  const top = new THREE.Color(th.skyTop);
  const hor = new THREE.Color(th.skyHorizon);
  const pos = skyGeo.attributes.position;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 1800;
    tmp.copy(hor).lerp(top, Math.pow(Math.max(0, y), 0.55));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(80, 24), new THREE.MeshBasicMaterial({ color: th.sun, fog: false }));
  sunDisc.position.set(-500, 330, -1500).normalize().multiplyScalar(1700);
  sunDisc.lookAt(0, 0, 0);
  sky.add(sunDisc);
  group.add(sky);

  // ---- road, ground ----------------------------------------------------------------------
  const rows = Math.ceil(track.total / 2);
  const roadPos: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];
  const tile = 24;
  for (let i = 0; i <= rows; i++) {
    const s = i * 2;
    track.sample(s, sm);
    const cx = Math.cos(sm.yaw);
    const cz = Math.sin(sm.yaw);
    roadPos.push(sm.x - cx * ROAD_HALF, sm.y + 0.02, sm.z - cz * ROAD_HALF, sm.x + cx * ROAD_HALF, sm.y + 0.02, sm.z + cz * ROAD_HALF);
    roadUv.push(0, s / tile, 1, s / tile);
    if (i < rows) {
      const a = i * 2;
      roadIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ map: roadTexture(level) }));
  group.add(road);

  const ds = [0, 1.5, 4, 9, 16, 26, 40, 62];
  const gStep = 4;
  const gRows = Math.ceil(track.total / gStep);
  const base = new THREE.Color(th.ground);
  const alt = new THREE.Color(th.groundAlt);
  const col = new THREE.Color();
  for (const side of [0, 1] as const) {
    const sg = side === 0 ? -1 : 1;
    const gp: number[] = [];
    const gc: number[] = [];
    const gi: number[] = [];
    for (let i = 0; i <= gRows; i++) {
      const s = i * gStep;
      track.sample(s, sm);
      const cx = Math.cos(sm.yaw);
      const cz = Math.sin(sm.yaw);
      for (let j = 0; j < ds.length; j++) {
        const d = ds[j];
        const lat = sg * (ROAD_HALF + d);
        gp.push(sm.x + cx * lat, sm.y + track.terrain(side, s, d) - (d === 0 ? 0.01 : 0), sm.z + cz * lat);
        const n = 0.5 + 0.5 * Math.sin(s * 0.07 + j * 1.3 + side * 4);
        col.copy(base).lerp(alt, n * 0.7 + (d < 1.6 ? 0.3 : 0));
        if (d < 1.6) col.multiplyScalar(0.8);
        gc.push(col.r, col.g, col.b);
      }
      if (i < gRows) {
        for (let j = 0; j < ds.length - 1; j++) {
          const a = i * ds.length + j;
          const b = a + ds.length;
          if (side === 0) gi.push(a, a + 1, b, b, a + 1, b + 1);
          else gi.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    geo.setIndex(gi);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    group.add(mesh);
  }

  // sea for cliff levels
  if (level.sides.includes('cliff')) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.n; i += 10) {
      minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
      minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]);
    }
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + 3000, maxZ - minZ + 3000), new THREE.MeshLambertMaterial({ color: 0x2f6fa8 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set((minX + maxX) / 2, -26, (minZ + maxZ) / 2);
    group.add(sea);
  }

  // ---- scenery --------------------------------------------------------------------------
  const put = (kind: Kind, s: number, lat: number, sx: number, sy: number, sz: number, color: number, lift = 0, rotOff = 0) => {
    track.world(s, lat, v);
    v.y = track.surfaceY(s, lat) + lift + sy / 2;
    scatter.add(kind, s, v, -track.yawAt(s) + rotOff, sx, sy, sz, color);
  };
  const solid = (s: number, lat: number, rad: number) => track.solids.push({ s, lat, r: rad });
  const bldgGeos: THREE.BufferGeometry[] = [];
  const addBuilding = (s: number, lat: number, along: number, depth: number, h: number, color: number) => {
    track.world(s, lat, v);
    const g = new THREE.BoxGeometry(depth, h, along);
    const p = g.attributes.position;
    const nrm = g.attributes.normal;
    const uv = g.attributes.uv;
    const cs: number[] = [];
    const c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const hy = p.getY(i) + h / 2;
      if (ny > 0.5) uv.setXY(i, 0.45, 0.45);
      else if (nx > 0.5) uv.setXY(i, (p.getZ(i) + along / 2) / 6, hy / 6);
      else uv.setXY(i, (p.getX(i) + depth / 2) / 6, hy / 6);
      cs.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(v.x, track.surfaceY(s, lat) + h / 2 - 0.3, v.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -track.yawAt(s), 0)),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    bldgGeos.push(g);
  };

  const L = track.total;
  const poleColor = 0x4a3a2a;
  const pole = (s: number, lat: number, h = 8) => {
    put('cyl', s, lat, 0.16, h, 0.16, poleColor);
    put('box', s, lat, 1.6, 0.14, 0.14, poleColor, h - 1.2, 0);
    solid(s, lat, 0.35);
  };
  const recipe = level.recipe;

  if (recipe === 'city') {
    for (const sg of [-1, 1]) {
      let s = 10 + r() * 20;
      while (s < L) {
        const along = 10 + r() * 14;
        const depth = 10 + r() * 14;
        const h = 14 + r() * r() * 70;
        addBuilding(s + along / 2, sg * (11 + depth / 2), along, depth, h, new THREE.Color().setHSL(0.08 + r() * 0.12, 0.08 + r() * 0.1, 0.55 + r() * 0.3).getHex());
        s += along + 1 + r() * 5;
      }
      // lamp posts
      for (let q = 30; q < L; q += 42) {
        put('cyl', q, sg * 7.7, 0.12, 8, 0.12, 0x555a60);
        put('box', q, sg * 6.9, 1.6, 0.18, 0.4, 0xddddd0, 7.6);
        solid(q, sg * 7.7, 0.3);
      }
    }
  } else if (recipe === 'suburb') {
    for (const sg of [-1, 1]) {
      for (let s = 20 + r() * 20; s < L; s += 30 + r() * 28) {
        const w = 8 + r() * 4;
        const d = 7 + r() * 3;
        const lat = sg * (16 + r() * 14);
        const wall = new THREE.Color().setHSL(r(), 0.25, 0.75).getHex();
        const hh = 3.5 + r() * 1.5;
        put('box', s, lat, d, hh, w, wall);
        put('pyr', s, lat, d + 1.2, 2.4, w + 1.2, [0x7a3a2a, 0x5a5a60, 0x8a5a3a][Math.floor(r() * 3)], hh);
      }
      for (let s = 8 + r() * 8; s < L; s += 9 + r() * 16) {
        const lat = sg * (9.5 + r() * r() * 24);
        const h = 2.4 + r() * 1.5;
        put('cyl', s, lat, 0.28, h, 0.28, 0x5a4028);
        const cr = 2 + r() * 1.5;
        put('sph', s, lat, cr, cr * 1.15, cr, tint(0x3f7f2a, r, 0.18), h - 0.6);
        if (Math.abs(lat) < 13) solid(s, lat, 0.55);
      }
    }
    for (let s = 40; s < L; s += 62) pole(s, 7.7 * (r() < 0.5 ? -1 : 1));
  } else if (recipe === 'coast') {
    const hillSide = level.sides[0] === 'cliff' ? 1 : -1;
    for (let s = 14; s < L; s += 9 + r() * 14) {
      const lat = hillSide * (8.6 + r() * 8);
      const h = 7 + r() * 4;
      const lean = (r() - 0.5) * 0.5;
      put('cyl', s, lat, 0.22, h, 0.22, 0x7a5a3a);
      for (let k = 0; k < 3; k++) put('sph', s, lat + lean + (r() - 0.5) * 1.6, 2.6, 0.45, 2.6, tint(0x3a8a2a, r, 0.18), h - 0.3 + k * 0.1, k);
      if (Math.abs(lat) < 11.5) solid(s, lat, 0.5);
    }
    for (let s = 6; s < L; s += 4 + r() * 6) put('sph', s, hillSide * (12 + r() * 40), 1.5 + r(), 0.9, 1.5 + r(), tint(0x8a8a46, r, 0.2), 0);
    for (let s = 30; s < L; s += 50 + r() * 60) {
      const lat = hillSide * (7.6 + r() * 2);
      put('sph', s, lat, 0.9, 0.8, 0.9, tint(0x8a7a6a, r, 0.15));
      solid(s, lat, 0.8);
    }
    for (let s = 40; s < L; s += 70) pole(s, hillSide * 7.7);
    const rail = -hillSide;
    for (let s = 4; s < L; s += 12) {
      put('box', s + 6, rail * (ROAD_HALF + 1.2), 0.12, 0.18, 12, 0xcfd2d6, 0.6, 0);
      put('cyl', s, rail * (ROAD_HALF + 1.2), 0.07, 0.8, 0.07, 0x888a90);
    }
  } else if (recipe === 'sierra') {
    for (const sg of [-1, 1]) {
      for (let s = 6 + r() * 4; s < L; s += 5 + r() * 5) {
        const lat = sg * (8.5 + r() * r() * 38);
        const h = 7 + r() * 8;
        const rad = 1.7 + r() * 1.5;
        put('cyl', s, lat, 0.3, 1.6, 0.3, 0x4a3524);
        put('cone', s, lat, rad, h, rad, tint(0x2f5a34, r, 0.2), 1.2);
        if (r() < 0.35) put('cone', s, lat, rad * 0.5, h * 0.35, rad * 0.5, 0xf0f4f6, 1.2 + h * 0.67);
        if (Math.abs(lat) < 12.5) solid(s, lat, 0.55);
      }
      for (let s = 20; s < L; s += 35 + r() * 40) {
        const lat = sg * (7.6 + r() * 4);
        const rad = 0.8 + r() * 1.2;
        put('sph', s, lat, rad * 1.3, rad, rad, 0x7a7a7e);
        solid(s, lat, rad);
      }
    }
    for (let s = 50; s < L; s += 90) put('box', s, (r() < 0.5 ? -1 : 1) * 7.2, 1.3, 1.0, 0.1, 0xe6c020, 1.6);
  } else {
    // napa
    for (const sg of [-1, 1]) {
      for (let s = 10; s < L; s += 28) {
        const rows = 3 + Math.floor(r() * 3);
        for (let k = 0; k < rows; k++) put('box', s + 14, sg * (13 + k * 3.2), 0.9, 1.1, 27, tint(0x4f7f2a, r, 0.12));
      }
      for (let s = 20; s < L; s += 18 + r() * 20) {
        const lat = sg * (9.5 + r() * 25);
        put('cyl', s, lat, 0.35, 3, 0.35, 0x4a3524);
        put('sph', s, lat, 3.4, 2.6, 3.4, tint(0x4a7a2a, r, 0.2), 2.4);
        if (Math.abs(lat) < 13) solid(s, lat, 0.65);
      }
      for (let s = 60 + r() * 60; s < L; s += 160 + r() * 140) {
        const lat = sg * (22 + r() * 10);
        put('box', s, lat, 9, 5, 12, 0xd8c8a0);
        put('pyr', s, lat, 11, 3, 14, 0xb85a2a, 5);
      }
      for (let s = 12; s < L; s += 3) {
        if (Math.floor(s / 220) % 2 !== (sg > 0 ? 0 : 1)) continue;
        put('box', s, sg * 7.8, 0.7, 0.7, 3.2, 0x9a9588);
        solid(s, sg * 7.8, 0.55);
      }
    }
    for (let s = 45; s < L; s += 75) pole(s, 7.7 * (r() < 0.5 ? -1 : 1));
  }

  // far backdrop: mountains (or skyline in the city)
  for (const sg of [-1, 1]) {
    for (let s = 0; s < L; s += 120 + r() * 80) {
      const lat = sg * (200 + r() * 200);
      if (recipe === 'city') {
        const h = 60 + r() * 150;
        put('box', s, lat * 0.55, 30 + r() * 30, h, 30 + r() * 30, tint(th.far, r, 0.1), -4);
      } else {
        const h = 60 + r() * 130;
        const rad = h * (0.8 + r() * 0.3);
        put('cone', s, sg * (170 + rad + r() * 120), rad, h, rad, tint(th.far, r, 0.12), -30);
      }
    }
  }

  if (bldgGeos.length) {
    // merge per 450 m chunk so frustum culling still works
    const byChunk = new Map<number, THREE.BufferGeometry[]>();
    for (const g of bldgGeos) {
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      // find closest sample for chunking: use distance along z roughly via search
      let best = 0, bd = Infinity;
      for (let i = 0; i < track.n; i += 8) {
        const d = (track.px[i] - c.x) ** 2 + (track.pz[i] - c.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      const key = Math.floor((best * 2) / CHUNK);
      if (!byChunk.has(key)) byChunk.set(key, []);
      byChunk.get(key)!.push(g);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture() });
    for (const list of byChunk.values()) {
      const merged = mergeGeometries(list, false);
      if (merged) {
        merged.computeBoundingSphere();
        group.add(new THREE.Mesh(merged, mat));
      }
    }
  }
  scatter.build(group);

  track.solids.sort((a, b) => a.s - b.s);

  // ---- start & finish ------------------------------------------------------------------
  const arch = (s: number, text: string) => {
    track.sample(s, sm);
    const g = new THREE.Group();
    const poleM = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (const sg of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), poleM);
      p.position.set(sg * (ROAD_HALF + 0.8), 4, 0);
      g.add(p);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF + 0.8) * 2, 2, 0.3), new THREE.MeshBasicMaterial({ map: bannerTexture(text) }));
    banner.position.set(0, 8, 0);
    g.add(banner);
    g.position.set(sm.x, sm.y, sm.z);
    g.rotation.y = -sm.yaw;
    group.add(g);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.2), new THREE.MeshBasicMaterial({ map: bannerTexture('', '#000', '#fff') }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.06, 0);
    g.add(stripe);
  };
  arch(level.length, 'FINISH');
  arch(0, 'START');

  return { group, sky, sun };
}
