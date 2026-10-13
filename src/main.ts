import * as THREE from 'three';
import { BIKES, CHARACTERS, LEVELS, PAINTS, bikeById, type RiderStyle } from './game/config';
import { bindTouch, readControls } from './game/input';
import { initAudio, setVolume, silence, sfx, updateEngine } from './game/audio';
import { loadModels } from './game/models';
import { Race, type RaceResult } from './game/race';
import { freshSave, loadSave, writeSave, type SaveData } from './game/save';
import { Showroom } from './game/showroom';
import { Hud } from './ui/hud';
import * as menus from './ui/menus';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const screenEl = document.getElementById('screen') as HTMLElement;
const touchEl = document.getElementById('touch') as HTMLElement;
const loadingEl = document.getElementById('loading') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

let save: SaveData = loadSave();
let selLevel = Math.min(save.level, LEVELS.length - 1);
type Mode = 'title' | 'menu' | 'garage' | 'shop' | 'settings' | 'howto' | 'race' | 'results';
let mode: Mode = 'title';
let paused = false;

const showroom = new Showroom();
const raceScene = new THREE.Scene();
const raceCam = new THREE.PerspectiveCamera(62, 1, 0.2, 2600);
const hud = new Hud();
let race: Race | null = null;
let fast = 1;

// ---- sizing -------------------------------------------------------------------------------
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // HD by default; "retro pixels" renders at ~720px wide and scales up for the 90s look
  const scale = save.retro ? Math.min(1, Math.max(0.3, 720 / w)) : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
  canvas.classList.toggle('retro', save.retro);
  raceCam.aspect = w / h;
  raceCam.updateProjectionMatrix();
  showroom.resize(w, h);
}
window.addEventListener('resize', resize);

// ---- screens ------------------------------------------------------------------------------
function setScreen(html: string): void {
  screenEl.innerHTML = html;
}

function goto(m: Mode): void {
  mode = m;
  hud.show(m === 'race');
  touchEl.hidden = !(m === 'race' && window.matchMedia('(pointer: coarse)').matches);
  switch (m) {
    case 'title': setScreen(menus.titleScreen()); showBike(); break;
    case 'menu': setScreen(menus.mainMenu(save, selLevel)); showBike(); break;
    case 'garage': setScreen(menus.garage(save)); showBike(); break;
    case 'shop': setScreen(menus.shop(save)); showBike(); break;
    case 'settings': setScreen(menus.settings(save)); break;
    case 'howto': setScreen(menus.howto()); break;
    case 'race': setScreen(''); break;
    case 'results': break;
  }
}

function showBike(): void {
  const spec = bikeById(save.bike);
  showroom.set(spec, save.paints[spec.id] ?? PAINTS[0].color, save.rider);
}

function persist(): void {
  writeSave(save);
}

// ---- race flow ----------------------------------------------------------------------------
function startRace(): void {
  if (race) endRace();
  initAudio();
  setVolume(save.volume);
  race = new Race(raceScene, LEVELS[selLevel], save, {
    message: (m) => hud.toast(m),
    end: (r) => onRaceEnd(r),
  });
  hud.begin(race);
  paused = false;
  goto('race');
  raceCam.fov = race.fov;
}

function endRace(): void {
  if (!race) return;
  race.dispose(raceScene);
  raceScene.fog = null;
  race = null;
  silence();
}

function onRaceEnd(res: RaceResult): void {
  const lv = LEVELS[selLevel];
  let prize = 0;
  let fine = 0;
  let advanced = false;
  let champion = false;
  if (res.outcome === 'finish' && res.rank <= 3) {
    prize = Math.round(lv.prize * [1, 0.55, 0.3][res.rank - 1]);
    if (selLevel === save.level) {
      if (selLevel < LEVELS.length - 1) {
        save.level++;
        advanced = true;
      } else {
        champion = true;
        save.wins++;
      }
    }
    if (selLevel < save.level && !advanced) selLevel = Math.min(selLevel + 1, save.level);
    else if (advanced) selLevel = save.level;
  } else if (res.outcome === 'busted') {
    fine = 400 * lv.id;
  } else if (res.outcome === 'wrecked') {
    fine = 300 * lv.id;
  }
  // fines come out of what you have; you can never go below zero, so there is always another race
  const gross = save.money + prize + res.bonus;
  fine = Math.min(fine, gross);
  save.money = gross - fine;
  persist();
  silence();
  hud.show(false);
  touchEl.hidden = true;
  mode = 'results';
  setScreen(
    menus.results({
      res, prize, fine, levelName: LEVELS[Math.min(selLevel, LEVELS.length - 1)].name, advanced, champion, money: save.money,
    }),
  );
}

// ---- actions ------------------------------------------------------------------------------
function setRiderColor(key: keyof RiderStyle, c: number): void {
  save.rider[key] = c;
}

function cycleBike(dir: number): void {
  const owned = BIKES.filter((b) => save.owned.includes(b.id));
  const i = owned.findIndex((b) => b.id === save.bike);
  save.bike = owned[(i + dir + owned.length) % owned.length].id;
  if (save.paints[save.bike] === undefined) save.paints[save.bike] = PAINTS[0].color;
}

