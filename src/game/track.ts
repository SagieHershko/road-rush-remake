import * as THREE from 'three';
import { ROAD_HALF, type LevelSpec, type SideProfile } from './config';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Sample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  curv: number;
  slope: number;
}

export interface Solid {
  s: number;
  lat: number;
  r: number;
}

export class Track {
  readonly step = 2;
  readonly total: number;
  readonly n: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly yaw: Float32Array;
  readonly curv: Float32Array;
  solids: Solid[] = [];
  /** side walls: lat limit where a guard rail stops you (or Infinity) */
  wall: [number, number] = [Infinity, Infinity];

  constructor(readonly level: LevelSpec, seed: number) {
    const r = rng(seed);
    this.total = level.length + 500;
    this.n = Math.ceil(this.total / this.step) + 2;
    const n = this.n;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.curv = new Float32Array(n);

    // curvature: eased random segments of straights and bends
    let k = 0;
    let target = 0;
    let segLeft = 0;
    let dir = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      if (segLeft <= 0) {
        if (s < 260 || r() < 0.3) {
          target = 0;
          segLeft = s < 260 ? 260 - s : 60 + r() * 180;
        } else {
          dir = r() < 0.75 ? -dir : dir;
          target = dir * (0.3 + r() * 0.7) * level.maxCurv;
          segLeft = 130 + r() * 260;
        }
      }
      segLeft -= this.step;
      k += (target - k) * 0.07;
      this.curv[i] = k;
    }
    // elevation: a few sines, faded in after the start grid
    const waves = [
      { a: 0.55, l: 330, p: r() * 6 },
      { a: 0.35, l: 190, p: r() * 6 },
      { a: 0.25, l: 125, p: r() * 6 },
    ];
    let x = 0;
    let z = 0;
    let yw = 0;
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      this.px[i] = x;
      this.pz[i] = z;
      this.yaw[i] = yw;
      let y = 0;
      for (const w of waves) y += w.a * Math.sin((s / w.l) * Math.PI * 2 + w.p);
      this.py[i] = y * level.hillAmp * smooth(0, 320, s);
      const mid = yw + this.curv[i] * this.step * 0.5;
      x += Math.sin(mid) * this.step;
      z -= Math.cos(mid) * this.step;
      yw += this.curv[i] * this.step;
    }
    if (level.sides[1] === 'cliff') this.wall[1] = ROAD_HALF + 1.2;
    if (level.sides[0] === 'cliff') this.wall[0] = ROAD_HALF + 1.2;
  }

  get length(): number {
    return this.level.length;
  }

  sample(s: number, out: Sample): Sample {
    const f = Math.min(Math.max(s, 0), (this.n - 2) * this.step) / this.step;
    const i = Math.floor(f);
    const t = f - i;
    out.x = this.px[i] + (this.px[i + 1] - this.px[i]) * t;
    out.y = this.py[i] + (this.py[i + 1] - this.py[i]) * t;
    out.z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t;
    out.yaw = this.yaw[i] + (this.yaw[i + 1] - this.yaw[i]) * t;
    out.curv = this.curv[i] + (this.curv[i + 1] - this.curv[i]) * t;
    out.slope = (this.py[i + 1] - this.py[i]) / this.step;
    return out;
  }

  private _s: Sample = { x: 0, y: 0, z: 0, yaw: 0, curv: 0, slope: 0 };

  heightAt(s: number): number {
    return this.sample(s, this._s).y;
  }

  /** World position at distance s, lateral offset lat (right positive). */
  world(s: number, lat: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.sample(s, this._s);
    return out.set(p.x + Math.cos(p.yaw) * lat, p.y, p.z + Math.sin(p.yaw) * lat);
  }

  yawAt(s: number): number {
    return this.sample(s, this._s).yaw;
  }

  /** Terrain height relative to the road, d metres beyond the road edge on the given side. */
  terrain(side: 0 | 1, s: number, d: number): number {
    const prof: SideProfile = this.level.sides[side];
    if (prof === 'flat') return 0;
    if (prof === 'cliff') return -Math.max(0, d - 1.5) * 0.45;
    const phase = side * 2.3;
    const h = 0.55 + 0.45 * Math.sin(s * 0.0093 + phase) + 0.3 * Math.sin(s * 0.021 + phase * 1.7);
    return Math.max(0, h) * smooth(0, 70, d) * (6 + this.level.hillAmp * 2.2) * (d / 70) + Math.sin(s * 0.05 + d * 0.11) * 0.35 * smooth(2, 12, d);
  }

  /** Surface height (world) at distance s and lateral lat. */
  surfaceY(s: number, lat: number): number {
    const y = this.heightAt(s);
    const d = Math.abs(lat) - ROAD_HALF;
    if (d <= 0) return y;
    return y + this.terrain(lat < 0 ? 0 : 1, s, d);
  }

  /** Solids in [s0, s1], sorted by s. */
  solidsIn(s0: number, s1: number): Solid[] {
    const arr = this.solids;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].s < s0) lo = mid + 1;
      else hi = mid;
    }
    const out: Solid[] = [];
    for (let i = lo; i < arr.length && arr[i].s <= s1; i++) out.push(arr[i]);
    return out;
  }
}
