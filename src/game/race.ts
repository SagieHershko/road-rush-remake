import * as THREE from 'three';
import {
  BIKES, CHARACTERS, FIELD_SIZE, GRAVITY, LANES, ROAD_HALF, SUIT_COLORS, WEAPONS, WEAPON_IDS, PAINTS,
  bikeById, type BikeSpec, type LevelSpec, type ModelId, type RiderStyle, type WeaponId,
} from './config';
import type { Controls } from './input';
import { makeBike, makeCar, makeCow, type BikeRig, type CarKind } from './models';
import { sfx } from './audio';
import { Track, rng } from './track';
import { buildWorld, type World } from './world';
import type { SaveData } from './save';

const CURVE_PUSH = 0.4;
const ALIGN = 1.6;
const NAMES = ['Rhonda', 'Biff', 'Slade', 'Viper', 'Duke', 'Kat', 'Jinx', 'Mack', 'Roxy', 'Hawk', 'Nitro', 'Spike'];

export type RacerKind = 'player' | 'ai' | 'cop';
export type RacePhase = 'countdown' | 'racing' | 'finished' | 'busted' | 'wrecked';

interface Weapon {
  id: WeaponId;
  uses: number;
}

interface Ragdoll {
  ds: number; dl: number; h: number; vs: number; vl: number; vh: number; sx: number; sz: number;
}

export class Racer {
  s = 0; lat = 0; v = 0; rel = 0; steer = 0; lean = 0; pitch = 0;
  y = 0; vy = 0; air = false;
  stamina = 100;
  staminaMax = 100;
  damage = 0;
  weapon: Weapon | null = null;
  state: 'ride' | 'crashed' = 'ride';
  crashT = 0;
  inv = 0;
  rag: Ragdoll = { ds: 0, dl: 0, h: 0, vs: 0, vl: 0, vh: 0, sx: 0, sz: 0 };
  attackSide = 0;
  attackT = 0;
  attackCd = 0;
  attackDone = false;
  nitro = 100;
  boost = false;
  thr = 0;
  brk = 0;
  finished = false;
  finishTime = 0;
  wheelAngle = 0;
  // ai
  targetLat = 0;
  laneTimer = 0;
  skill = 1;
  aggr = 0.5;
  vmaxAI = 50;
  lastHitBy: Racer | null = null;
  /** time spent crashed with a cop standing over the rider */
  copTime = 0;

  constructor(
    readonly id: number,
    readonly kind: RacerKind,
    readonly name: string,
    readonly spec: BikeSpec,
    readonly rig: BikeRig,
  ) {
    this.staminaMax = kind === 'cop' ? 70 : 100;
    this.stamina = this.staminaMax;
  }
}

interface Car {
  s: number; lat: number; v: number; group: THREE.Group; w: number; l: number; alive: boolean; kind: CarKind;
}
interface Cow {
  s: number; lat: number; group: THREE.Group;
}

export interface RaceMessage {
  text: string;
  tone: 'good' | 'bad' | 'info';
}

export interface RaceResult {
  outcome: 'finish' | 'busted' | 'wrecked';
  rank: number;
  time: number;
  bonus: number;
  standings: { name: string; kind: RacerKind; time: number | null }[];
}

export interface RaceHooks {
  message(m: RaceMessage): void;
  end(r: RaceResult): void;
}

function randomStyle(r: () => number): RiderStyle {
  return {
    suit: SUIT_COLORS[Math.floor(r() * SUIT_COLORS.length)],
    helmet: SUIT_COLORS[Math.floor(r() * SUIT_COLORS.length)],
    accent: SUIT_COLORS[Math.floor(r() * SUIT_COLORS.length)],
  };
}

export class Race {
  readonly root = new THREE.Group();
  readonly track: Track;
  readonly world: World;
  readonly racers: Racer[] = [];
  readonly player: Racer;
  readonly cars: Car[] = [];
  readonly cows: Cow[] = [];
  readonly cops: Racer[] = [];
  phase: RacePhase = 'countdown';
  time = 0; // racing time
  countdown = 3.6;
  bonus = 0;
  sirenLevel = 0;
  private lastCount = 4;
  private endTimer = 0;
  private copCooldown = 28;
  private r: () => number;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private sampleTmp = { x: 0, y: 0, z: 0, yaw: 0, curv: 0, slope: 0 };
  private nextId = 1;
  result: RaceResult | null = null;
  readonly cameraPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  fov = 62;
  shake = 0;
  /** dev/testing: let the AI drive the player's bike */
  autopilot = false;
  crashLog: string[] = [];
  private warned = false;

