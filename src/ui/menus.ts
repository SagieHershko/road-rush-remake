import { BIKES, CHARACTERS, LEVELS, PAINTS, SUIT_COLORS, bikeById, type BikeSpec } from '../game/config';
import { ordinal, type RaceResult } from '../game/race';
import type { SaveData } from '../game/save';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function titleScreen(): string {
  return `<div class="screen-center">
    <h1 class="logo">ROAD RUSH</h1>
    <div class="sub">3D · THE REMAKE</div>
    <button class="btn big red" data-act="start">START ENGINE</button>
    <div class="hint">Race. Fight. Don't get busted.</div>
  </div>`;
}

function stat(label: string, pct: number): string {
  return `<div class="stat"><span>${label}</span><div class="meter"><i style="width:${Math.round(Math.max(4, Math.min(100, pct)))}%"></i></div></div>`;
}

export function bikeStats(b: BikeSpec): string {
  return (
    stat('SPEED', ((b.vmax - 40) / 42) * 100) +
    stat('ACCEL', ((b.accel - 11) / 12) * 100) +
    stat('HANDLING', ((b.handling - 0.95) / 0.28) * 100) +
    stat('ARMOR', ((b.durability - 90) / 50) * 100)
  );
}

export function mainMenu(save: SaveData, selLevel: number): string {
  const lv = LEVELS[selLevel];
  const bike = bikeById(save.bike);
  return `<div class="screen-right">
    <div class="row sb"><h1 class="logo" style="font-size:44px;margin:0">ROAD RUSH</h1><div class="money">${money(save.money)}</div></div>
    <div class="panel">
      <div class="row sb"><span class="chip">LEVEL ${lv.id} / ${LEVELS.length}</span>
        <span>
          <button class="btn small dark" data-act="lvl-prev" ${selLevel <= 0 ? 'disabled' : ''}>◀</button>
          <button class="btn small dark" data-act="lvl-next" ${selLevel >= save.level ? 'disabled' : ''}>▶</button>
        </span></div>
      <h2>${lv.name}</h2>
      <p>${lv.blurb}</p>
      <p>${(lv.length / 1000).toFixed(1)} km · Top 3 to advance · Prize <b class="good">${money(lv.prize)}</b></p>
    </div>
    <div class="panel">
      <div class="lab">YOUR RIDE</div>
      <h2 style="font-size:22px">${save.name} — ${bike.name}</h2>
      ${bikeStats(bike)}
    </div>
    <div class="menu-btns" style="width:100%">
      <button class="btn big red" data-act="race">RACE!</button>
      <button class="btn" data-act="garage">GARAGE · COLOURS</button>
      <button class="btn" data-act="shop">BIKE SHOP</button>
      <div class="row" style="justify-content:center">
        <button class="btn small dark" data-act="howto">HOW TO PLAY</button>
        <button class="btn small dark" data-act="settings">SETTINGS</button>
      </div>
    </div>
  </div>`;
}

function swatches(list: number[], current: number, kind: string): string {
  return `<div class="swatches">${list
    .map((c) => `<div class="sw ${c === current ? 'on' : ''}" style="background:${hex(c)}" data-act="${kind}:${c}"></div>`)
    .join('')}</div>`;
}

export function garage(save: SaveData): string {
  const bike = bikeById(save.bike);
  const paint = save.paints[bike.id] ?? PAINTS[0].color;
  const owned = save.owned.length > 1;
  return `<div class="screen-right">
    <div class="row sb"><h2 style="margin:0;color:#ffd400;font-size:30px;font-weight:normal">GARAGE</h2><div class="money">${money(save.money)}</div></div>
    <div class="panel">
      <div class="lab">RIDER NAME</div>
      <input type="text" id="in-name" maxlength="12" value="${save.name.replace(/"/g, '')}" />
      <div class="lab">PRESETS</div>
      <div class="row">${CHARACTERS.map((c, i) => `<button class="btn small dark" data-act="char:${i}">${c.name}</button>`).join('')}</div>
    </div>
    <div class="panel">
      <div class="row sb"><div class="lab" style="margin:0">BIKE · ${bike.name.toUpperCase()}</div>
        ${owned ? `<span><button class="btn small dark" data-act="bike-prev">◀</button> <button class="btn small dark" data-act="bike-next">▶</button></span>` : ''}</div>
      <div class="lab">BIKE PAINT</div>
      ${swatches(PAINTS.map((p) => p.color), paint, 'paint')}
      <div class="lab">SUIT</div>
      ${swatches(SUIT_COLORS, save.rider.suit, 'suit')}
      <div class="lab">HELMET</div>
      ${swatches(SUIT_COLORS, save.rider.helmet, 'helmet')}
      <div class="lab">GLOVES · BOOTS · STRIPE</div>
      ${swatches(SUIT_COLORS, save.rider.accent, 'accent')}
    </div>
    <button class="btn" data-act="menu">◀ BACK</button>
  </div>`;
}

