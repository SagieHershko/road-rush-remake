# Road Rush 3D

A 3D remake of the classic motorbike street-racing brawler. Race eight riders through five California
roads, punch (or club) your rivals off their bikes, dodge traffic and cows, and stay out of the cops' hands.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
```

| Key | Action |
| --- | --- |
| ↑ / W | gas |
| ↓ / S | brake |
| ← → / A D | steer |
| Z / Q | hit left |
| X / E | hit right |
| Space / Shift | nitro |
| Esc / P | pause |

Touch screens get on-screen buttons.

## The game

- **Top 3 to advance.** Prize money buys faster bikes in the shop.
- **Fight.** Pull alongside a rival and hit them; knock them off for cash. Hit a rider carrying a weapon
  (club, chain, crowbar, nunchaku, cattle prod) and you can snatch it.
- **Cops** join the race. Lose a fight with one, or crash with one close by, and you are busted and fined.
- **Damage.** Too many crashes wreck the bike (repair bill). Fines are capped at the cash you have.
- **Five levels:** The City, The Peninsula, Pacific Coast Highway, Sierra Nevada, Napa Valley.
- **Garage:** change the bike paint and the rider's suit, helmet and gloves/boots colours. Progress and
  colours are saved in `localStorage`.
- **Settings:** optional "retro pixels" low-res look, volume.

## Tech

Vite + TypeScript + three.js, no game engine. Everything except the two bike meshes is procedural:
the road, hills, scenery, traffic, riders and all sound effects (WebAudio synthesis).

- `src/game/race.ts` – race simulation: track-space physics, AI, traffic, combat, cops, jumps, camera
- `src/game/track.ts`, `world.ts` – procedural track + scenery per level
- `src/game/models.ts` – bike loading/tinting, procedural riders, cars, cows
- `tools/convert-models.mjs` – turns the downloaded OBJ models into small game-ready GLBs
  (decimates the 460k-triangle Srad 750 to ~58k, splits the wheels so they spin, tags paintable panels)

Regenerate the models with `npm run models -- <Srad750.obj> <Ninja.obj>`.

## Credits

3D models from CGTrader (free models): **Suzuki Srad 750** by edugamer69, and **Kawasaki Ninja ZX-6R**.
Check each model's license on CGTrader before redistributing or deploying publicly.