  constructor(scene: THREE.Scene, readonly level: LevelSpec, save: SaveData, private hooks: RaceHooks) {
    const seed = 1000 + level.id * 77;
    this.r = rng(seed + Date.now() % 1000);
    this.track = new Track(level, seed);
    this.world = buildWorld(this.track, seed);
    this.root.add(this.world.group);
    scene.add(this.root);
    scene.background = new THREE.Color(level.theme.skyHorizon);
    scene.fog = new THREE.Fog(level.theme.fog, level.theme.fogNear, level.theme.fogFar);

    const r = this.r;
    const spec = bikeById(save.bike);
    const paint = save.paints[spec.id] ?? PAINTS[0].color;
    const grid = this.gridSlots();
    const playerSlot = 5 + Math.floor(r() * 3);
    const order = [...Array(FIELD_SIZE).keys()];
    // AI skills spread over the field
    let aiIndex = 0;
    for (const slot of order) {
      const g = grid[slot];
      let racer: Racer;
      if (slot === playerSlot) {
        const rig = makeBike(spec.model, paint, save.rider);
        racer = new Racer(this.nextId++, 'player', save.name || 'Player_1', spec, rig);
        racer.vmaxAI = spec.vmax;
      } else {
        const model: ModelId = r() < 0.5 ? 'ninja' : 'srad';
        const rig = makeBike(model, PAINTS[Math.floor(r() * PAINTS.length)].color, randomStyle(r));
        const skill = (aiIndex++ % (FIELD_SIZE - 1)) / (FIELD_SIZE - 2);
        const aiSpec = BIKES.find((b) => b.model === model) ?? BIKES[0];
        racer = new Racer(this.nextId++, 'ai', NAMES[(slot + level.id) % NAMES.length], aiSpec, rig);
        racer.skill = skill;
        racer.vmaxAI = level.aiMin + (level.aiMax - level.aiMin) * (0.15 + 0.85 * (1 - skill) * (0.7 + r() * 0.3));
        racer.aggr = 0.25 + r() * 0.5 + level.id * 0.04;
        if (r() < 0.25 + level.id * 0.07) racer.weapon = this.randomWeapon();
        racer.rig.rider.setWeapon(racer.weapon?.id ?? null);
      }
      racer.s = g.s;
      racer.y = this.track.heightAt(g.s);
      racer.lat = g.lat;
      racer.targetLat = g.lat;
      this.racers.push(racer);
      this.root.add(racer.rig.root);
    }
    this.player = this.racers.find((x) => x.kind === 'player')!;
    this.initTraffic();
    for (const x of this.racers) this.syncRig(x, 0);
  }

  private randomWeapon(): Weapon {
    const id = WEAPON_IDS[Math.floor(this.r() * WEAPON_IDS.length)];
    return { id, uses: WEAPONS[id].uses };
  }

  private gridSlots(): { s: number; lat: number }[] {
    const out: { s: number; lat: number }[] = [];
    for (let row = 0; row < FIELD_SIZE / 2; row++) {
      for (const lat of [-1.9, 1.9]) out.push({ s: 34 - row * 6.5 + (lat > 0 ? -2 : 0), lat });
    }
    return out;
  }

  private initTraffic(): void {
    const r = this.r;
    const km = this.level.length / 1000;
    const count = Math.round(this.level.traffic * km);
    for (let i = 0; i < count; i++) {
      const kinds: CarKind[] = ['sedan', 'wagon', 'wagon', 'truck'];
      const kind = kinds[Math.floor(r() * kinds.length)];
      const group = makeCar(kind, r());
      const size = group.userData.size as { w: number; l: number };
      const car: Car = { s: 0, lat: 0, v: 12 + r() * 12, group, w: size.w, l: size.l, alive: true, kind };
      this.placeCar(car, 90 + r() * (this.level.length - 120));
      this.cars.push(car);
      this.root.add(group);
    }
    const hz = Math.round(this.level.hazards * km);
    for (let i = 0; i < hz; i++) {
      const g = makeCow();
      const cow: Cow = { s: 200 + r() * (this.level.length - 300), lat: (r() - 0.5) * 8, group: g };
      g.userData.rot = r() * Math.PI;
      this.cows.push(cow);
      this.root.add(g);
    }
  }

  private placeCar(car: Car, s: number): void {
    const r = this.r;
    for (let tries = 0; tries < 8; tries++) {
      car.lat = LANES[Math.floor(r() * 3)];
      car.s = s;
      if (!this.cars.some((c) => c !== car && c.alive && Math.abs(c.lat - car.lat) < 1 && Math.abs(c.s - s) < 30)) break;
      s += 14;
    }
    car.v = 12 + r() * 12;
  }