export function shop(save: SaveData): string {
  return `<div class="screen-right">
    <div class="row sb"><h2 style="margin:0;color:#ffd400;font-size:30px;font-weight:normal">BIKE SHOP</h2><div class="money">${money(save.money)}</div></div>
    ${BIKES.map((b) => {
      const has = save.owned.includes(b.id);
      const sel = save.bike === b.id;
      const can = save.money >= b.price;
      return `<div class="bike-card ${sel ? 'sel' : ''}">
        <h3>${b.name} ${sel ? '<span class="chip">RIDING</span>' : ''}</h3>
        <p style="margin:0;font-family:Arial;font-size:13px;color:#bbb">${b.blurb}</p>
        ${bikeStats(b)}
        ${
          has
            ? sel
              ? ''
              : `<button class="btn small" data-act="select:${b.id}">RIDE THIS</button>`
            : `<button class="btn small red" data-act="buy:${b.id}" ${can ? '' : 'disabled'}>BUY ${money(b.price)}</button>`
        }
      </div>`;
    }).join('')}
    <button class="btn" data-act="menu">◀ BACK</button>
  </div>`;
}

export function settings(save: SaveData): string {
  return `<div class="screen-full"><div class="panel stack">
    <h2>SETTINGS</h2>
    <label class="row sb"><span>RETRO PIXELS (low-res 90s look)</span><input type="checkbox" id="in-retro" ${save.retro ? 'checked' : ''} style="width:26px;height:26px;accent-color:#ffd400"></label>
    <label><div class="lab">VOLUME</div><input type="range" id="in-vol" min="0" max="1" step="0.05" value="${save.volume}"></label>
    <div class="row">
      <button class="btn dark small" data-act="reset">RESET PROGRESS</button>
      <button class="btn" data-act="menu">◀ BACK</button>
    </div>
  </div></div>`;
}

export function howto(): string {
  return `<div class="screen-full"><div class="panel stack">
    <h2>HOW TO PLAY</h2>
    <p><b>Goal:</b> finish in the <b>top 3</b> of every race to move on. Prize money buys faster bikes.</p>
    <p><b>Keyboard:</b> ↑/W gas · ↓/S brake · ←/→ or A/D steer · <b>Z / Q</b> hit left · <b>X / E</b> hit right · <b>Space / Shift</b> nitro.</p>
    <p><b>Touch:</b> use the on-screen buttons.</p>
    <p><b>Fight:</b> pull alongside a rival and hit them. Knock them off for cash. Hit a rider who is holding a weapon and you might snatch it.</p>
    <p><b>Cops:</b> they join the race and hit you too. Lose that fight, or crash with a cop nearby, and you are <span class="bad">BUSTED</span> and fined.</p>
    <p><b>Crashes:</b> traffic, cows, poles and big landings wreck you. Too much damage and the bike is <span class="bad">WRECKED</span>. The fine comes out of your cash — you can always race again.</p>
    <button class="btn" data-act="menu">◀ BACK</button>
  </div></div>`;
}

export interface ResultView {
  res: RaceResult;
  prize: number;
  fine: number;
  levelName: string;
  advanced: boolean;
  champion: boolean;
  money: number;
}

export function results(v: ResultView): string {
  const { res } = v;
  let title = '';
  let big = '';
  if (res.outcome === 'finish') {
    big = `<div class="res-rank">${res.rank}<sup>${ordinal(res.rank).replace(/\d+/, '')}</sup></div>`;
    title = res.rank <= 3 ? '<span class="good">PODIUM!</span>' : '<span class="bad">OUT OF THE MONEY</span>';
  } else if (res.outcome === 'busted') {
    big = '<div class="res-rank">BUSTED</div>';
    title = '<span class="bad">THE LAW CAUGHT UP</span>';
  } else {
    big = '<div class="res-rank">WRECKED</div>';
    title = '<span class="bad">YOUR BIKE IS SCRAP</span>';
  }
  const lines: string[] = [];
  if (v.prize) lines.push(`<tr><td>Prize money</td><td class="good">+${money(v.prize)}</td></tr>`);
  if (res.bonus) lines.push(`<tr><td>Knock-off bonuses</td><td class="good">+${money(res.bonus)}</td></tr>`);
  if (v.fine) lines.push(`<tr><td>${res.outcome === 'busted' ? 'Fine' : 'Repairs'}</td><td class="bad">-${money(v.fine)}</td></tr>`);
  lines.push(`<tr><td>Cash now</td><td>${money(v.money)}</td></tr>`);
  const table =
    res.outcome === 'finish'
      ? `<table class="table">${res.standings
          .map((s, i) => `<tr class="${s.kind === 'player' ? 'me' : ''}"><td>${i + 1}</td><td>${s.name}</td><td>${s.time ? s.time.toFixed(1) + 's' : '—'}</td></tr>`)
          .join('')}</table>`
      : '';
  return `<div class="screen-full"><div class="panel stack" style="text-align:center">
    <div class="res-title">${title}</div>
    ${big}
    ${v.champion ? '<h2>YOU ARE THE ROAD RUSH CHAMPION!</h2>' : v.advanced ? `<h2>NEXT UP: ${v.levelName}</h2>` : ''}
    <table class="table">${lines.join('')}</table>
    ${table}
    <div class="row" style="justify-content:center"><button class="btn red" data-act="again">RACE AGAIN</button><button class="btn" data-act="menu">MENU</button></div>
  </div></div>`;
}

export function pause(): string {
  return `<div class="screen-center"><div class="panel stack"><h2>PAUSED</h2>
    <button class="btn red" data-act="resume">RESUME</button>
    <button class="btn dark" data-act="quit">QUIT RACE</button></div></div>`;
}
