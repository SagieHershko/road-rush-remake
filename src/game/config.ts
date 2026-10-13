export type ModelId = 'ninja' | 'srad';

export interface BikeSpec {
  id: string;
  name: string;
  model: ModelId;
  price: number;
  vmax: number; // m/s
  accel: number; // m/s^2
  handling: number;
  durability: number;
  blurb: string;
}

export const BIKES: BikeSpec[] = [
  { id: 'ninja600', name: 'Ninja ZX-6R', model: 'ninja', price: 0, vmax: 50, accel: 13, handling: 1.0, durability: 100, blurb: 'Your first ride. Light, forgiving, a little slow.' },
  { id: 'srad750', name: 'Srad 750', model: 'srad', price: 3500, vmax: 58, accel: 15.5, handling: 1.05, durability: 110, blurb: 'Proper superbike pace. Stable at speed.' },
  { id: 'ninjapro', name: 'Ninja ZX-6R Pro', model: 'ninja', price: 9000, vmax: 67, accel: 18.5, handling: 1.12, durability: 120, blurb: 'Tuned engine, stiffer frame, hungry for traffic.' },
  { id: 'sradturbo', name: 'Srad 750 Turbo', model: 'srad', price: 20000, vmax: 78, accel: 22, handling: 1.18, durability: 135, blurb: 'The king of the road. Hold on tight.' },
];

export const bikeById = (id: string): BikeSpec => BIKES.find((b) => b.id === id) ?? BIKES[0];

export const PAINTS: { name: string; color: number }[] = [
  { name: 'Racing Yellow', color: 0xf2c200 },
  { name: 'Fire Red', color: 0xd81818 },
  { name: 'Cobalt Blue', color: 0x1747d1 },
  { name: 'Sky Blue', color: 0x2aa0e8 },
  { name: 'Lime Green', color: 0x6cc21a },
  { name: 'Orange', color: 0xf26a10 },
  { name: 'Hot Pink', color: 0xe8309a },
  { name: 'Purple', color: 0x7a3bd6 },
  { name: 'Gunmetal', color: 0x3a3d45 },
  { name: 'Pearl White', color: 0xeeeeee },
  { name: 'Jet Black', color: 0x0e0e10 },
];

export interface RiderStyle {
  suit: number;
  helmet: number;
  accent: number;
}

export interface CharacterPreset {
  name: string;
  style: RiderStyle;
  bike: number;
}

export const CHARACTERS: CharacterPreset[] = [
  { name: 'Axle', style: { suit: 0xc9cbe8, helmet: 0xf2f2f2, accent: 0x3a43c4 }, bike: 0xf2c200 },
  { name: 'Rhonda', style: { suit: 0xc8d62a, helmet: 0xe8e8e8, accent: 0x2a2a2a }, bike: 0xd81818 },
  { name: 'Slade', style: { suit: 0x1f3f5a, helmet: 0xa57be0, accent: 0xf2f2f2 }, bike: 0xf2c200 },
  { name: 'Biff', style: { suit: 0x1c1c1c, helmet: 0x22262d, accent: 0xd9a21c }, bike: 0x1747d1 },
];

export const SUIT_COLORS = [0xc9cbe8, 0xc8d62a, 0x1f3f5a, 0x1c1c1c, 0xd81818, 0xf2c200, 0x2aa0e8, 0xe8309a, 0x6cc21a, 0xf26a10, 0xeeeeee, 0x7a3bd6];

export const WEAPONS = {
  club: { name: 'Club', dmg: 26, uses: 6, color: 0x7a4a22, len: 0.9 },
  chain: { name: 'Chain', dmg: 30, uses: 6, color: 0x8a8d94, len: 0.8 },
  crowbar: { name: 'Crowbar', dmg: 32, uses: 6, color: 0xb02a2a, len: 0.85 },
  nunchaku: { name: 'Nunchaku', dmg: 36, uses: 5, color: 0x2a2a2a, len: 0.7 },
  prod: { name: 'Cattle prod', dmg: 40, uses: 4, color: 0xe0b020, len: 0.75 },
} as const;
export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export interface Theme {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  groundAlt: number;
  far: number; // distant mountains / skyline
  sun: number;
  sunIntensity: number;
  ambient: number;
  asphalt: number;
}

export type SceneryRecipe = 'city' | 'suburb' | 'coast' | 'sierra' | 'napa';
export type SideProfile = 'flat' | 'hills' | 'cliff';