  // ---- main update -----------------------------------------------------------------------
  update(dt: number, controls: Controls): void {
    dt = Math.min(dt, 0.05);
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.lastCount && c <= 3 && c >= 1) sfx.beep();
      this.lastCount = c;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        sfx.go();
      }
    } else if (this.phase === 'racing') {
      this.time += dt;
    } else {
      this.endTimer += dt;
      if (this.endTimer > 2.4 && !this.result) this.finishRace();
    }
    const live = this.phase === 'racing' || this.phase === 'finished';

    for (const x of this.racers) {
      this.control(x, dt, controls, live);
      this.step(x, dt);
    }
    for (const c of this.cops) {
      this.control(c, dt, controls, live);
      this.step(c, dt);
    }
    this.collide(dt);
    this.combat(dt);
    this.updateTraffic(dt);
    this.updateCops(dt);
    this.checkFinish();

    const all = [...this.racers, ...this.cops];
    for (const x of all) this.syncRig(x, dt);
    this.updateCamera(dt);
  }

  // ---- control ---------------------------------------------------------------------------
  private input = { steer: 0, throttle: 0, brake: 0, nitro: false };

  private control(x: Racer, dt: number, c: Controls, live: boolean): void {
    const inp = this.input;
    inp.steer = 0; inp.throttle = 0; inp.brake = 0; inp.nitro = false;
    x.attackCd -= dt;
    x.inv -= dt;
    x.thr = 0;
    x.brk = 0;
    if (x.state === 'crashed') return;
    if (!live) {
      // revving on the grid
      return;
    }
    if (x.kind === 'player' && this.phase === 'racing' && !this.autopilot) {
      inp.steer = c.steer;
      inp.throttle = c.throttle;
      inp.brake = c.brake;
      inp.nitro = c.nitro;
      if (x.attackT === 0 && x.attackCd <= 0) {
        if (c.punchL) this.startAttack(x, -1);
        else if (c.punchR) this.startAttack(x, 1);
      }
    } else if (x.kind === 'player' && !this.autopilot) {
      // finished: roll on straight
      inp.throttle = 0.6;
      inp.steer = Math.max(-1, Math.min(1, -x.lat * 0.2 - x.rel * 2));
    } else {
      this.ai(x, dt);
    }
    this.applyInput(x, dt);
  }

  private pendingAI = { steer: 0, throttle: 1, brake: 0, nitro: false };

  private applyInput(x: Racer, dt: number): void {
    const inp = this.input;
    const ai = x.kind !== 'player' || this.autopilot ? this.pendingAI : null;
    if (ai) {
      inp.steer = ai.steer;
      inp.throttle = ai.throttle;
      inp.brake = ai.brake;
      inp.nitro = ai.nitro;
    }
    // smooth steering so key taps feel like leaning
    x.steer += (inp.steer - x.steer) * Math.min(1, dt * 7);
    x.boost = inp.nitro && x.nitro > 0 && x.state === 'ride';
    if (x.boost) {
      x.nitro = Math.max(0, x.nitro - 26 * dt);
    } else if (x.kind === 'player') {
      x.nitro = Math.min(100, x.nitro + 2.2 * dt);
    }
    x.thr = inp.throttle;
    x.brk = inp.brake;
  }

  private ai(x: Racer, dt: number): void {
    const out = this.pendingAI;
    const tr = this.track;
    const p = this.player;
    const isCop = x.kind === 'cop';
    let vTarget = x.vmaxAI;

    if (isCop) {
      const ds = p.s - x.s;
      vTarget = p.v + Math.max(-14, Math.min(22, ds * 0.7));
      vTarget = Math.min(vTarget, x.vmaxAI);
      if (p.state === 'crashed') vTarget = Math.max(vTarget, 25);
      x.targetLat = Math.abs(ds) < 22 ? p.lat + (x.lat > p.lat ? 1.7 : -1.7) : p.lat;
    } else {
      // rubber band to keep the pack together
      const gap = p.s - x.s;
      if (gap > 60) vTarget *= 1 + Math.min(0.07, (gap - 60) / 1800);
      else if (gap < -140 && !p.finished) vTarget *= 1 - Math.min(0.1, (-gap - 140) / 1500);
      x.laneTimer -= dt;
      if (x.laneTimer <= 0) {
        x.laneTimer = 0.4 + this.r() * 0.3;
        x.targetLat = this.pickLane(x);
        // sometimes drift towards the player to start a scrap
        const dsP = p.s - x.s;
        if (x !== p && Math.abs(dsP) < 26 && x.aggr > this.r() * 1.4 && p.state === 'ride') x.targetLat = p.lat + (x.lat > p.lat ? 1.5 : -1.5);
      }
    }
    x.targetLat = Math.max(-5, Math.min(5, x.targetLat));
    // slow for traffic dead ahead (look further the faster we go)
    const ahead = this.nearestAhead(x, 24 + x.v * 1.5, 1.7);
    if (ahead) vTarget = Math.min(vTarget, ahead.v - (ahead.s - x.s < 22 ? 5 : 1));
    // corners
    const k = Math.abs(tr.sample(x.s + 40, this.sampleTmp).curv);
    vTarget = Math.min(vTarget, x.vmaxAI * (1 - Math.min(0.28, k * 28)));

    out.throttle = x.v < vTarget ? 1 : 0;
    out.brake = x.v > vTarget + 3 ? 1 : 0;
    out.nitro = isCop ? false : p.s - x.s > 220 && x.nitro > 0;
    if (!isCop && x.nitro < 100) x.nitro = Math.min(100, x.nitro + 3 * dt);

    const gain = x.spec.handling / (1 + x.v / 38);
    const desired = Math.max(-0.3, Math.min(0.3, (x.targetLat - x.lat) * 0.1));
    const cur = tr.sample(x.s, this.sampleTmp).curv;
    out.steer = Math.max(-1, Math.min(1, (4 * (desired - x.rel) + cur * x.v * CURVE_PUSH + ALIGN * x.rel) / gain));

    // swing when somebody is alongside
    if (x.attackT === 0 && x.attackCd <= 0 && x.state === 'ride') {
      const targets = isCop ? [p] : [p, ...this.racers.filter((o) => o !== x && o !== p)];
      for (const t of targets) {
        if (t.state !== 'ride') continue;
        const side = this.sideOf(x, t);
        if (!side) continue;
        const wants = t === p ? 1.1 : 0.12;
        if (this.r() < x.aggr * wants * dt * 2.4 * (isCop ? 3 : 1)) {
          this.startAttack(x, side);
          break;
        }
      }
    }
  }

  private pickLane(x: Racer): number {
    let best = Math.round(x.lat / 3.4) * 3.4;
    best = Math.max(-3.4, Math.min(3.4, best));
    const blocked = (lat: number) => this.laneBlocked(x, lat);
    if (!blocked(best)) return best;
    const options = LANES.filter((l) => !blocked(l)).sort((a, b) => Math.abs(a - x.lat) - Math.abs(b - x.lat));
    return options.length ? options[0] : best;
  }

  private laneBlocked(x: Racer, lat: number): boolean {
    const look = 16 + x.v * 1.3;
    for (const c of this.cars) {
      if (c.alive && Math.abs(c.lat - lat) < 1.8 && c.s > x.s - 4 && c.s < x.s + look && c.v < x.v + 3) return true;
    }
    for (const c of this.cows) {
      if (Math.abs(c.lat - lat) < 1.9 && c.s > x.s - 4 && c.s < x.s + look) return true;
    }
    return false;
  }

  private nearestAhead(x: Racer, range: number, halfW: number): Car | null {
    let best: Car | null = null;
    for (const c of this.cars) {
      if (!c.alive) continue;
      const ds = c.s - x.s;
      if (ds > 0 && ds < range && Math.abs(c.lat - x.lat) < halfW + c.w / 2 && (!best || c.s < best.s)) best = c;
    }
    return best;
  }

  // ---- physics ---------------------------------------------------------------------------
  private step(x: Racer, dt: number): void {
    const tr = this.track;
    const smp = tr.sample(x.s, this.sampleTmp);
    const slope = smp.slope;
    const thr = x.thr;
    const brk = x.brk;
    const spec = x.spec;

    if (x.state === 'crashed') {
      x.v = Math.max(0, x.v - 24 * dt);
      x.s += x.v * dt;
      x.crashT += dt;
      this.stepRagdoll(x, dt);
      if (x.crashT > (x.kind === 'player' ? 2.6 : 2.1)) this.recover(x);
      this.verticals(x, dt, smp.y);
      return;
    }

    const off = Math.abs(x.lat) > ROAD_HALF - 0.3;
    const wear = 1 - 0.18 * Math.min(1, x.damage / spec.durability);
    let vmax = (x.kind === 'ai' || x.kind === 'cop' ? x.vmaxAI : spec.vmax) * wear * (x.boost ? 1.2 : 1) * (off ? 0.55 : 1);
    if (x.kind === 'ai' && this.phase === 'countdown') vmax = 0;
    let a: number;
    if (this.phase === 'countdown' && x.kind !== 'cop') {
      a = -x.v * 4;
    } else if (x.air) {
      a = -0.4;
    } else {
      if (thr > 0) {
        a = spec.accel * (x.boost ? 1.9 : 1) * Math.max(0, 1 - (x.v / vmax) ** 2);
        if (x.v > vmax) a = -(x.v - vmax) * 1.4;
      } else {
        a = -2.8 - x.v * 0.02;
      }
      if (brk) a -= 38;
      a -= slope * 9.8 * 0.85;
      if (off) a -= 6;
    }
    x.v = Math.max(0, x.v + a * dt);

    if (!x.air) {
      const gain = spec.handling / (1 + x.v / 38);
      x.rel += (x.steer * gain - smp.curv * x.v * CURVE_PUSH - x.rel * ALIGN) * dt;
      x.rel = Math.max(-0.7, Math.min(0.7, x.rel));
    }
    x.s += x.v * Math.cos(x.rel) * dt;
    x.lat += x.v * Math.sin(x.rel) * dt;

    // walls (guard rails on the cliff side)
    if (x.lat > tr.wall[1]) this.scrape(x, tr.wall[1], -1);
    if (x.lat < -tr.wall[0]) this.scrape(x, -tr.wall[0], 1);

    // way off the road: scenery
    const limit = ROAD_HALF + 6.5;
    if (Math.abs(x.lat) > limit) {
      if (x.v > 13) this.crash(x, 'scenery');
      else {
        x.lat = Math.sign(x.lat) * limit;
        x.v *= 0.9;
      }
    }

    this.verticals(x, dt, tr.heightAt(x.s), slope);
    x.lean += ((x.steer * 0.55 + x.rel * 0.6) - x.lean) * Math.min(1, dt * 6);
  }

  private scrape(x: Racer, wallLat: number, back: number): void {
    x.lat = wallLat;
    if (x.rel * -back < 0) x.rel *= 0.2;
    if (x.v > 10) {
      x.v *= 0.985;
      x.damage += 6 * 0.016;
      this.shake = Math.max(this.shake, 0.3);
    }
  }

  private verticals(x: Racer, dt: number, gy: number, slope = 0): void {
    if (!x.air) {
      const prev = x.y;
      const yBall = prev + x.vy * dt - 0.5 * GRAVITY * dt * dt;
      if (yBall > gy + 0.04 && x.v > 11) {
        x.air = true;
        x.y = yBall;
        x.vy -= GRAVITY * dt;
      } else {
        x.vy = (gy - prev) / Math.max(dt, 1e-3);
        x.y = gy;
      }
    } else {
      x.vy -= GRAVITY * dt;
      x.y += x.vy * dt;
      if (x.y <= gy) {
        const groundV = x.v * slope;
        const impact = Math.max(0, groundV - x.vy);
        x.y = gy;
        x.air = false;
        x.vy = groundV;
        if (x.state === 'ride') {
          if (impact > 17 || (impact > 11 && Math.abs(x.rel) > 0.32)) this.crash(x, 'landing');
          else if (impact > 5) {
            x.v *= 1 - Math.min(0.2, impact * 0.012);
            if (x.kind === 'player') {
              sfx.bump();
              this.shake = Math.max(this.shake, Math.min(0.6, impact * 0.04));
            }
          }
        }
      }
    }
  }

  // ---- crashes ---------------------------------------------------------------------------
  crash(x: Racer, cause: 'traffic' | 'scenery' | 'landing' | 'knockoff' | 'hazard'): void {
    if (x.state === 'crashed' || x.inv > 0) return;
    this.crashLog.push(`${x.kind}${x.id} ${cause} s=${x.s.toFixed(0)} lat=${x.lat.toFixed(1)} v=${x.v.toFixed(0)} rel=${x.rel.toFixed(2)}`);
    x.state = 'crashed';
    x.crashT = 0;
    x.attackT = 0;
    x.attackSide = 0;
    x.damage += cause === 'knockoff' ? 5 : 12;
    const sp = Math.max(8, x.v);
    x.rag = { ds: 0.2, dl: 0, h: 0.9, vs: sp * 0.75, vl: (this.r() - 0.5) * 8, vh: 5 + this.r() * 4, sx: (this.r() - 0.5) * 12, sz: (this.r() - 0.5) * 12 };
    if (x.kind === 'cop') x.rag.vs = sp * 0.6;
    x.weapon = x.kind === 'cop' ? x.weapon : null;
    x.rig.rider.setWeapon(x.weapon?.id ?? null);
    x.rig.root.add(x.rig.rider.group);
    x.rig.rider.group.position.set(0, 0.9, 0);
    sfx.crash();
    if (x === this.player) {
      this.shake = 1;
      this.hooks.message({ text: cause === 'knockoff' ? 'KNOCKED OFF!' : 'WIPEOUT!', tone: 'bad' });
    }
    x.rig.shadow.visible = false;
    if (x === this.player && x.damage >= x.spec.durability * 0.7 && x.damage < x.spec.durability && !this.warned) {
      this.warned = true;
      this.hooks.message({ text: 'BIKE IS SMOKING!', tone: 'info' });
    }
    if (x === this.player && x.damage >= x.spec.durability && this.phase === 'racing') {
      this.phase = 'wrecked';
      this.endTimer = 0;
      this.hooks.message({ text: 'BIKE WRECKED!', tone: 'bad' });
    }
    if (x.kind === 'cop') this.copCooldown = Math.max(this.copCooldown, 22);
  }

  private stepRagdoll(x: Racer, dt: number): void {
    const g = x.rag;
    g.vh -= GRAVITY * dt;
    g.ds += g.vs * dt;
    g.dl += g.vl * dt;
    g.h += g.vh * dt;
    if (g.h < 0.15) {
      g.h = 0.15;
      g.vh = Math.abs(g.vh) * 0.3;
      g.vs *= 0.7;
      g.vl *= 0.7;
      g.sx *= 0.5;
      g.sz *= 0.5;
    }
    const rd = x.rig.rider.group;
    rd.position.set(g.dl, g.h, -g.ds);
    rd.rotation.x += g.sx * dt;
    rd.rotation.z += g.sz * dt;
  }

  private recover(x: Racer): void {
    x.state = 'ride';
    x.v = 0;
    x.rel = 0;
    x.steer = 0;
    x.inv = 2;
    x.air = false;
    x.lat = Math.max(-ROAD_HALF + 1.2, Math.min(ROAD_HALF - 1.2, x.lat));
    x.stamina = Math.max(x.stamina, x.staminaMax * 0.55);
    x.rig.tilt.add(x.rig.rider.group);
    x.rig.rider.group.position.set(0, 0, 0);
    x.rig.rider.group.rotation.set(0, 0, 0);
    x.rig.shadow.visible = true;
    x.lean = 0;
    if (x.kind === 'ai' && this.r() < 0.4) x.weapon = this.randomWeapon();
    x.rig.rider.setWeapon(x.weapon?.id ?? null);
    // nudge off the spot so cars do not immediately re-collide
    for (const c of this.cars) {
      if (c.alive && Math.abs(c.s - x.s) < c.l && Math.abs(c.lat - x.lat) < 2) x.s = c.s - c.l - 3;
    }
  }

  // ---- collisions ------------------------------------------------------------------------
  private collide(_dt: number): void {
    const all = [...this.racers, ...this.cops];
    for (const x of all) {
      if (x.state !== 'ride') continue;
      // cars
      for (const c of this.cars) {
        if (!c.alive) continue;
        const ds = x.s - c.s;
        if (Math.abs(ds) > c.l / 2 + 1.1) continue;
        const dl = x.lat - c.lat;
        if (Math.abs(dl) > c.w / 2 + 0.45) continue;
        if (x.air && x.y > this.track.heightAt(x.s) + 1.3) continue;
        const rel = x.v - c.v;
        const alongside = Math.abs(ds) < c.l / 2 - 0.3;
        if (alongside) {
          // scraping along the body: slide away gradually, crash if we are dead centre inside it
          if (Math.abs(dl) < 0.55 && rel > 6) {
            this.crash(x, 'traffic');
          } else {
            x.lat += Math.sign(dl || 1) * Math.min(0.3, Math.abs(c.w / 2 + 0.45 - Math.abs(dl)));
            x.v *= 0.99;
            x.rel += Math.sign(dl || 1) * 0.03;
            if (rel > 3) x.damage += 0.3;
            if (x === this.player && this.phase === 'racing') {
              sfx.bump();
              this.shake = Math.max(this.shake, 0.25);
            }
          }
        } else if (ds < 0) {
          // bumper contact from behind
          if (rel > 10) this.crash(x, 'traffic');
          else {
            x.s = c.s - c.l / 2 - 1.1;
            x.v = Math.min(x.v, c.v);
            if (x === this.player && rel > 4) sfx.bump();
          }
        } else if (rel < -5) {
          x.v = Math.max(x.v, c.v);
        }
      }
      // cows
      for (const c of this.cows) {
        if (Math.abs(x.s - c.s) < 1.7 && Math.abs(x.lat - c.lat) < 1.2) {
          if (x.v > 9) {
            this.crash(x, 'hazard');
            x.rag.vs += 6;
          } else {
            x.v = 0;
          }
        }
      }
      // solids
      for (const sd of this.track.solidsIn(x.s - 2.5, x.s + 2.5)) {
        const dl = x.lat - sd.lat;
        const ds2 = x.s - sd.s;
        if (ds2 * ds2 + dl * dl < (sd.r + 0.45) ** 2) {
          if (x.v > 9) this.crash(x, 'scenery');
          else {
            x.v = Math.min(x.v, 2);
            x.lat += Math.sign(dl || 1) * 0.3;
          }
        }
      }
    }
    // rider vs rider
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (a.state !== 'ride' || b.state !== 'ride') continue;
        let ds = b.s - a.s;
        if (Math.abs(ds) > 1.9) continue;
        let dl = b.lat - a.lat;
        if (Math.abs(dl) > 0.95) continue;
        if (Math.abs(dl) < 0.01) dl = (a.id % 2 ? 1 : -1) * 0.01;
        const pen = 0.95 - Math.abs(dl);
        const push = Math.sign(dl) * pen * 0.5;
        a.lat -= push;
        b.lat += push;
        a.rel -= Math.sign(dl) * 0.03;
        b.rel += Math.sign(dl) * 0.03;
        if (Math.abs(ds) > 1.1) {
          // rear-ender
          const rear = ds > 0 ? a : b;
          const front = ds > 0 ? b : a;
          if (rear.v - front.v > 14) this.crash(rear, 'traffic');
          else rear.v = Math.min(rear.v, front.v * 1.02);
        }
        ds = 0;
        if ((a === this.player || b === this.player) && this.phase === 'racing') sfx.bump();
      }
    }
  }

  // ---- combat ----------------------------------------------------------------------------
  private startAttack(x: Racer, side: number): void {
    x.attackSide = side;
    x.attackT = 0.0001;
    x.attackDone = false;
    x.attackCd = 0.55;
    sfx.whoosh();
  }

  private sideOf(x: Racer, t: Racer): number {
    const ds = t.s - x.s;
    const dl = t.lat - x.lat;
    if (Math.abs(ds) > 2.1 || Math.abs(dl) < 0.35 || Math.abs(dl) > 2.7) return 0;
    return Math.sign(dl);
  }

  private combat(dt: number): void {
    const all = [...this.racers, ...this.cops];
    for (const x of all) {
      if (x.attackT <= 0) continue;
      x.attackT += dt / 0.42;
      if (x.state === 'crashed') {
        x.attackT = 0;
        continue;
      }
      if (!x.attackDone && x.attackT > 0.33) {
        x.attackDone = true;
        this.resolveHit(x, all);
      }
      if (x.attackT >= 1) {
        x.attackT = 0;
        x.attackSide = 0;
      }
    }
    // stamina regen
    for (const x of all) {
      if (x.state === 'ride' && x.stamina < x.staminaMax) x.stamina = Math.min(x.staminaMax, x.stamina + 1.2 * dt);
    }
  }

  private resolveHit(x: Racer, all: Racer[]): void {
    let target: Racer | null = null;
    let bestD = 99;
    for (const t of all) {
      if (t === x || t.state !== 'ride') continue;
      if (x.kind === 'cop' && t !== this.player) continue;
      if (t.kind === 'cop' && x.kind !== 'player') continue;
      if (this.sideOf(x, t) !== x.attackSide) continue;
      const d = Math.abs(t.s - x.s) + Math.abs(t.lat - x.lat);
      if (d < bestD) {
        bestD = d;
        target = t;
      }
    }
    if (!target) return;
    const w = x.weapon;
    let dmg = w ? WEAPONS[w.id].dmg : 12;
    if (x.kind === 'cop') dmg = 8 + this.level.id * 2.5;
    if (x.kind === 'ai') dmg *= 0.75 + this.level.id * 0.05;
    target.stamina -= dmg;
    target.lastHitBy = x;
    target.v *= 0.94;
    target.lat += x.attackSide * 0.8;
    target.rel += x.attackSide * 0.12;
    sfx.hit();
    if (target === this.player) this.shake = Math.max(this.shake, 0.5);
    if (w) {
      w.uses--;
      if (w.uses <= 0) {
        x.weapon = null;
        x.rig.rider.setWeapon(null);
        if (x === this.player) this.hooks.message({ text: 'Weapon broke', tone: 'info' });
      }
    }
    // grab weapons by hitting riders who carry one
    if (x.kind === 'player' && !x.weapon && target.weapon && this.r() < 0.6) {
      x.weapon = target.weapon;
      target.weapon = null;
      target.rig.rider.setWeapon(null);
      x.rig.rider.setWeapon(x.weapon.id);
      sfx.grab();
      this.hooks.message({ text: `Grabbed a ${WEAPONS[x.weapon.id].name.toLowerCase()}!`, tone: 'good' });
    }
    if (target.stamina <= 0) {
      target.stamina = target.staminaMax * 0.6;
      if (target === this.player && x.kind === 'cop' && this.phase === 'racing') {
        this.bust();
        return;
      }
      this.crash(target, 'knockoff');
      if (x === this.player) {
        const reward = target.kind === 'cop' ? 400 : 120 + this.level.id * 30;
        this.bonus += reward;
        x.stamina = Math.min(x.staminaMax, x.stamina + 25);
        x.nitro = Math.min(100, x.nitro + 20);
        sfx.cash();
        this.hooks.message({ text: `${target.kind === 'cop' ? 'COP DOWN' : 'KNOCKED OFF'} +$${reward}`, tone: 'good' });
      }
    }
  }

  private bust(): void {
    if (this.phase !== 'racing') return;
    this.phase = 'busted';
    this.endTimer = 0;
    sfx.busted();
    this.hooks.message({ text: 'BUSTED!', tone: 'bad' });
  }

  // ---- traffic & cops ---------------------------------------------------------------------
  private updateTraffic(dt: number): void {
    let front = 0;
    let back = Infinity;
    for (const x of this.racers) {
      front = Math.max(front, x.s);
      back = Math.min(back, x.s);
    }
    for (const c of this.cars) {
      if (!c.alive) continue;
      if (this.phase !== 'countdown') c.s += c.v * dt;
      if (c.s < back - 110 || c.s > front + 600) {
        const ns = front + 260 + this.r() * 320;
        if (ns < this.level.length - 40) this.placeCar(c, ns);
        else c.alive = false;
      }
      c.group.visible = c.alive;
      if (c.alive) this.placeObject(c.group, c.s, c.lat);
    }
    for (const c of this.cows) this.placeObject(c.group, c.s, c.lat);
  }

  private placeObject(g: THREE.Object3D, s: number, lat: number): void {
    const tr = this.track;
    tr.world(s, lat, this.tmp);
    g.position.copy(this.tmp);
    const p = tr.sample(s, this.sampleTmp);
    g.rotation.set(Math.atan(p.slope), -p.yaw + ((g.userData.rot as number | undefined) ?? 0), 0, 'YXZ');
  }

  private updateCops(dt: number): void {
    const p = this.player;
    if (this.phase === 'racing') {
      this.copCooldown -= dt;
      if (this.copCooldown <= 0 && this.cops.length < 1 + Math.floor(this.level.id / 3) && this.time > 30 + (5 - this.level.id) * 8 && p.s < this.level.length - 500) {
        this.spawnCop();
        this.copCooldown = 30;
      }
    }
    this.sirenLevel = 0;
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      const d = Math.abs(c.s - p.s);
      this.sirenLevel = Math.max(this.sirenLevel, Math.max(0, 1 - d / 160));
      const lb = c.rig.lightBar;
      if (lb) {
        const on = Math.floor(this.time * 8) % 2 === 0;
        lb.red.color.setHex(on ? 0xff2222 : 0x330000);
        lb.blue.color.setHex(on ? 0x000833 : 0x2266ff);
      }
      // caught while down?
      if (p.state === 'crashed' && d < 7 && c.state === 'ride') {
        p.copTime += dt;
        if (p.copTime > 1.3 && this.phase === 'racing') this.bust();
      }
      if (c.s < p.s - 420 || this.phase !== 'racing' && this.phase !== 'countdown' && d > 150) {
        this.root.remove(c.rig.root);
        this.cops.splice(i, 1);
      }
    }
    if (p.state === 'ride') p.copTime = 0;
  }

  private spawnCop(): void {
    const p = this.player;
    const spec = bikeById('ninjapro');
    const style: RiderStyle = { suit: 0x1a2a4a, helmet: 0xf2f2f2, accent: 0x0a0a12 };
    const rig = makeBike('ninja', 0x0c0c10, style, { police: true });
    const cop = new Racer(this.nextId++, 'cop', 'Cop', spec, rig);
    cop.vmaxAI = Math.max(p.spec.vmax * 1.07, this.level.aiMin + 4);
    cop.aggr = 1;
    cop.s = Math.max(5, p.s - 130);
    cop.lat = 0;
    cop.v = p.v + 6;
    cop.y = this.track.heightAt(cop.s);
    cop.weapon = null;
    this.cops.push(cop);
    this.root.add(rig.root);
    this.hooks.message({ text: 'POLICE BEHIND YOU!', tone: 'bad' });
    sfx.busted();
  }

  // ---- finishing -------------------------------------------------------------------------
  private finishOrder: Racer[] = [];

  private checkFinish(): void {
    for (const x of this.racers) {
      if (!x.finished && x.s >= this.level.length) {
        x.finished = true;
        x.finishTime = this.time;
        this.finishOrder.push(x);
        if (x === this.player && this.phase === 'racing') {
          this.phase = 'finished';
          this.endTimer = 0;
          const rank = this.finishOrder.length;
          this.hooks.message({ text: rank <= 3 ? `YOU FINISHED ${ordinal(rank).toUpperCase()}!` : `FINISHED ${ordinal(rank).toUpperCase()}`, tone: rank <= 3 ? 'good' : 'bad' });
          if (rank <= 3) sfx.win();
          else sfx.lose();
        }
      }
    }
  }

  private finishRace(): void {
    let outcome: RaceResult['outcome'] = 'finish';
    if (this.phase === 'busted') outcome = 'busted';
    else if (this.phase === 'wrecked') outcome = 'wrecked';
    const ranks = this.ranking();
    const rank = outcome === 'finish' ? this.finishOrder.indexOf(this.player) + 1 : ranks.indexOf(this.player) + 1;
    this.result = {
      outcome,
      rank,
      time: this.time,
      bonus: this.bonus,
      standings: ranks.map((x) => ({ name: x.name, kind: x.kind, time: x.finished ? x.finishTime : null })),
    };
    this.hooks.end(this.result);
  }

  /** Current ordering of the field, best first. */
  ranking(): Racer[] {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.s - a.s;
    });
  }

  playerRank(): number {
    return this.ranking().indexOf(this.player) + 1;
  }

  // ---- visuals ---------------------------------------------------------------------------
  private syncRig(x: Racer, dt: number): void {
    const tr = this.track;
    const smp = tr.sample(x.s, this.sampleTmp);
    const rig = x.rig;
    tr.world(x.s, x.lat, this.tmp);
    rig.root.position.set(this.tmp.x, x.y, this.tmp.z);
    rig.root.rotation.y = -(smp.yaw + x.rel);
    const grounded = !x.air;
    const targetPitch = grounded ? Math.atan(smp.slope) : Math.max(-0.7, Math.min(0.7, Math.atan2(x.vy, Math.max(x.v, 8))));
    x.pitch += (targetPitch - x.pitch) * Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));
    rig.tilt.rotation.order = 'XZY';
    if (x.state === 'crashed') {
      const k = Math.min(1, x.crashT * 3);
      rig.tilt.rotation.x = x.pitch;
      rig.tilt.rotation.z = (x.id % 2 ? 1 : -1) * 1.45 * k;
      rig.tilt.position.y = 0.2 * k;
    } else {
      rig.tilt.rotation.x = x.pitch;
      rig.tilt.rotation.z = -x.lean;
      rig.tilt.position.y = 0;
    }
    // shadow stays on the ground when airborne
    const gy = tr.heightAt(x.s);
    rig.shadow.position.y = Math.min(0, gy - x.y) + 0.05;
    // wheels
    x.wheelAngle += (x.v * dt) / rig.wheelRadius;
    if (rig.wheelF) rig.wheelF.rotation.x = -x.wheelAngle;
    if (rig.wheelR) rig.wheelR.rotation.x = -x.wheelAngle;
    if (x.state === 'ride') rig.rider.update(x.attackSide, x.attackT, !!x.weapon);
    // blink while invulnerable
    rig.root.visible = !(x.inv > 0 && x.state === 'ride' && Math.floor(this.time * 14) % 2 === 0 && x.kind !== 'cop');
  }

  private camOffset = new THREE.Vector3();
  private lookOffset = new THREE.Vector3();
  private playerPos = new THREE.Vector3();

  private updateCamera(dt: number): void {
    const p = this.player;
    const tr = this.track;
    tr.world(p.s, p.lat, this.playerPos);
    this.playerPos.y = p.y;
    const back = 5.2 + p.v * 0.02;
    tr.world(Math.max(0, p.s - back), p.lat * 0.75, this.tmp);
    this.tmp.y = Math.max(this.tmp.y, p.y - 0.8) + 2.0 + p.v * 0.004;
    tr.world(p.s + 14, p.lat * 0.6, this.tmp2);
    this.tmp2.y = tr.heightAt(p.s + 14) * 0.4 + p.y * 0.6 + 0.9;
    this.tmp.sub(this.playerPos);
    this.tmp2.sub(this.playerPos);
    if (!this.camInit) {
      this.camOffset.copy(this.tmp);
      this.lookOffset.copy(this.tmp2);
      this.camInit = true;
    }
    // smooth the offset from the bike (not the world position) so the camera does not lag at speed
    this.camOffset.lerp(this.tmp, dt === 0 ? 1 : 1 - Math.exp(-dt * 10));
    this.lookOffset.lerp(this.tmp2, dt === 0 ? 1 : 1 - Math.exp(-dt * 12));
    this.cameraPos.copy(this.playerPos).add(this.camOffset);
    this.camLook.copy(this.playerPos).add(this.lookOffset);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const targetFov = 62 + Math.min(18, p.v * 0.22) + (p.boost ? 8 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
  }

  applyCamera(cam: THREE.PerspectiveCamera, time: number): void {
    const sh = this.shake + Math.max(0, this.player.v - 40) * 0.0015;
    cam.position.copy(this.cameraPos);
    cam.position.x += Math.sin(time * 61) * 0.06 * sh;
    cam.position.y += Math.sin(time * 47) * 0.08 * sh;
    cam.lookAt(this.camLook);
    if (this.player.state === 'ride') cam.rotateZ(-this.player.lean * 0.12);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    this.world.sky.position.copy(cam.position);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.world.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // module-level shared geometries are re-uploaded on demand; only free per-race buffers
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose?.();
      }
    });
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export { CHARACTERS };
