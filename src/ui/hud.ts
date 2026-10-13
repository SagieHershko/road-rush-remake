import { Race, ordinal, type RaceMessage } from '../game/race';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private root = $('hud');
  private name = $('h-name');
  private stamina = $('h-stamina');
  private damage = $('h-damage');
  private nitro = $('h-nitro');
  private weapon = $('h-weapon');
  private rank = $('h-rank');
  private progress = $('h-progress');
  private time = $('h-time');
  private cash = $('h-cash');
  private level = $('h-level');
  private speed = $('h-speed');
  private compass = $('h-compass');
  private needle = document.getElementById('h-needle') as unknown as SVGLineElement;
  private ticks = document.getElementById('h-ticks') as unknown as SVGGElement;
  private toastEl = $('toast');
  private countEl = $('countdown');
  private vignette = $('h-vignette');
  private dots: HTMLElement[] = [];
  private lastRank = 0;
  private lastCount = '';

  constructor() {
    for (let i = 0; i <= 10; i++) {
      const a = ((-135 + i * 27) * Math.PI) / 180;
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const r1 = i % 5 === 0 ? 44 : 49;
      ln.setAttribute('x1', String(60 + Math.sin(a) * r1));
      ln.setAttribute('y1', String(60 - Math.cos(a) * r1));
      ln.setAttribute('x2', String(60 + Math.sin(a) * 53));
      ln.setAttribute('y2', String(60 - Math.cos(a) * 53));
      this.ticks.appendChild(ln);
    }
  }

  show(on: boolean): void {
    this.root.hidden = !on;
    if (!on) {
      this.toastEl.innerHTML = '';
      this.countEl.textContent = '';
    }
  }

  begin(race: Race): void {
    this.name.textContent = race.player.name;
    this.level.textContent = `LEVEL ${race.level.id} — ${race.level.name.toUpperCase()}`;
    this.progress.innerHTML = '';
    this.dots = race.racers.map((r) => {
      const b = document.createElement('b');
      if (r.kind === 'player') b.className = 'me';
      this.progress.appendChild(b);
      return b;
    });
    this.lastRank = 0;
  }

  toast(m: RaceMessage): void {
    const el = document.createElement('div');
    el.className = `toast ${m.tone}`;
    el.textContent = m.text;
    this.toastEl.innerHTML = '';
    this.toastEl.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  update(race: Race): void {
    const p = race.player;
    const len = race.level.length;
    this.stamina.style.width = `${Math.max(0, (p.stamina / p.staminaMax) * 100)}%`;
    this.damage.style.width = `${Math.max(0, 100 - (p.damage / p.spec.durability) * 100)}%`;
    this.nitro.style.width = `${p.nitro}%`;
    this.weapon.textContent = p.weapon ? `✊ ${p.weapon.id.toUpperCase()} x${p.weapon.uses}` : '';
    const rank = race.playerRank();
    if (rank !== this.lastRank) {
      this.rank.innerHTML = `${rank}<sup>${ordinal(rank).replace(/\d+/, '')}</sup>`;
      this.lastRank = rank;
    }
    race.racers.forEach((r, i) => {
      this.dots[i].style.left = `${Math.min(100, (Math.max(0, r.s) / len) * 100)}%`;
    });
    const t = race.time;
    this.time.textContent = `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
    this.cash.textContent = race.bonus ? `+$${race.bonus}` : '';
    const mph = p.v * 2.237;
    this.speed.textContent = String(Math.round(mph)).padStart(3, '0');
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const smp = race.track.yawAt(p.s) + p.rel;
    const deg = (((smp * 180) / Math.PI) % 360 + 360) % 360;
    this.compass.textContent = `${dir[(Math.round(deg / 45) + 7) % 8]} · ${dir[Math.round(deg / 45) % 8]} · ${dir[(Math.round(deg / 45) + 1) % 8]}`;
    const frac = Math.min(1, p.v / (p.spec.vmax * 1.25));
    this.needle.setAttribute('transform', `rotate(${-135 + frac * 270} 60 60)`);
    this.vignette.style.opacity = String(p.stamina < p.staminaMax * 0.3 ? 0.9 : 0);

    // countdown
    let c = '';
    if (race.phase === 'countdown') c = String(Math.max(1, Math.ceil(race.countdown)));
    else if (race.phase === 'racing' && race.time < 0.9) c = 'GO!';
    if (c !== this.lastCount) {
      this.countEl.textContent = c;
      this.lastCount = c;
    }
  }
}