screenEl.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  const [act, arg] = el.dataset.act!.split(':');
  sfx.click();
  switch (act) {
    case 'start': initAudio(); goto('menu'); break;
    case 'menu': persist(); goto('menu'); break;
    case 'race': case 'again': startRace(); break;
    case 'garage': case 'shop': case 'settings': case 'howto': goto(act); break;
    case 'lvl-prev': selLevel = Math.max(0, selLevel - 1); goto('menu'); break;
    case 'lvl-next': selLevel = Math.min(save.level, selLevel + 1); goto('menu'); break;
    case 'char': {
      const c = CHARACTERS[+arg];
      save.name = c.name;
      save.rider = { ...c.style };
      save.paints[save.bike] = c.bike;
      persist();
      goto('garage');
      break;
    }
    case 'paint': save.paints[save.bike] = +arg; persist(); goto('garage'); break;
    case 'suit': case 'helmet': case 'accent': setRiderColor(act, +arg); persist(); goto('garage'); break;
    case 'bike-prev': cycleBike(-1); persist(); goto('garage'); break;
    case 'bike-next': cycleBike(1); persist(); goto('garage'); break;
    case 'buy': {
      const b = BIKES.find((x) => x.id === arg);
      if (b && save.money >= b.price && !save.owned.includes(b.id)) {
        save.money -= b.price;
        save.owned.push(b.id);
        save.bike = b.id;
        save.paints[b.id] = save.paints[b.id] ?? PAINTS[(BIKES.indexOf(b) * 3) % PAINTS.length].color;
        sfx.cash();
        persist();
      }
      goto('shop');
      break;
    }
    case 'select': save.bike = arg; persist(); goto('shop'); break;
    case 'reset': save = freshSave(); selLevel = 0; persist(); resize(); goto('menu'); break;
    case 'resume': paused = false; setScreen(''); break;
    case 'quit': paused = false; endRace(); goto('menu'); break;
  }
});

screenEl.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'in-name') {
    save.name = t.value.trim() || 'Player_1';
    persist();
  } else if (t.id === 'in-vol') {
    save.volume = +t.value;
    setVolume(save.volume);
    persist();
  } else if (t.id === 'in-retro') {
    save.retro = t.checked;
    persist();
    resize();
  }
});

// drag to spin the showroom bike
let dragX: number | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'race') return;
  dragX = e.clientX;
  showroom.dragging = true;
});
window.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  showroom.rotate(e.clientX - dragX);
  dragX = e.clientX;
});
window.addEventListener('pointerup', () => {
  dragX = null;
  showroom.dragging = false;
});

window.addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'race' && race && race.phase !== 'finished') {
    paused = !paused;
    setScreen(paused ? menus.pause() : '');
    if (paused) silence();
  }
});

bindTouch(document.getElementById('t-left')!, 'left');
bindTouch(document.getElementById('t-right')!, 'right');
bindTouch(document.getElementById('t-gas')!, 'gas');
bindTouch(document.getElementById('t-brake')!, 'brake');
bindTouch(document.getElementById('t-nitro')!, 'nitro');
bindTouch(document.getElementById('t-pl')!, 'punchL');
bindTouch(document.getElementById('t-pr')!, 'punchR');

// ---- loop ---------------------------------------------------------------------------------
let last = performance.now();
let errorStreak = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    tick(dt, now);
    errorStreak = 0;
  } catch (err) {
    // never let one bad frame freeze the game or silently drop the player back to the menu
    console.error('frame error', err);
    if (++errorStreak > 120 && mode === 'race') {
      errorStreak = 0;
      endRace();
      goto('menu');
      setScreen(`<div class="screen-center"><div class="panel"><h2>Something went wrong</h2><p>The race hit an error and was stopped. Details are in the browser console.</p><button class="btn" data-act="menu">MENU</button></div></div>`);
    }
  }
}

function tick(dt: number, now: number): void {
  if (mode === 'race' && race) {
    if (!paused) {
      const ctl = readControls();
      const reps = import.meta.env.DEV ? fast : 1;
      for (let i = 0; i < reps; i++) race.update(dt, ctl);
      hud.update(race);
      const p = race.player;
      const frac = Math.min(1, p.v / p.spec.vmax);
      const g = Math.min(4, Math.floor(frac * 5));
      const rpm = 0.25 + 0.6 * (frac * 5 - g) + 0.1 * (g / 4);
      updateEngine(race.phase === 'countdown' ? 0.35 + Math.random() * 0.1 : rpm, frac, p.state === 'ride' || p.v > 2, race.sirenLevel);
    }
    race.applyCamera(raceCam, now / 1000);
    renderer.render(raceScene, raceCam);
  } else {
    showroom.update(dt);
    renderer.render(showroom.scene, showroom.camera);
  }
}

async function boot(): Promise<void> {
  await loadModels();
  loadingEl.hidden = true;
  resize();
  goto('title');
  requestAnimationFrame(frame);
}
void boot();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__rr = {
    get race() { return race; },
    get save() { return save; },
    start: (lvl = 0) => { selLevel = Math.min(lvl, LEVELS.length - 1); startRace(); },
    goto,
    showroom,
    set fast(n: number) { fast = n; },
  };
}
