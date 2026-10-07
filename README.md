# Drill (working title): prototype v0.2

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
| **Outside** (drill face) | Throttle slider on the right (drag/tap), or the `+` / `-` buttons. **This only works while someone is at the HELM.** The green part of the track is "safe to hit a boulder" speed. Tap the ship or **INSIDE** to go in. |
| **Inside** (cutaway) | Tap a room (ENG / HELM / DRL / TLS) to walk there. At the HELM the action area is a horizontal throttle (drag, or `-` / `+`). At other stations you **hold** the action button. **OUTSIDE** goes back. |
| **Bottom bar** (both views) | View toggle, pilot status (`PILOT AT HELM` / `PILOT EN ROUTE...` / a **`NO PILOT: GO TO HELM`** button), and the current speed setting (with a lock icon when nobody is piloting). |

Optional desktop keys: `W/S` or arrow keys for throttle (only when piloted), `Space` to toggle the view, `1/2/3/4` to pick a room (ENG/HELM/DRL/TLS), `E` (hold) for the primary action, `Q` (hold) to blast, `R`/`Enter` to restart.

## Mechanics

* **HELM (FTL-style pilot station)**: the throttle only responds while the crew member is *standing* at the helm (walking doesn't count). Each run starts at the helm.
  * When the crew leaves, the throttle **locks at its last setting**, so the ship keeps drilling at that speed. A toast shows `NO PILOT: SPEED LOCKED 50%`.
  * Outside, the slider turns grey and shows a lock with `NO PILOT`. Inside, the helm controls disappear with the crew. In both views the bottom bar shows a red **NO PILOT: GO TO HELM** button and a lock next to the speed.
  * Tapping a locked throttle (slider or +/-) shakes it, shows `NO PILOT! TAP GO TO HELM`, and flashes the GO TO HELM button. That button is a one-tap shortcut that walks the crew back to the helm (you can stay outside and watch the throttle unlock when they arrive).
  * The HELM's room gets a `!` bubble when a boulder is ahead and the throttle is above the safe ramming speed.
  * Layout: four rooms in one row, ENG | HELM | DRL | TLS. The helm sits next to the two most-visited stations, so most trips are one room (about 0.65 s) and the longest trip (ENG to TLS) is about 2 s. Set `PILOT_REQUIRED: false` to go back to the old "throttle anywhere" behaviour.
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
* **Alerts**: the HUD icons (hull, heat, bit, boulder, hard rock) show in both views, along with the pilot status in the bottom bar. In the inside view, yellow `!` bubbles float over the room that needs you. A red light blinks on the hull exterior, and toast messages show up under the top bar.
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
    UIScene.js             HUD overlay: depth, bars, alerts, toasts, throttles (outside + helm), station panel, pilot bar
    GameOverScene.js       results + restart
  systems/
    ShipSystems.js         pure numbers: speed, depth, heat, wear, hull, leaks (no rendering)
    Terrain.js             scrolling rock/tunnel tiles, depth tint, hard-rock bands
    Obstacles.js           boulder spawn/scroll, ram / grind / blast
    Ship.js                ship visuals: 4-room interior cutaway, stations, exterior, drill, room tap zones
    Crew.js                crew member walk/work state machine
    ViewController.js      camera pan/zoom between outside and inside
    PixelFont.js           runtime-generated 3x5 bitmap font ('pixel')
    Textures.js            all procedural placeholder art
  ui/
    Button.js              touch button with tap + press-and-hold
tests/e2e.mjs              Playwright phone-viewport test (see below)
screenshots/               outside piloted / outside no pilot / inside at helm / game over
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
| `CREW_SPEED` | 40 | crew walk speed (world px/s); one room is about 0.65 s |
| `START_ROOM` | `'helm'` | where the crew starts each run |
| `PILOT_REQUIRED` | true | throttle only works with the crew at the helm |
| `LOCK_TOAST_COOLDOWN` | 900 | ms between "NO PILOT" toasts when you tap a locked throttle |
| `VIEW_PAN_MS` | 650 | camera transition |

`LAYOUT` holds the ship and room geometry (the ship is now 112 px wide with four 25 px rooms) plus the two camera targets (`OUTSIDE_CAM`, zoom 1; `INSIDE_CAM`, zoom 1.5 so the wider ship fits on screen).

## Testing

`tests/e2e.mjs` drives the game in headless Chromium at a 390×844 phone viewport with touch emulation. It uses real taps and touch-holds for both throttles, the view toggle, room taps, station actions, the locked throttle, and the GO TO HELM shortcut. Debug pokes (via `window.__drill`) are used only to set up states quickly.

```bash
npm i playwright && npx playwright install chromium   # in any folder with node_modules
node tests/e2e.mjs [baseUrl] [screenshotDir]          # default http://localhost:8765/ and ./screenshots
```
