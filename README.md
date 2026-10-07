# Drill (working title): prototype v0.1

An endless, portrait, pixel-art drilling game for phone browsers. You pilot a drill ship that bores **upward** through an alien planet and keep it alive by running your one crew member between stations. Your score is depth.

Built with **Phaser 3.90** (vendored at `lib/phaser.min.js`). It uses plain ES modules, has **no build step and no external assets**, and can be served from any static host (GitHub Pages ready).

## Run locally

```bash
cd drill-game
python3 -m http.server 8000
# open http://localhost:8000 (on a phone: http://<your-LAN-ip>:8000)
```
ES modules don't load over `file://`, so you need a server.

## How to play

| View | Controls |
|---|---|
| **Outside** (drill face) | Throttle slider on the right (drag/tap), or the `+` / `-` buttons. The green part of the track is "safe to hit a boulder" speed. Tap the ship or **INSIDE** to go in. |
| **Inside** (cutaway) | Tap a room (ENG / DRL / TLS) to walk there, then **hold** the action button. **OUTSIDE** goes back. |

Optional desktop keys: `W/S` or arrow keys for throttle, `Space` to toggle the view, `1/2/3` to pick a room, `E` (hold) for the primary action, `Q` (hold) to blast, `R`/`Enter` to restart.

## Mechanics

* **Speed / depth**: real speed eases toward the throttle (quick to brake, slower to accelerate). The rock scrolls down past the ship, and depth = px scrolled / `PX_PER_METER`.
* **Engine heat (ENG, hold VENT)**: builds with `speed² × difficulty`, has passive cooling, and is doubled in hard rock. Random **coolant leaks** add a heat spike on a timer, so crawling isn't free. At 100% the engine is capped at 40% speed and the hull takes damage every second.
* **Drill bit wear (DRL, hold FIX DRILL BIT)**: builds per metre drilled, tripled in hard rock, and goes up with grinding and ramming. At 100% speed is capped at 50% and the hull takes damage while moving.
* **Hull (TLS, hold PATCH)**: goes down from maxed heat, a dead bit, and rams. At 0 you get game over.
* **Boulders**: spawn ahead in the drill's path, more often and bigger with depth.
  * Hit one **above** `RAM_SAFE_SPEED` and you **ram** it: hull damage scales with speed and boulder size, plus bit wear and a speed jolt.
  * Hit one **at or below** it and you **grind** it: forward progress stops while the bit chews through (wear goes up, the hull is safe).
  * **TLS, hold BLAST** (1.2 s charge) fires a laser that clears the nearest boulder on screen.
  * A flashing `!` appears next to a boulder that's close while you're going too fast.
* **Hard rock bands**: blue strata. While the tip is inside one, speed is capped at 70%, heat ×2, wear ×3.
* **Difficulty**: `difficulty = 1 + depth / DIFF_DEPTH` multiplies heat and wear rates, shortens the gap between boulders and leaks, and makes boulders bigger. The rock colour also shifts every 350 m.
* **Alerts**: the HUD icons (hull, heat, bit, boulder, hard rock) show in both views. In the inside view, yellow `!` bubbles float over the room that needs you. A red light blinks on the hull exterior, and toast messages show up under the top bar.
* **Game over**: shows depth and best depth (`localStorage['drill.bestDepth']`), plus a RESTART button.

## File structure

```
index.html                 page shell, loads lib/phaser.min.js + src/main.js (module)
lib/phaser.min.js          vendored Phaser 3.90.0
src/
  main.js                  Phaser config (180x320, pixelArt, Scale.FIT + center)
  config.js                TUNING + LAYOUT constants, best-score storage helpers
  scenes/
    BootScene.js           generates font + all textures, then goes to Title
    TitleScene.js          title / best depth / tap to start
    GameScene.js           world + simulation loop, commands used by UI, game over trigger
    UIScene.js             HUD overlay: depth, bars, alerts, toasts, throttle, station panel
    GameOverScene.js       results + restart
  systems/
    ShipSystems.js         pure numbers: speed, depth, heat, wear, hull, leaks (no rendering)
    Terrain.js             scrolling rock/tunnel tiles, depth tint, hard-rock bands
    Obstacles.js           boulder spawn/scroll, ram / grind / blast
    Ship.js                ship visuals: interior cutaway, stations, exterior, drill, room tap zones
    Crew.js                crew member walk/work state machine
    ViewController.js      camera pan/zoom between outside and inside
    PixelFont.js           runtime-generated 3x5 bitmap font ('pixel')
    Textures.js            all procedural placeholder art
  ui/
    Button.js              touch button with tap + press-and-hold
tests/e2e.mjs              Playwright phone-viewport test (see below)
screenshots/               outside / inside / game-over captures
```

## Tuning constants (`src/config.js` → `TUNING`)

| Constant | Default | Meaning |
|---|---|---|
| `MAX_SPEED_PX` / `PX_PER_METER` | 40 / 4 | 10 m/s at full throttle |
| `ACCEL` / `DECEL` | 0.5 / 1.6 | speed change per second (fraction of max) |
| `DIFF_DEPTH` | 400 | +100% heat/wear rates per 400 m |
| `HEAT_RATE` / `HEAT_COOL` | 7 / 1.2 | heat/s at full speed (×speed²×difficulty) / passive cooling |
| `VENT_RATE` | 35 | heat removed per second of venting |
| `OVERHEAT_DAMAGE` / `OVERHEAT_SPEED_CAP` | 4 / 0.4 | hull/s and speed cap at max heat |
| `SPIKE_INTERVAL` / `SPIKE_AMOUNT` / `SPIKE_START_DEPTH` | 25–45 s / 22 / 60 m | coolant leak events |
| `WEAR_PER_METER` / `REPAIR_RATE` | 0.15 / 30 | bit wear per metre / per second repaired |
| `WORN_DAMAGE` / `WORN_SPEED_CAP` | 3 / 0.5 | hull/s and speed cap with a dead bit |
| `PATCH_RATE` | 9 | hull per second patched |
| `RAM_SAFE_SPEED` | 0.35 | speed at/under which boulders are ground safely |
| `RAM_DAMAGE_BASE` / `RAM_DAMAGE_SPEED` | 8 / 30 | ram damage = (8 + 30×speed) × size (0.7/1/1.4) |
| `RAM_WEAR` / `GRIND_WEAR` / `GRIND_RATE` | 12 / 4 / 1 | wear per ram, wear/s grinding, boulder hp/s ground |
| `BLAST_TIME` | 1.2 | seconds of holding BLAST per boulder |
| `OBSTACLE_GAP_START` → `MIN` over `GAP_DEPTH` | 90 → 22 m over 1500 m | boulder spacing |
| `HARD_*` | start 120 m, 35% per 60 m, heat×2, wear×3, cap 0.7 | hard rock bands |
| `HEAT/WEAR_ALERT`, `HULL_ALERT` | 70 / 70 / 35 | alert thresholds |
| `CREW_SPEED` | 32 | crew walk speed (world px/s) |
| `VIEW_PAN_MS` / `INSIDE_ZOOM` | 650 / 2 | camera transition |

`LAYOUT` holds the ship and room geometry plus the two camera targets (`OUTSIDE_CAM`, `INSIDE_CAM`).

## Testing

`tests/e2e.mjs` drives the game in headless Chromium at a 390×844 phone viewport with touch emulation. It uses real taps and touch-holds for the throttle, view toggle, room taps, and station actions. Debug pokes (via `window.__drill`) are used only to set up states quickly. Needs `npm i playwright && npx playwright install chromium`, and a server on port 8765.
