# Drill (working title): prototype v0.6 (M2 + unlocks and transition cutscenes)

An endless, portrait, pixel-art drilling game for phone browsers. You pilot a drill ship that bores **upward** through an alien planet and keep it alive by running your one crew member between stations. Your score is depth. Every 1000 m you clamp onto a relay and choose: push on for better pay, or cash out. Between contracts the rig docks at an orbital station: that docked interior is the home screen, where you swap parts and buy new ones. Design doc: [`docs/DESIGN.md`](docs/DESIGN.md).

Built with **Phaser 3.90** (vendored at `lib/phaser.min.js`). It uses plain ES modules, has **no build step and no external assets**, and can be served from any static host (GitHub Pages ready).

## Run locally

```bash
cd drill-game
python3 -m http.server 8000
# open http://localhost:8000 (on a phone: http://<your-LAN-ip>:8000)
```
ES modules don't load over `file://`, so you need a server.

## How to play

**Flow:** title → **docked rig** (home) → HELM: accept a contract → *descent cutscene* → run → relay breaks → cash out or hull loss → *ascent cutscene* → end-of-run summary over the docked rig → **back to the docked rig**.

**Transition cutscenes** (pixel art, built from the rig's own textures; **tap anywhere to skip**):
* **Descent (2.6 s):** clamps release and the rig drops away from the orbital station toward the rust planet, which grows beneath it. Cut to the surface at dusk: the rig drops nose-first with thruster exhaust, the drill bites into the rock (chips, shake, spinning bit), and it sinks into its hole. Then the run starts.
* **Ascent (2.6 s, after a short in-run beat: 0.5 s fade on cash out, or 1.0 s pod ejection on hull loss):** at the surface, the rig is winched out of the bore hole on the gantry cable. If the hull was lost, the escape pod launches out instead. Cut to space: it climbs to the station's docking port and the clamps engage ("CLAMPED"). Then the run summary opens over the docked rig.
* `?anim=0` turns them off (the old flow: summary over the run, and straight into the run from the contract board).

**Docked rig (home base).** It's the same 2x2 interior. Tap a room or prop and Holt walks there, using the same pathing as in a run. The menu opens when he arrives:

| Tap | Opens |
|---|---|
| **HELM** | Contract board (one Kessa-4 contract for now; M3 adds planets from `src/data/contracts.js`), the **HELM PART** slot, and **radio replay** of Ines's past messages (paged). |
| **DRL** | Drill head slot. **The shelf** (top-left of DRL) opens the codex stub (M4). |
| **ENG** | Engine slot. **The cot** by the ladder opens Holt's log: credits, total earned, best depth, contracts, cash-outs, rigs lost, relays reached, deepest relay, parts owned, and the current loadout. |
| **TLS** | The tools bench, with 3 slots: Tools, Hull, Holt's kit. |
| **Ladder hatch** (or the **STATION** button) | The station concourse: **Quartermaster** (the parts vendor), Survey office (M3 stub), and Ines's window (stub). |


| View | Controls |
|---|---|
| **Outside** (drill face) | Throttle slider on the right (drag/tap), or the `+` / `-` buttons. **This only works while someone is at the HELM.** The green part of the track is "safe to hit a boulder" speed. Tap the ship or **INSIDE** to go in. |
| **Inside** (cutaway) | Tap a room (HELM / DRL on the top deck, ENG / TLS on the bottom deck) to walk there. At the HELM the action area is a horizontal throttle (drag, or `-` / `+`). At other stations you **hold** the action button. **OUTSIDE** goes back. |
| **Bottom bar** (both views) | View toggle, pilot status (`PILOT AT HELM` / `PILOT EN ROUTE...` / a **`NO PILOT: GO TO HELM`** button), and the current speed setting (with a lock icon when nobody is piloting). |

Optional desktop keys: `W/S` or arrow keys for throttle (only when piloted), `Space` to toggle the view, `1/2/3/4` to pick a room (HELM/DRL/ENG/TLS), `E` (hold) for the primary action, `Q` (hold) to blast, `R`/`Enter` to restart.

**Debug/playtest URL params:** `?anim=0` skips the cutscenes. `?unlock=all` unlocks every part. `?credits=5000` sets your credits. `?own=all` (or `?own=widecut,plating`) owns parts. `?stock=id,id,...` forces the Quartermaster's stock. `?wipe=1` clears the save. `?depth=950` starts the run at 950 m (relay 1 is 50 m ahead). `?boosts=plate,coolant,charge` fixes the relay supply offers (ids in `src/data/boosts.js`). In the console, `__drill.scene.getScene('Game').debugJump(1980)` jumps mid-run and keeps the haul.

## Mechanics

* **HELM (FTL-style pilot station)**: the throttle only responds while the crew member is *standing* at the helm (walking doesn't count). Each run starts at the helm.
  * When the crew leaves, the throttle **locks at its last setting**, so the ship keeps drilling at that speed. A toast shows `NO PILOT: SPEED LOCKED 50%`.
  * Outside, the slider turns grey and shows a lock with `NO PILOT`. Inside, the helm controls disappear with the crew. In both views the bottom bar shows a red **NO PILOT: GO TO HELM** button and a lock next to the speed.
  * Tapping a locked throttle (slider or +/-) shakes it, shows `NO PILOT! TAP GO TO HELM`, and flashes the GO TO HELM button. That button is a one-tap shortcut that walks the crew back to the helm (you can stay outside and watch the throttle unlock when they arrive).
  * The HELM's room gets a `!` bubble when a boulder is ahead and the throttle is above the safe ramming speed.
  * Set `PILOT_REQUIRED: false` to go back to the old "throttle anywhere" behaviour.
* **Ship layout (2 decks, 2x2 rooms around a hub)**:
  ```
          /\        drill nose
   +------+--+------+
   | HELM |  | DRL  |   top deck (nearest the drill)
   |------|==|------|   == grate deck plate over the ladder shaft
   | ENG  |##| TLS  |   bottom deck   (## = ladder)
   +------+--+------+
  ```
  * **Same-deck trips** (HELM↔DRL, ENG↔TLS) walk straight across the floor, over the grate on the top deck, with no climbing: 32 px at `CREW_WALK_SPEED` 48, about **0.68 s**.
  * **Cross-deck trips** (all other pairs) walk 16 px to the ladder, climb directly floor to floor (28 px at `CREW_CLIMB_SPEED` 70, with no stop), then walk 16 px out: 60 px, about **1.07 s**. The diagonal trips (e.g. HELM↔TLS) take the same time as the straight-down ones (HELM↔ENG), because every stand spot is `STAND_OFFSET` = 16 px from the ladder.
  * **Retargeting** re-plans from where the crew is:
    * On a deck, same-deck targets mean walking straight there (including turning straight back); other-deck targets mean walking to the ladder and climbing once.
    * On the ladder, the crew continues or reverses straight to the deck the new target is on, then walks out.
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
* **Earnings (haul)**: every metre pays `PAY_PER_METER` × the segment's pay multiplier. Segment 1 pays ×1.0, and each relay you push past adds `PAY_MULT_STEP` (×1.5, ×2.0, ×2.5…). The HUD shows the haul (`123 CR`) and `PAY X1.5` under the depth.
* **Relays (every `RELAY_INTERVAL` = 1000 m)**:
  * At 50 m out, Ines pings `INES: RELAY WINDOW IN 50M.`, and a dashed cyan `RELAY N` line scrolls toward the drill.
  * The approach is boulder-free: no boulder or hard band is spawned that would reach the drill between 50 m before and 30 m after a relay.
  * The rig stops **exactly** on the relay and clamps in. Speed and throttle go to 0 (the throttle setting is remembered), the simulation pauses, and **heat and bit wear are reset for free**.
  * **Break screen**: Ines's dispatch message types in over radio static (tap the box to skip). You pick **1 of 3 random relay supplies**, which last the whole run and stack. Then you can buy hull from the haul (+10 or MAX). It costs `REPAIR_COST_BASE` × `REPAIR_COST_GROWTH`^(relay−1) per point: **4, 6, 9, 13.5, 20.3… CR/pt**. The screen shows the next segment's pay and a cash-out preview.
  * **PUSH ON**: pay goes up, and the next relay is 1000 m further. The throttle goes back to the setting it had when you arrived, wherever Holt is standing, and the rig ramps back up from the stop at the normal acceleration.
  * **CASH OUT**: you're winched up and bank `floor(haul × 1.10)`.
* **Relay supplies** (`src/data/boosts.js`, 3 distinct offered per relay; repeats are possible across relays): COOLANT CANISTER (vent +30%), SPARE BIT (auto-swaps when the bit hits 100%), CHARGE PACK (blast 2× faster), PLATE KIT (+15 max hull and +15 now), SCANNER TUNE-UP (boulder warnings 50% earlier), GOOD BOOTS (walk/climb +15%), HEAT SINK (heat −15%), HARDENED TEETH (wear −15%), PATCH COMPOUND (patch +40%), SHOCK STRUTS (ram damage −20%).
* **Hull loss**: the rig is lost. The crew cab ejects as an escape pod and rides the bore back, and you bank `floor(haul / 3)`.
* **End screen**: CASHED OUT or RIG LOST. It shows depth, best depth (`localStorage['drill.bestDepth']`), relays reached, the breakdown (haul, +10% bonus or −2/3 lost, banked, total credits), Ines's sign-off, and **NEW CONTRACT**.
* **Loadout (6 slots, one part each)**: drill head, engine, hull, tools, helm, Holt's kit.
  * Every slot starts with its stock part, which is the M1 balance. Every other part is a **sidegrade with a real downside**.
  * Parts are bought once and kept. You can swap them **only while docked**: the run locks in the loadout at contract start, and `equipPart` refuses while a run is active.
  * Effects fold into the same `mods` object as relay supplies (`src/data/parts.js` → `applyParts`).
  * Top speed is a real speed. Heat follows the *real* speed squared, and the safe-ram limit is a real speed too. So a faster bit runs hotter and has a narrower green zone on the throttle, while a slower bit gets a wider one.

| Slot | Part | Price | Upside | Downside |
|---|---|---|---|---|
| Drill head | Survey bit (stock) | – | balanced | – |
| | Wide-cut bit | 900 | top speed +25% | heat +35%; safe ram zone shrinks (35% → 28% throttle) |
| | Diamond-core bit | 700 | bit wear −40% | top speed −15% |
| | Grinder head | 600 | safe ram speed 0.35 → 0.50 | grind wear +40%; top speed −10% |
| Engine | K-9 engine (stock) | – | balanced | – |
| | Overdrive turbine | 650 | acceleration +60% | coolant leaks hit 2× harder |
| | Cold-loop engine | 600 | passive cooling ×2 | acceleration −30% |
| | Bypass valve | 550 | overheated speed cap 40% → 70% | overheat hull damage ×2 |
| Hull | Standard plate (stock) | – | 100 hull | – |
| | Heavy plating | 800 | +40 max hull | acceleration and braking −35% |
| | Ablative skin | 700 | ram damage −40% | patching 50% slower |
| | Light frame | 500 | acceleration and braking +35% | −25 max hull |
| Tools | Bench kit (stock) | – | patch + 1.2 s blast | – |
| | Heavy charge | 750 | one blast clears every boulder in view | 3 s charge |
| | Patch foam | 550 | patch rate +80% | no blasting at all |
| | Quick capacitor | 600 | blast charges in 0.5 s | each blast adds +15 heat |
| Helm | Basic console (stock) | – | standard warnings | – |
| | Long scanner | 600 | boulder warnings 2× earlier | heat +15% |
| | Dead-man governor | 450 | with no pilot and rock close ahead (boulder or hard band), drops the throttle to safe speed | trips on any rock; stays at safe speed until Holt is back at the helm |
| | Cable linkage | 700 | throttle works from HELM **or DRL** | top speed −15% |
| Holt's kit | Work boots (stock) | – | standard | – |
| | Climbing harness | 350 | climb speed +50% | walk speed −15% |
| | Light boots | 350 | walk speed +25% | climb speed −20% |
| | Tool belt | 450 | vent, fix and patch 25% faster | climb speed −25% |

* **Quartermaster (rotating stock)**:
  * It offers **2 parts per slot (12 total)**, drawn at random from the *unlocked*, *unowned*, non-stock pool. If a slot's pool is short, it shows what's left. A sold-out slot means you own everything for it.
  * The stock **refreshes after every contract**, whether you cash out or lose the rig.
  * **Reroll** costs 100 → 200 → 400… (doubling) and resets when the stock refreshes. A reroll always changes something when the pool allows.
  * Tap an offer to see its full upside, downside, what it replaces, and the price. Then choose **BUY + EQUIP** (one tap) or **BUY ONLY**.
* **Unlocks (milestones)**: one alternative per slot is buyable from the start. The others open as your **best depth** (any contract) or **lifetime relays** grow, then join the Quartermaster's rotation. A purple **NEW PARTS AVAILABLE** notice shows once at the dock (tap to dismiss, gone after 4 s). Unlocks are permanent, and owned parts always count as unlocked (grandfathered).

  | Unlocks at | Parts |
  |---|---|
  | Start | Diamond-core bit, Cold-loop engine, Ablative skin, Patch foam, Long scanner, Light boots |
  | Best 500 m | Climbing harness, Light frame |
  | Best 1000 m | Grinder head, Dead-man governor |
  | Best 1500 m | Overdrive turbine, Quick capacitor |
  | Best 2000 m | Heavy plating, Bypass valve |
  | 3 relays (lifetime) | Tool belt |
  | Best 2500 m | Cable linkage |
  | Best 3000 m | Wide-cut bit, Heavy charge |

  Locked parts are listed on the Quartermaster's **LOCKED** page ("REACH 3000M"), on each slot screen, and as **NEXT UNLOCK** in the vendor and Holt's log.
* **Save** (`localStorage['drill.save']`, v3):
  * Contents: credits, total earned, runs, cash-outs, rigs lost, relays reached, deepest relay, best depth per planet, owned parts, loadout, vendor stock and reroll count, unlocked parts (plus a pending NEW PARTS notice), and Ines's radio log (last 40).
  * **Migration**: a v1 save (M1) keeps its credits and stats, and the old `drill.bestDepth` key is folded into `best.kessa4`. A v2 save (M2) becomes v3: milestones it already reached open silently, owned parts are grandfathered, and an old stock with now-locked parts is re-drawn. No save is ever wiped by an upgrade.

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
    DockScene.js           docked home base: Dock (rig interior, Holt walks, props) + DockUI (HUD, menus: contracts, radio, slots, stats, codex, station, Quartermaster)
    RelayScene.js          relay break: Ines dispatch (typing/static), supply pick, repair, push on / cash out
    CutsceneScene.js       transition cutscenes: descent (station -> planet -> drill bites) and ascent (winch / pod -> station -> clamps), tap to skip
    GameOverScene.js       end screen: cashed out / rig lost, earnings breakdown, back to the rig
  data/
    boosts.js              relay supplies + drawBoosts()
    parts.js               6 slots, 24 parts (6 stock + 18 sidegrades), unlock milestones, applyParts()
    contracts.js           planets/contracts for the HELM board (M3 extends)
    dispatch.js            Ines's relay messages (1-4 + fallbacks), ping, sign-offs
  systems/
    Settings.js            URL settings (?anim=0)
    Save.js                localStorage save v3 + migration, unlocks, vendor stock/reroll/buy, equip (blocked mid-run), radio log, URL shortcuts
    ShipSystems.js         pure numbers: speed, depth, heat, wear, hull, leaks (no rendering)
    Terrain.js             scrolling rock/tunnel tiles, depth tint, hard-rock bands
    Obstacles.js           boulder spawn/scroll, ram / grind / blast
    Ship.js                ship visuals: 2-deck 2x2 cutaway + hub ladder, stations, exterior, drill, room tap zones
    Crew.js                crew member: hub-routed path planning, walk/climb/work animation
    ViewController.js      camera pan/zoom between outside and inside
    PixelFont.js           runtime-generated 3x5 bitmap font ('pixel')
    Textures.js            all procedural placeholder art
  ui/
    Button.js              touch button with tap + press-and-hold
tests/e2e.mjs              Playwright phone-viewport test (see below)
screenshots/               01-07 run + relay screens; 08 docked base, 09 Quartermaster, 10 part swap, 11 stats, 12 buy detail; 13 launch (winch out of the bore), 14 docking (clamps), 15 descent (drill bites), 16 locked parts
docs/DESIGN.md             game design doc
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
| `CREW_WALK_SPEED` | 48 | crew speed on deck floors (world px/s); same-deck trip about 0.68 s |
| `CREW_CLIMB_SPEED` | 70 | crew speed on the hub ladder; cross-deck trip about 1.07 s |
| `START_ROOM` | `'helm'` | where the crew starts each run |
| `PILOT_REQUIRED` | true | throttle only works with the crew at the helm |
| `LOCK_TOAST_COOLDOWN` | 900 | ms between "NO PILOT" toasts when you tap a locked throttle |
| `VIEW_PAN_MS` | 650 | camera transition |
| `RELAY_INTERVAL` | 1000 | metres between relay breaks |
| `RELAY_WARN` / `RELAY_CLEAR_AFTER` | 50 / 30 | Ines's warning distance; the no-spawn window runs from 50 m before to 30 m after each relay |
| `PAY_PER_METER` / `PAY_MULT_STEP` | 1 / 0.5 | credits per metre × (1 + 0.5 × relays passed) |
| `CASHOUT_BONUS` / `HULL_LOSS_KEEP` | 0.10 / 1/3 | cash-out bonus / fraction kept when the rig is lost |
| `REPAIR_COST_BASE` / `REPAIR_COST_GROWTH` / `REPAIR_STEP` | 4 / 1.5 / 10 | hull price per point at relay 1, growth per relay, small repair button size |
| `BOOST_CHOICES` | 3 | supplies offered per relay |

`LAYOUT` holds the ship geometry: an 86×62 px hull with a 24 px drill nose (tip at y 218), deck ceilings and floors (`DECKS`), `ROOM_W` 33, the hub/ladder column (`HUB`), and `STAND_OFFSET`. It also holds the two camera targets: `OUTSIDE_CAM` at zoom 1, and `INSIDE_CAM` at **integer zoom 2**, which fits the whole ship between the HUD and the station panel so every pixel is the same size. `ROOM_GEOM` (derived) gives each room's x, floor, station and stand spot, and is shared by the ship, the crew, and the exterior art.

## Testing

`tests/e2e.mjs` drives the game in headless Chromium at a 390×844 phone viewport with touch emulation. It uses real taps and touch-holds for both throttles, the view toggle, room taps, station actions, the locked throttle, and the GO TO HELM shortcut. It also checks the route for each trip type: same-deck plans are a single straight walk, and cross-deck plans are exactly one direct floor-to-floor climb with no mid-ladder stop. It walks all 12 ordered trips by tapping rooms and checks the measured walk and climb distances and times (same-deck 0.6–0.8 s, cross-deck at most about 1.1 s). It also tests retargeting mid-climb (reverse, or continue) and mid-walk, confirms the ship fits the 2x inside view, and checks that `!` bubbles sit over the correct rooms. **M1 coverage**:
* Haul pays metres × 1.0, and then × 1.5 after pushing on.
* The approach: it jumps to 930 m, and Ines's warning fires at 50 m out. No spawns arrive in the relay window.
* The rig stops at exactly 1000 m, with heat and wear reset and the sim paused.
* The dispatch types out in full, and there are 3 distinct offers. Tapping PLATE KIT applies +15 max hull, and only 1 pick is allowed.
* Repair costs 4 CR/pt at relay 1 (+10 hull costs 40) and 6 CR/pt at relay 2.
* PUSH ON resumes the run: the throttle equals the pre-relay setting, speed ramps up from 0, and the helm throttle works.
* CASH OUT banks `floor(haul × 1.1)` into `drill.save` and sets the new best (2000 m).
* Hull loss banks `floor(haul / 3)` and launches the escape pod.
* After a reload, the title shows your credits.

**M2 coverage**:
* The flow: title → dock → HELM → ACCEPT CONTRACT → run, then end screen → BACK TO THE RIG.
* Dock navigation: Holt walks to ENG, the cot, the DRL shelf, TLS, HELM and the hatch, and the right menu opens on arrival.
* Vendor stock: 12 offers, 2 per slot, never stock or owned parts; it's randomized across draws and refreshed per contract.
* Shortcuts: `?credits=` and `?stock=` work.
* Reroll costs 100 and the next costs 200.
* Buying: the buy screen shows the upside and downside. BUY + EQUIP and BUY ONLY both spend credits and persist. A part that isn't in stock can't be bought.
* Equipping works from the part swap screen and survives a reload.
* Part effects in a run:
  * Heavy plating: 140 max hull, acceleration and braking ×0.65.
  * Wide-cut: about 50 px/s at full speed, heat ×1.35, safe ram zone 28%.
  * Light boots: same-deck walk 0.55 s, slower climbs.
* Swapping is blocked mid-run and allowed again once docked.
* Migration: a v1 save plus the old best-depth key become v3 with credits, stats and best intact.

**Unlocks + cutscenes coverage** (the main flow runs with `?anim=0`; the cutscene section runs with them on):
* Cashing out at 2000 m unlocks exactly the 500–2000 m parts, and the dock shows NEW PARTS AVAILABLE with their names once.
* The vendor never offers a locked part (live stock, plus 200 random draws). The LOCKED page lists what's left with its condition.
* Thresholds: 499 vs 500, 999 vs 1000, 2999 vs 3000 m, and 3 lifetime relays for the tool belt.
* Grandfathering: a v2 save that owns Wide-cut and Heavy charge at best 600 m keeps them owned and equipped, and its stale stock is re-drawn from unlocked parts.
* A fresh save has 12 locked parts and a 6-offer stock of starters.
* Descent plays on ACCEPT and ends in the run; cash out plays the ascent and ends docked with the summary on top; BACK TO THE RIG reveals the dock. Each takes under 3.1 s (measured 2.6 s).
* Tap-to-skip works on the descent (straight into the run) and on the escape-pod ascent (docked + RIG LOST summary).

Debug pokes (via `window.__drill`) are used only to set up states quickly.

```bash
npm i playwright && npx playwright install chromium   # in any folder with node_modules
node tests/e2e.mjs [baseUrl] [screenshotDir]          # default http://localhost:8765/ and ./screenshots
```