export interface LevelSpec {
  id: number;
  name: string;
  blurb: string;
  length: number;
  maxCurv: number;
  hillAmp: number;
  traffic: number; // cars per km
  hazards: number; // cows per km
  aiMin: number;
  aiMax: number;
  prize: number;
  recipe: SceneryRecipe;
  sides: [SideProfile, SideProfile]; // left, right
  theme: Theme;
}

export const LEVELS: LevelSpec[] = [
  {
    id: 1, name: 'The City', blurb: 'Concrete canyons and slow station wagons.', length: 6500, maxCurv: 0.0045, hillAmp: 2.2,
    traffic: 11, hazards: 0, aiMin: 43, aiMax: 49, prize: 1500, recipe: 'city', sides: ['flat', 'flat'],
    theme: { skyTop: 0x5a86c4, skyHorizon: 0xcfd9e6, fog: 0xc3ccd8, fogNear: 60, fogFar: 520, ground: 0x6d6f73, groundAlt: 0x585a5e, far: 0x7f8b9c, sun: 0xfff2dc, sunIntensity: 1.5, ambient: 0xb9c6d8, asphalt: 0x2b2b2e },
  },
  {
    id: 2, name: 'The Peninsula', blurb: 'Rolling suburbs, long sweepers, bigger hills.', length: 7800, maxCurv: 0.0058, hillAmp: 5,
    traffic: 10, hazards: 1.2, aiMin: 48, aiMax: 55, prize: 3000, recipe: 'suburb', sides: ['hills', 'hills'],
    theme: { skyTop: 0x3f7fd0, skyHorizon: 0xd8e6f2, fog: 0xcfdde8, fogNear: 80, fogFar: 620, ground: 0x5f9a3d, groundAlt: 0x4c8431, far: 0x6f90a8, sun: 0xfff4d6, sunIntensity: 1.6, ambient: 0xbfd0e0, asphalt: 0x303033 },
  },
  {
    id: 3, name: 'Pacific Coast Highway', blurb: 'Cliffs, palms and a sunset you have no time to watch.', length: 9000, maxCurv: 0.0068, hillAmp: 6,
    traffic: 8, hazards: 1.5, aiMin: 54, aiMax: 62, prize: 5500, recipe: 'coast', sides: ['hills', 'cliff'],
    theme: { skyTop: 0x2e5fae, skyHorizon: 0xf6c486, fog: 0xe8c7a0, fogNear: 90, fogFar: 700, ground: 0xb79a62, groundAlt: 0x9a8350, far: 0x8c6f66, sun: 0xffc27a, sunIntensity: 1.7, ambient: 0xe2b88f, asphalt: 0x38363a },
  },
  {
    id: 4, name: 'Sierra Nevada', blurb: 'Pine forests, switchbacks, and cold hard rock.', length: 10200, maxCurv: 0.0085, hillAmp: 8,
    traffic: 6, hazards: 2, aiMin: 60, aiMax: 70, prize: 9000, recipe: 'sierra', sides: ['hills', 'hills'],
    theme: { skyTop: 0x2a5aa8, skyHorizon: 0xcfe0ee, fog: 0xc9d8e4, fogNear: 70, fogFar: 560, ground: 0x4f6d44, groundAlt: 0x3f5a38, far: 0x8aa0b8, sun: 0xf0f4ff, sunIntensity: 1.5, ambient: 0xa9bfd6, asphalt: 0x2e3033 },
  },
  {
    id: 5, name: 'Napa Valley', blurb: 'Vineyards, golden light, the fastest riders alive.', length: 11500, maxCurv: 0.0095, hillAmp: 7,
    traffic: 7, hazards: 2, aiMin: 67, aiMax: 78, prize: 14000, recipe: 'napa', sides: ['hills', 'hills'],
    theme: { skyTop: 0x3d70c0, skyHorizon: 0xf3dfb4, fog: 0xe8d8b4, fogNear: 90, fogFar: 700, ground: 0x9aa43c, groundAlt: 0x7f8f33, far: 0x9c8a62, sun: 0xffe0a0, sunIntensity: 1.7, ambient: 0xe2d2a8, asphalt: 0x34322f },
  },
];

export const ROAD_HALF = 6;
export const LANES = [-3.4, 0, 3.4];
export const FIELD_SIZE = 8;
export const GRAVITY = 13;
