import { CHARACTERS, type RiderStyle } from './config';

export interface SaveData {
  name: string;
  money: number;
  owned: string[];
  bike: string; // selected bike id
  paints: Record<string, number>; // per-bike paint colour
  rider: RiderStyle;
  level: number; // highest unlocked level index
  wins: number;
  retro: boolean;
  volume: number;
  hd?: boolean; // set once the old low-res default has been migrated away
}

const KEY = 'road-rush-remake-v1';

export function freshSave(): SaveData {
  const c = CHARACTERS[0];
  return {
    name: c.name, money: 1000, owned: ['ninja600'], bike: 'ninja600', paints: { ninja600: c.bike },
    rider: { ...c.style }, level: 0, wins: 0, retro: false, volume: 0.6, hd: true,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const s = { ...freshSave(), ...parsed } as SaveData;
      if (!parsed.hd) {
        s.retro = false; // earlier builds defaulted to a 760px pixelated render
        s.hd = true;
      }
      return s;
    }
  } catch {
    /* storage can be blocked */
  }
  return freshSave();
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
