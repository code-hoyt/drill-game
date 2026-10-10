# Drill: Game Design Doc

Working draft v0.3 (2026-10-07). This version folds in all of Cletus's answers so far; there are no open questions left. Nothing in here is built yet beyond what the current prototype already does.

**Legend**
- **[C]** marks Cletus's decision. Treat it as fixed.
- **[P]** marks a proposal. Change or cut it freely.
- Names are placeholders unless marked [C].

**[C]** "Drill" stays as the working title.

---

## 1. Premise and world

- **[C]** The game is set in the future. You are a lone contract driller sent by a mining company to bore into planets.
- **[C]** A human runs the rig because AI is considered fallible and hackable. The industry concluded a human operator is the safest option. AI may appear later (for example, as an assistant), but not now.
- **[C]** The tone is lonely and melancholy, like *Far: Lone Sails*. A company dispatch radio is the only other voice, and the rock layers tell each planet's history.

**[P] The company.** Placeholder name: *Meridian Deep Contracting*. It's a mid-size outfit that subcontracts survey bores for bigger mining houses. You get paid per metre plus bonuses for finds. The company isn't evil; it's indifferent, and that indifference carries the melancholy.

**[P] Why humans run the rigs.** Years ago an automated rig fleet was hijacked mid-bore; working name for it: *the Calder incident*. Afterwards the industry adopted the *Operator Clause*: every bore must have a human hand on the throttle. This is told only in fragments (codex entries and radio asides), never as an intro dump.

**[P] Orientation note.** On screen the rig drills *up*, because portrait framing needs the space ahead to be above the ship. In fiction it is going *down*. "Up the screen" means deeper, and the UI always talks about depth.

**[P] Tone rules**
- Long quiet stretches are fine.
- Radio messages are short.
- There's no music during normal drilling, only engine hum and grind. Music arrives at relay breaks and on special strata.
- Humour is dry and small.

## 2. The driller

- **[C]** There is one crew member only, and he has a personality: he mutters and reacts. More crew is possible later, but not now.
- **[C]** Holt stays as written below.
- **[C]** Holt lives on his rig.

**Holt.** He's a veteran contract driller in his fifties. He has done this too long to be scared of it, and he is not quite fine.

**Personality sketch**
- He talks to the rig and calls it "old girl." He hums when things are calm.
- His sense of humour is dry and aimed at the company and at himself.
- He's superstitious in small ways: he taps the console before a relay, and he doesn't say "last run."
- He misses someone back home but never says who directly. The details come out over many runs.
- He's quietly curious about the planets. He's the one who notices the fossils.

**[P] How the personality shows up in play** (all within one character)
- **Barks.** These are 2–6 word lines shown in a speech bubble above Holt in the inside view, and as a one-line subtitle in the outside view. They're triggered by events:
  - overheat: "Come on, breathe."
  - ram: "...that's coming out of my pay."
  - hull under 25%: "Not here. Not like this."
  - a find spotted: "Huh. Look at that."
  - a long calm stretch: hums
  - walking to the helm with nobody piloting: "Who's driving this thing."

  The system needs a cooldown (about 8 s minimum between barks), a priority order (danger beats flavour), and rules that keep lines from repeating within a run. Barks never block input.
- **Idle behaviour.** When nothing needs doing he sits at the helm, taps gauges, and leans on the tools bench.
- **Radio exchanges.** At relay breaks Holt answers Dispatch with one or two lines. Players don't pick his replies; his mood follows the run.
- **Strain.** A hidden 0–3 value derived from hull, heat, and recent rams. It only picks which bark pool to draw from (calm, tense, grim). It has no gameplay effect.

## 3. Run structure

- **[C]** Runs are endless. **Drill integrity** is the lose condition and depth is the score (the ship has no integrity meter; see "The drill and the ship" below).
- **[C]** The current mechanics stay: the helm, engine, drill, tools and siphon stations aboard Holt's ship (CORMORANT, a top-down ring-corridor layout; see 4.5), plus heat, bit wear, boulders, hard rock, and a throttle that locks when nobody is at the helm.
- **[C]** There's a break every 1000 m, and the interval is tunable.
- **[C]** You can cash out at relays.
- **[C]** Losing the drill keeps 1/3 of the ship's HOLD; the drill's HOPPER goes down with it.
- **[C]** Holt survives drill loss because the ship **breaks away** (this replaced the escape pod).

### [C] The drill and the ship: two machines (Kessa-4, v0.11)

Holt's ship is **CORMORANT** (see 4.5; she replaced the old box ship). The **DRILL** is a separate Meridian-leased boring unit (stencilled TB-6) whose collar seats in the ship's recessed throat: cutterhead and disc cutters, a shield with gripper pads, four thrust rams, a rear frame, the ore **HOPPER**, and a dock collar. Two folded clamp arms hold it, and two umbilicals (red power, blue coolant) plus a conveyor chute run between them. **The ship powers the drill.**

- **Only the drill has integrity.** The old HULL meter is now **DRILL INTEGRITY** (HUD `DRILL`, relay `+N DRILL` repairs, the plating parts add max DRILL). Heat, a dead bit, rams, collapses and surge blowouts all damage the drill. When it hits 0 the run is lost. (Internally the field is still `hull`, with `integrity` aliases.)
- **Hopper -> conveyor -> hold.** Everything you cut lands in the drill's capped **HOPPER** (120 units): cuttings (1 unit per metre, valued at the metre pay), vein ore (SMALL 10 / RICH 20 / FINE 24 units per vein) and scrap. A conveyor moves it continuously into the ship's **HOLD**, which is what you keep. Siphoned liquid goes straight to the ship's tank, and relays sell it into the hold.
- **Power split.** The ship's reactor has a fixed output (100). The drill draws power in proportion to its real speed (95 at full speed); the conveyor gets the rest at 0.08 units/s per spare unit. Full speed: 0.4 u/s against ~10 u/s coming in, so the hopper fills in ~12 s. 50%: 4.2 u/s against 5 in (slow creep). ~45% is break-even. A full stop gives the conveyor everything: 8 u/s, so a full hopper empties in ~15 s. The HUD shows the split as a vertical bar beside the throttle (CNV green on top, DRL orange below) and as a horizontal bar under the HELM slider.
- **Spill.** A full hopper **spills** new cuttings (lost, counted): `HOPPER FULL: SPILLING! EASE OFF` toast, `HOP SPILL!` flashing red in the top bar, a spill icon, ore spilling off the hopper lip, and floating `SPILL` pops. This is the new pacing pressure: flat-out driving earns fast but wastes ore unless you ease off or stop now and then.
- **Relays** clamp in and auto-unload the hopper into the hold (`HOPPER UNLOADED: N U, +X CR TO HOLD`).
- **Breakaway (drill loss).** The clamps release, the umbilicals snap, the ship leaves the bore in its own style (per ship, `breakaway` in `SHIPS`: CORMORANT backs off, **flips** and burns out on her mains; heavy or wide hulls **reverse** straight out on their retro jets, nose still to the drill; `?breakaway=flip|reverse` forces either), and the wrecked drill is left sparking. 2.4 s × ANIM_SCALE (1.2 s with `?anim=0`), skippable after the grace. Then the ascent shows the ship on its own.
- **"The lost drill comes out of your paycheck."** You bank 1/3 of the HOLD (after the tank is sold into it). The other 2/3 is the **DRILL WRITE-OFF**, and whatever was still in the hopper is **HOPPER LOST W/ DRILL**. The game-over summary shows SHIP HOLD, ORE / LIQUID, the write-off, the lost hopper and the banked total. A cash-out moves the hopper into the hold first and banks it +10%.
- **Vein collapse** loses half that vein's value: from the hopper first, the rest docked from the hold (the conveyor usually empties the hopper at a stop, so a hopper-only loss would be negligible).
- **Interior:** DRL is now the **drill console**: its default readout is `HOPPER n/120  BELT x.x/S`, and a monitor on the console's wall shows the hopper level, belt motion and the conveyor's power share. The hopper and collar are visible above the cutaway in the inside view, and the HOLD in the middle of the cutaway shows its fill level.
- **Parts:** the HULL slot is now **DRILL FRAME**. New depth-gated trade-offs: **BIG HOPPER** (DRILL FRAME, 650 cr, 1000 m): hopper 180, conveyor ×0.75. **HIGH-DRAW CUTTER** (drill head, 800 cr, 2500 m): +20% top speed, bit wear −20%, but draws 1.5× power, so the conveyor gets nothing at full speed.
- **Tuning:** one `POWER` block in `src/config.js`: `REACTOR 100, DRILL_DRAW 95, DRAW_EXP 1, CONVEYOR_RATE 0.08, HOPPER_CAP 120, ORE_PER_M 1, SPILL_FX_S 0.5`. Its ship numbers now come from the active ship's entry in `SHIPS` (CORMORANT's equal the old values).
- **Save v5:** `rigsLost` became `drillsLost` (the dock stats read `DRILLS LOST (BILLED)`); older saves migrate silently and depth-reached parts unlock.
- **[C] The drill is only seen attached ON THE JOB.** The TB-6 is Meridian's, not Holt's. It travels to the job site on its own (dropped from Meridian's freight cradle on the station truss), Cormorant docks onto it on the surface, and after a successful cash-out the ship unclamps cleanly and leaves it in the bore for Meridian to retrieve. At the station, Cormorant docks and sits in the bay alone. The coupled rig appears only in the run, the dock-on and bite of the descent, the opening of the clean exit, and the breakaway. The title card is key art of the rig at work. All of these draw from the same parts (`src/systems/ShipArt.js`: `rigParts`, `shipParts`, `drillParts`).

### Between relays: ore veins and decision events (prototype on Kessa-4, after Cletus's "boring after relay 1" note)

The leg between relays used to be meter upkeep (vent, fix bit, patch). Two additions give it moments and choices. Meter chores are toned down **[P]**: heat rate 7 → 5, coolant leaks every 40–65 s (was 25–45 s), bit wear 0.15 → 0.10 per metre.

**[C] Ore veins: the full-stop moment.**
- A seam of ore crosses the bore ahead. It's announced ~70 m out (toast `RICH VEIN AHEAD: FULL STOP AT IT`, an ore icon, and a top-right chip `RICH VEIN 38M`). It scrolls on screen at ~55 m, with a dashed centre line and a name/distance label beside the bore.
- Inside 45 m, **stop-window brackets** appear at the drill tip. The window runs from 4 m ahead of the tip to 2 m past it. The chip flashes `STOP ZONE: BRAKE!` while the vein is inside the window.
- **Full stop** (actual speed 0) with the vein inside the window gives `STOPPED AT VEIN`. Holt walks HELM → DRL (same deck, ~0.7 s) and **holds EXTRACT**. Ore credits flow into the haul at `value / secs` per second. The value is per type, × the segment pay multiplier.
- **Push your luck:** extracting raises the vein's instability. The rate grows the more you've taken. Release and it bleeds off (14/s). At 100 the vein **collapses**: hull damage (8/14/22), and half of what you took from that vein is lost. Stop early to bank a safe partial haul.
- **Overshoot / drill through at speed:** `VEIN LOST`, scrap = 10% of its value.
- Pull away mid-extraction and you keep what you took (`VEIN WORKED`).
- Types: SMALL (50 cr, 3 s, low risk, can be emptied safely), RICH (140, 5 s, collapses at ~75% without breaks), FINE (330, 6 s, collapses at ~50% without breaks). **[C] Risk is purely greed-driven**: there are no random tremor spikes, and a `VEIN UNSTABLE: EASE OFF?` warning shows at 70. Rich and fine get more common each leg. Veins come every 120–200 m (×0.85 per leg), with no boulders within 15 m of one and none in a relay approach.
- Economy check: a leg has ~5–6 veins. At ×1.0 that's roughly 250–600 cr of ore if you work them well, alongside ~1000 cr of metres. Ore is a big bonus that doesn't dwarf drilling, and a 2200–3500 cr part is still several contracts away. The haul is split at relays (`DRILL n  ORE n`) and on the end screen (`INCL. ORE (N VEINS)`).
- Rhythm: helm to brake → DRL to extract (the drill face is right there) → back to helm. Every walk is a same-deck trip.

**[C] A full stop is safe: "I can just stop and everything relaxes."** At actual speed 0 (throttle at 0, a jam stall, or a surge shutdown; not counting a relay clamp-in):
- No new events spawn, and the event timer pauses. When you move again, the next event is at least 4 s away.
- A pending power surge pauses its countdown. The card stays up and reads `STOPPED: COUNTDOWN PAUSED`, and you can still pick either option. (We chose this over auto-resolving it as a shutdown because the decision stays visible and nothing happens behind your back.)
- A jam builds no heat, there are no coolant leaks, and no drill damage ticks from overheating or a dead bit.
- Heat bleeds off fast: 6/s extra on top of the passive 1.2/s.
- Choices you make still cost: a vein collapse, or rocking a jammed bit.
- Calm cues: `ALL STOP` in the bottom bar, an `ALL STOP: HOLDING` chip (or `STOPPED AT VEIN`), alert icons dimmed and no longer blinking, room `!` bubbles dimmed, the red hull light off, and rock dust settling in the bore for a couple of seconds. Everything fades back on throttle-up.
- The only cost of stopping is lost time; nothing pays while you're stopped.

**[C] Side pockets + the SIPHON seat (Kessa-4).** Valuable liquid pockets sit in the bore wall beside the rig rather than ahead of the drill: a second kind of full-stop moment, with its own seat and its own gamble. **They form only in the wall on the ship's siphon side** (`siphonSide` per ship; CORMORANT: left, where her one hose port and reel are). That's the simplest sensible rule: one port, one wall. A hose reaching across the drill unit's bore would foul the clamps, so `?side=right` is coerced to the ship's side.
- **Warning:** a pocket spawns above the screen (~80 m before it lines up), glowing in its colour in the wall outside the bore. It comes with a toast (`RICH POCKET LEFT: STOP BESIDE IT`), a droplet icon, and a top-right chip `RICH POCKET L 38M` (the chip shows whichever of vein/pocket is closer). Inside 60 m an alignment bracket appears on the bore edge level with the **hose port**, with a dashed line from the pocket to the hull.
- **Alignment window:** the pocket's centre must be 4 m ahead of the port to 3 m past it, at a full stop (speed 0). Drive past (or through at speed) and it's `POCKET MISSED`, with no payout and no penalty. Once stopped, the hose runs out from the port to the wall, and **GO TO SIPHON** replaces the pilot button in the bottom bar (one tap sends Holt).
- **The SIPHON seat** sits by the hose port on CORMORANT's port side, off the ring corridor. It's a fifth station (`SIP`). Walks: HELM → SIP ~1.85 s (the long trip: out of the pod and round the ring), TLS → SIP ~1.07 s. Holt must be in the seat to pump.
- **Pumping:** hold **PUMP** (SIPHON panel: `TANK` and `PRESS` gauges). Liquid flows at 20 L/s into the tank, the pocket's liquid level visibly drops, and the hose shows flow. **PRESSURE** rises with sustained pumping (18/s × the type's factor, escalating +25% per second held) and falls 30/s when you let go. A warning toast shows at 75.
- **Burst at 100:** the line bursts. 30% of what's left in the pocket is lost, the deck sprays, the pump locks for 3 s, and pressure drops to 40. **There's no hull damage:** it's a pure greed cost, consistent with "a full stop is safe; the only risk is your own gamble."
- **Types:** SMALL (40 L, 60 cr, drains in 2 s with no burst risk), RICH (70 L, 150 cr; pumping straight through bursts at ~68 L, so take one breather), VOLATILE (rare, 50 L, 260 cr; pressure ×2.2, bursts after ~2 s, so pump in short pulses). Value scales with the segment pay. Rich and volatile get more common each leg. Pockets come every 160–260 m (×0.9 per leg) from 110 m on.
- **Tank:** 100 L, about 2–3 small pockets. A full tank blocks pumping (`TANK FULL: SKIP IT`). **Relays buy the tank:** `SOLD n L LIQUID: +x CR` goes into the ship's hold. **[C]** The tank is on the ship, so on drill loss it's sold into the hold before the 1/3 is kept. The relay reads `CUT n ORE n LIQ n`, and the end screen has an `ORE nV / LIQUID nP` row.
- **No overlaps:** pockets keep 25 m clear of vein stops and boulders (both ways), and stay out of relay approaches. Calm rules apply: pumping happens at a full stop, so events pause meanwhile.
- **SIPHON slot (7th slot):** stock HAND PUMP (balanced, 100 L). **BULK TANK** (500 cr, unlocks at 500 m): 160 L tank, pumps 30% slower. **HIGH-FLOW PUMP** (650 cr, unlocks at 1500 m): pumps 60% faster, but pressure builds 70% faster. All tuning lives in `SIPHON` in `config.js`.

**[P] Decision events** (time-based while you're moving; they pause at a full stop, see above):
- **[C] Fires removed** (v0.11). There is no fire event any more: no spawning, no EXTINGUISH, no fire visuals, no blocked stations, and `?event=fire` is a no-op. Leg 1 is jams only, with slightly longer gaps (36–52 s) so it isn't busier than before; the hopper/spill pacing fills the space.
- **DRILL JAM**: the bit seizes and the rig stalls (heat climbs if the throttle stays up). Two fixes: **rock the throttle** at the HELM (0% → 60%+, 3 times, within 4 s each; fast, but +6 heat and −2 hull per swing) or **hold FREE BIT** at DRL (3.5 s, free).
- **POWER SURGE** (new in leg 2; the first event after relay 1 is always this one): a 6 s prompt. **OVERCLOCK**: 10 s at ×1.4 speed and ×1.5 pay per metre, +25 heat and double heat rate. **SHUT DOWN**: the engine is off for 4 s and vents 35 heat. **Ignore it**: blowout down the umbilical, −15 drill, +40 heat.
- Frequency: an event every 36–52 s in leg 1, 24–36 s in leg 2, then 18–28 s. Jams only in leg 1, jam and surge from leg 2, at most two at once, none in a relay approach. A relay clamp-in clears them.
- Readability: the alert icons (spill / surge / jam / drill / heat / bit / boulder / hard rock / ore / liquid) sit top-left. Room `!` bubbles go up for a jam, a vein stop at DRL, or an aligned pocket at SIP. Toasts sit under the top bar, and the surge card sits mid-screen with a countdown.
- Gas pocket was considered and skipped; it overlaps the stop mechanic.

**Open questions:** should the surge be decided at the ENG station (spatial) instead of anywhere?

### [P] The break: relay anchors

Every 1000 m the contract calls for a **relay anchor**: a beacon bolted into the rock to keep the comm line and the survey data flowing. It works as a checkpoint plus a decision.

1. **Approach (950–1000 m).** Dispatch sends a text ping: "Relay window in fifty." No new boulders spawn in the last 50 m.
2. **Anchoring.** At 1000 m the rig auto-throttles to zero and clamps in. Heat and bit wear stop building.
3. **Relay screen.** This is an overlay on the quiet, anchored rig. Holt sits down and the music comes in.
   - **Service (free):** heat vents to 0 and the bit is swapped (wear goes to 0).
   - **Hull repair (paid from the haul):** the cost rises each relay (base 4 credits per 1% hull, ×1.5 per relay).
   - **Relay supply (pick 1 of 3):** a boost for the rest of the run. **[C]** The three offers are a random draw from the supply pool at every relay. Boosts stack, and they are the main way you get stronger within a run (see 4.3). Examples:
     - Coolant canister: +30% vent rate.
     - Spare bit: one instant full bit repair.
     - Charge pack: blasts charge 2× faster.
     - Plate kit: +15 max hull.
     - Scanner tune-up: earlier boulder warnings.
     - Boots: +15% walk and climb speed.
   - **Dispatch message:** one story beat plus the contract update, e.g. "Next segment pays ×1.5."
   - **The choice: PUSH ON or CASH OUT.**
4. **Undock.** If you push on, the throttle returns to the setting it had when you clamped in, the rig ramps back up from the stop, and the next segment starts. Difficulty keeps ramping by depth.

### Ending a run, and what you keep

- **Haul** is the money earned *this run*. It's 1 credit per metre times the segment multiplier, plus finds and salvage.
- **[P] Segment multiplier:** ×1.0 → ×1.5 → ×2.0 → ×2.5 and so on, rising at each relay you push past.
- **Cash out at a relay [C]:** Cormorant unclamps cleanly (no alarms, unlike the breakaway). The drill stays behind as Meridian's property for retrieval, and the ship flies home alone. **[P]** You keep the haul plus a **10% completion bonus**.
- **Drill loss [C]:** the ship breaks away from the wrecked drill and burns home; Holt keeps **1/3 of the hold** and the hopper is lost with the drill.
  - **[C]** The ship is Holt's and survives; the drill is Meridian's lease, and "the lost drill comes out of your paycheck" (the other 2/3, the DRILL WRITE-OFF). Meridian leases him a fresh drill for the next contract.
- **[C] Transitions (built after M2, retimed; reworked so the drill is only attached on the job):** the ascent is 4.6 s and the descent 5.6 s, both × `ANIM_SCALE` (currently 2, so about 9.2 s and 11.2 s). Each is followed by a short concourse beat (boarding or stepping out) and can be tapped to skip after a ~0.5 s grace. **[C] A 180° camera turn** bridges the run's drill-up view and the drill-down view outside.
  - **Descent (contract start), base ms (×2 at the current scale):**
    - 0–800: opens on the bay framing (ship alone) and turns out to the station.
    - 750: the station clamps release Cormorant.
    - 900: **Meridian's freight cradle** (an oxblood drop rail off the truss, right of the port) lets go of the TB-6. It falls separately: an unpowered drop kept straight by little guidance-thruster puffs. Both shrink toward the planet.
    - 1900: cut to the surface. The drill comes in alone, nose first, with a re-entry streak.
    - 2500: it **smashes down** (dust plume, debris, a flash, screen shake, a crater rim, `DRILL DOWN`).
    - 2650: Cormorant flies in and lines up over the collar.
    - 3350: she backs down onto it on her retros.
    - 3800: the clamps lock (`CLAMPS LOCKED`).
    - 4000: the umbilicals connect and the drill powers up (its status light turns amber, then green).
    - 4150: the bite. The rig sinks in.
    - 4300: the camera turns into the run.
    - 5600: control.
  - The descent is +1.0 s base (+2.0 s at the current scale) over the old 4.6 s, for the smash and dock-on beat.
  - **Ascent (cash-out), 4.6 s base:**
    - 150: from the run view, the clamps and umbilicals swing open cleanly (`UNCLAMPED`, green, no alarms). The drill's light drops to standby.
    - 600: Cormorant backs out of the bore alone on her retros while the camera turns. The TB-6 stays in the hole beside a blinking Meridian retrieval beacon (`TB-6 LEFT FOR MERIDIAN`).
    - 2000: cut to space. The ship alone rises to the station.
    - 3700: the clamps engage (`CLAMPED`).
    - 3850: the second turn ends on the concourse's docking-bay framing (ship alone, station below). Holt rides the airlock lift down, and **the summary comes after docking**.
  - **After a drill loss:** the in-run breakaway is unchanged, and the broken-away ship climbs out alone in its breakaway attitude.
- Depth reached is the score either way.
- **Always kept:** best depth per planet, codex finds (transmitted the moment you recover them), and unlocked parts and planets.

**[P] Math check (1/3 rule).** Assumptions:
- 1 credit per metre, before multipliers.
- No repairs bought.
- A failed push dies halfway through the next segment.

| Decision at relay | Haul now | Cash out now (+10%) | If you push and lose the hull | If you push and cash at the next relay | Break-even survival chance |
|---|---|---|---|---|---|
| Relay 1 | 1,000 | 1,100 | ~580 | 2,750 | ~24% |
| Relay 3 | 4,500 | 4,950 | ~1,920 | 7,700 | ~52% |
| Relay 5 | 10,000 | 11,000 | ~3,920 | 14,850 | ~65% |

- **Early relays:** pushing is almost always right.
- **Deep relays:** you need real confidence in your hull and loadout, which is the tension we want.
- **Effect of the 1/3 rule:** compared with 50%, it raises the deep-relay bar by about 10 points.
- **Farming check:** cashing out at relay 1 every time earns about 310 credits/min. A good run cashed at relay 3 earns about 450/min, and at relay 5 about 610/min. Pushing deeper pays best per minute, but only if you survive, so farming the first relay isn't optimal.
- **The bonus stays small on purpose.** A big flat cash-out bonus would make the first-relay farm better.

**Pacing:** a 1000 m segment takes 2.5–4 minutes, so a 3–4 relay run is a 10–15 minute session.

## 4. Progression and meta

**[C]** Upgrades are trade-offs and sidegrades, not permanent power growth. Credits still unlock new options and planets.

### 4.1 [P] Currency

- **Credits** are the only currency. You earn them from haul, find bonuses, and **salvage**: ore and crystal pockets in the rock, richest inside hard-rock bands.
- You spend credits on three things:
  - **Parts:** each one is bought once, after which it's available to equip.
  - **Survey licences** that open new planets. Each also needs a depth reached on the previous planet.
  - **Rig cosmetics:** interior paint, Holt's knick-knacks.
- Within a run, haul is also spent on relay hull repairs.

### 4.2 [P] Loadout slots and parts

**[C]** The rig has **7 slots**, one per system (the SIPHON slot was added with the side pockets). This leans into rig customization:

**Drill head · Engine · Hull · Tools · Helm · Siphon · Holt's kit**

- Every slot always holds exactly one part. The stock parts are today's balance and a fair choice anywhere.
- Buying a part adds it to your options; it doesn't make the rig stronger overall.
- You swap parts only while docked, never mid-run, so the loadout is a pre-run plan for a specific planet.

**[C] Rotating vendor stock.** The station Quartermaster offers a randomized stock that refreshes between contracts. Because you can only buy what's on offer, each playthrough's rig ends up different.

**[P] Implications and rules:**
- The stock is a few parts per slot (proposed: 2 per slot, so 12 items) drawn from the *unlocked* pool. Credits buy unlocks that widen the pool, and stock offers then come from that wider pool.
- At least one non-stock option per slot whenever the pool allows, so no slot is ever a dead end.
- The stock refreshes after every contract (cash-out or drill loss), so a bad run still turns the shop over.
- **Reroll:** you can pay credits to reroll the stock. The cost doubles with each reroll during one dock (100 → 200 → 400) and resets when the stock refreshes after a contract. It's a release valve, not a way to shop for exact parts. *(M2 reading of "once per dock" plus "doubles": repeat rerolls are allowed but get expensive fast.)*
- **Hold:** you can reserve 1 offered part across one refresh for a small fee, so you can save up for it. This is optional and can be cut if the shop feels fiddly.
- Owned parts stay owned. Randomness only affects what you can *add*, never what you lose.
- Relay boosts follow the same idea within a run: 3 distinct random offers per relay. Duplicates are allowed *across* relays, since boosts stack.

**Example parts.** Each has a real downside.

| Slot | Part | Upside | Downside |
|---|---|---|---|
| Drill head | **Wide-cut bit** | +25% max speed | heat build-up +35% |
| Drill head | **Diamond-core bit** | bit wear −40% | max speed −15% |
| Drill head | **Grinder head** | safe ramming speed 0.35 → 0.50 | wear +40% while grinding; max speed −10% |
| Engine | **Overdrive turbine** | acceleration +60% | coolant leaks hit twice as hard |
| Engine | **Cold-loop engine** | passive cooling ×2 | acceleration −30% |
| Hull | **Heavy plating** | +40 max hull | acceleration and braking −35% (harder to slow down for boulders) |
| Hull | **Ablative skin** | ram damage −40% | patching is 50% slower |
| Tools | **Heavy charge** | one blast clears every boulder on screen | charge time 3 s (vs 1.2 s); destroys finds in range |
| Tools | **Patch foam** | patch rate +80% | blasting unavailable |
| Helm | **Long scanner** | warnings twice as early; shows finds and voids | +15% heat build-up (power draw) |
| Helm | **Dead-man governor** | with no pilot, cuts the throttle to safe speed when a boulder is close | see below |
| Holt's kit | **Climbing harness** | climb speed +50% | walk speed −15% |
| Holt's kit | **Light boots** | walk speed +25% | climb speed −20% |

**[C] Built in M2:** 18 sidegrades, 3 per slot, so the 2-per-slot stock actually rotates. They are the 13 parts above, plus:
- Bypass valve (engine): overheated cap 70%, overheat damage ×2.
- Light frame (hull): accel and braking +35%, −25 max hull.
- Quick capacitor (tools): 0.5 s blast, +15 heat per blast.
- Cable linkage (helm): pilot from HELM or DRL, top speed −15%.
- Tool belt (kit): station work +25%, climb −25%.

Prices run 350–900 credits. A relay-1 cash-out is about 1,100. Not built yet: finds and voids on the Long scanner, and the Heavy charge destroying finds (both wait for M4 finds), plus the vendor **hold** option. The README lists the full table.

**[C] Part unlocks (approved after M2; Cletus left the specifics to us).** Not every sidegrade is buyable from day one. **One alternative per slot is open from the start**, and the rest unlock by **best depth on any contract** (and one by lifetime relays), as a steady trickle of roughly two parts every 500 m so there is always a next thing to chase:

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

- The starters are the gentlest trade-offs. The bigger swings (Wide-cut, Heavy charge, Cable linkage, Heavy plating) wait until you can survive them.
- The Quartermaster only draws from **unlocked, unowned** parts. The guarantees still hold: 2 per slot when the pool allows, otherwise what's left. A fresh save sees 6 offers (one per slot).
- Locked parts are shown on the Quartermaster's **LOCKED** page ("REACH 3000M"), on each slot screen, and as **NEXT UNLOCK** in the vendor and Holt's log.
- When something unlocks, the dock shows a brief **NEW PARTS AVAILABLE** banner once, after the run summary.
- Unlocks are permanent. **Owned parts are grandfathered** (always unlocked). Older saves silently open the milestones they already reached, with no banner.
- M3 can move the depth gates per planet. For now best depth means the best on any contract.

**The dead-man governor** is a mechanical spring limiter: "Approved under Clause 4(b): no decision-making components." Its costs:
- It **trips on everything**, including harmless rock and finds.
- **Once tripped, it stays at safe speed** until Holt walks to the helm and resets it, so you lose momentum.
- It **uses up the helm slot**, so you can't also run the Long scanner.

It suits careful players, and it's a trap on fast planets.

### 4.3 [P] What drives deeper runs, if not power growth

1. **Skill.**
   - routing Holt's trips (same-deck trips are fast, cross-deck ones slower)
   - setting the speed *before* leaving the helm
   - venting early
   - knowing when to grind rather than blast
2. **Loadout fit per planet.**
   - Vael's cold makes the Wide-cut bit's heat downside nearly free.
   - Orun's gas pockets reward a fast blast setup.
   - Heavy plating is good where rams are unavoidable and bad where you need to brake.
3. **Relay supplies.** These are the in-run power curve. A deep run has picked up 3–5 stacking boosts drawn at random, and that's where the roguelite "build" lives. Credits can add new supplies to the pool, but never make them stronger.
4. **Rig variety.** The rotating vendor stock means each playthrough's rig is assembled from different offers, so you adapt to what you got.
5. **Knowledge.** Codex entries for a zone describe its hazards ("Fossil Strata: voids common below 2,400 m"). Learning a planet makes you better on it.
6. **Goals.**
   - best depth per planet
   - contract bonus objectives
   - codex completion

### 4.4 Home base: the station concourse ([C] redesign, approved after M2)

**[C]** Holt lives on his rig. Between contracts it docks at an orbital station (Kessa High).

**[C] The home screen is the station concourse, not the rig's interior.** The old docked-interior home reused the run's 2x2 rooms for unrelated menu jobs, which was confusing, so it's gone. When the rig docks, Holt steps out through the airlock into the station.

**Layout (portrait, one screen; revised so you never lose your place):**
- **Concourse strip, bottom (always visible, always tappable):** a side-view corridor anchored just above the bottom bar, with five signed spots, left to right:
  - **Contract board:** mission select, data-driven from `contracts.js`.
  - **Ines's window:** dispatch. Her latest message, the radio replay, and a story stub.
  - **Airlock:** a lift up to the ship. It opens the rig bay.
  - **Quartermaster:** the vendor.
  - **Holt's bunk and locker:** the log (stats) and the codex shelf (stub until M4).
- **Content area, above:** by default, docking bay 3. **Cormorant sits alone** on the station roof, gripped by her engine end by two clamps over a docking collar (no drill: the TB-6 is Meridian's). This is exactly how the ascent cutscene frames her after its closing turn, so the cutscene hands off with the ship in the same spot. When Holt reaches a spot, **that spot's panel fills the content area only**, so the concourse, with Holt and the highlighted sign, always shows where you are.
- **Panels:** each has a header bar with the title, **X** (back to the bay view) and, on sub-panels, **<**. Anything longer than the area is paged: the Quartermaster shows 6 offers per page, locked parts 7, radio replay 2, contracts 2, and slot lists page if needed. Tap targets stay at least 14 base px tall, about 30 screen px.
- **Bottom bar:** where Holt is or where he's walking. Short toasts replace that line for a moment. The old legend block under the concourse is gone.
- **Walking:** tap a spot and Holt walks there. The open panel stays until he arrives, then swaps. Tapping the spot he's at closes to the bay view, or goes back to that spot's main panel from a sub-panel. Walking is fast (160 px/s, at most 0.9 s between any two spots) so it never feels like a chore.
- **Summary after docking:** shown in the content area. Closing it, or tapping any concourse spot, dismisses it.
- **Holt's kit:** it doesn't change concourse walking (that's a run stat).

**[C] Rig bay (garage).** You open it from the airlock, and it fits the content area. It shows **Cormorant alone** at 1x on her station clamps, with the airlock door and Holt's locker below. Beside her is a column of colour-keyed callouts (slot + fitted part). Tap a real part location, or its callout:
- the cockpit pod → helm
- the reactor dome + engine arc → engine
- the tool bay on the left flank → tools
- the hose port + reel on the left flank → siphon
- Holt's locker by the airlock → kit

**[C] Meridian drill yard.** The drill slots (drill head, drill frame) are on the TB-6, which is not on the ship off the job. So they live in a sub-panel: a **MERIDIAN YARD** window across the top of the rig bay shows the leased TB-6 small on its pad. Tapping the window, or the **DRILL YARD >** callout (which lists both fitted drill parts), opens **DRILL YARD**. There the TB-6 stands alone on its hazard-striped pad at 1x, with two hotspots and callouts:
- the cutterhead → drill head
- the frame, rams and hopper → drill frame

A slot list's **<** returns to where you came from (the yard for drill slots, the rig bay for ship slots).

Why a sub-panel: it keeps the ship-alone picture honest, keeps every slot one or two taps away, keeps all seven slots and their saves unchanged, and fits the fiction (you fit parts to Meridian's unit in their yard, and it's dropped to the job with them).

The hotspots are thumb-sized (at least 32×22 base px, about 70×48 CSS px on a 390 px phone), and swapping only works while docked.

**Transitions:**
- **Contract start:** Holt walks to the airlock and rides up. The descent opens on the bay framing and turns out to the drill-down station view.
- **Return:** the ascent ends on the bay framing. Holt rides the lift down, and the run summary opens in the content area.
- **Pacing:** one multiplier, `ANIM_SCALE` (config), stretches every cutscene beat. It's currently 2 (about 9.2 s ascent, 11.2 s descent) while Cletus evaluates the feel. The lift and skip grace stretch only modestly.

**Later:** a survey office (planet licences, M3) can join the concourse as a sixth spot. The concourse can slowly gain personal clutter around the bunk as you progress. That's the melancholy home beat, and it shows progression without numbers.

### 4.5 Ships ([C] CORMORANT is Holt's ship; the others are future ships)

Holt's ship is the tug that couples on behind the leased TB-6 and powers it. Every ship shares the coupling face: two folded clamp arms with orange jaw pads, a red power and a teal coolant umbilical, a hazard-framed conveyor intake under the drill's collar, forward retro jets, a siphon port with a hose reel on one flank, module mounts, nav lights and plenty of wear. Art direction: scrappy used-future (gunmetal, bleached cream, olive, dirty teal, oxblood; orange only as an accent). **No Firefly/Wren long exposed neck** on any of them.

**[C] Ships are smaller than drills.** The drill keeps its framing and the ship is drawn at ~70% scale (CORMORANT is 62×62 px behind the 90 px TB-6): a little tug pushing a big drill. The inside view is a separate zoomed schematic, so the interior is laid out at the full concept scale and stays readable. (The bottom bar grew to 1.75x height for thumbs, so the outside camera sits 8 px lower: drill tip at screen y 160 instead of 168, and the ship's engine glow still ends above the bar.)

**Per-ship stats** live in `SHIPS` in `src/config.js` (`reactor`, `drillDraw`, `drawExp`, `conveyorRate`, `hopperCap`, `holdCap`, `holdCapProposed`, `flipMs`, `breakaway`, `siphonSide`). `SHIP_ID` picks the active ship and `POWER` is derived from it, so a future ship slots in with its own numbers. **Hold caps are not enforced yet:** `holdCap` is `null` (the hold is unlimited); the proposed caps are design numbers only. The cutaway's hold gauge reads against the proposed cap.

**Breakaway style** (`breakaway`; aesthetics only, the timeline and payout are the same): `'flip'` turns 180° in the bore and burns out on the mains (light, round hulls); `'reverse'` lights the retro jets on the face and backs straight out down the bore, nose still to the drill, slower and heavier. Debug: `?breakaway=flip|reverse`.

Concept art for all four is in `docs/ships/` (`<n>-<ship>-ingame.png` in the bore at 3x, `-hero.png` with callouts, `.gif` animated, `-interior.png` floor plan, plus `contact-sheet.png`, `interiors.png` and `stats.json`). The concepts were drawn at full size with the rig lifted 32 px; the game keeps the drill framing and shrinks the ship instead. The in-game CORMORANT art is generated by `tools/ships/cormorant.py` into `assets/ships/` (preview: `docs/ships/cormorant-ingame-art-3x.png`).

| Ship | Reactor | Belt (u/s per spare power) | Conveyor full / half / stop (u/s) | Hold (proposed cap) | Breakaway | Flip | Average walk |
|---|---|---|---|---|---|---|---|
| **Cormorant** (in game) | 100 | 0.080 | 0.4 / 4.2 / 8.0 | 600 | flip | 0.5 s | 1.69 s (in game) |
| Brakeman | 120 | 0.070 | 1.75 / 5.1 / 8.4 | 450 | reverse | n/a | 1.57 s |
| Sister June | 92 | 0.095 | 0 (top speed 97%) / 4.2 / 8.7 | 900 | reverse | n/a | 2.05 s |
| Patience | 100 | 0.085 | 0.43 / 4.46 / 8.5 | 350 | flip | 0.7 s | 1.23 s |

Average walk = five key trips (HELM to DRILL, ENGINE, TOOLS and SIPHON, plus DRILL to ENGINE) at 48 px/s.

#### CORMORANT (in game): "A survey saucer with a throat that swallows the drill collar."
- **Look:** a bleached-cream saucer (a Magpie remix with a YT-1300 cue). Two forward mandibles frame a recessed coupling throat where the TB-6's collar seats; the right mandible tip is a gunmetal replacement plate. The cockpit pod sits off to the right on a short strut. Reactor dome aft-left with pulsing teal vents, an engine arc with three bells at the stern, an oxblood rim stripe, the siphon port + hose reel on the left flank, a sensor dish on one mount.
- **History:** a decommissioned Meridian survey saucer Holt bought at a scrap auction. He cut the survey bay out to make the throat, so the drill collar seats inside the hull.
- **Stats:** reactor 100, belt 0.08, hopper 120: the old POWER block exactly, so she's the reference ship. Proposed hold 600 (not enforced). Siphon side: left.
- **Breakaway: flip.** The mandibles let go cleanly and the disc spins on its axis.
- **Quirks:** the helm is out in the pod, so every trip from it starts with the crawl tube. HELM → TOOLS (1.96 s) and HELM → SIPHON (1.85 s) cross the ring.
- **Interior (in game, top-down FTL style):** a ring corridor round the central HOLD (it shows its fill level), the DRILL console forward behind the conveyor intake, TOOLS and the SIPHON seat on the port side, a bunk aft-starboard, ENGINE/REACTOR across the stern, and the HELM in the cockpit pod through a short crawl tube. The tube counts as climbing, so the kit parts' climb speed still matters there. Holt walks the corridor graph: every trip is doorway → ring (the shorter way round) → doorway, axis-aligned.
- **Game-scale fixes:** at 70% the details are simplified (fewer greebles, no stencil), the cockpit pod is kept large with a readable canopy, and the engine glow is drawn by the game and stops above the bottom bar.

#### BRAKEMAN (future): "Ex-army recovery tractor. Big reactor, straight corridors, slow to turn."
- **Look:** a faded-olive armoured brick with a chamfered nose (an Old Sarge remix): a heavy docking-ring nose with thick clamp arms, a slit canopy front-left, NO STEP hold doors behind the ring, a painted-over roundel, a big "07" and tally marks, a louvred reactor housing with teal glow through the slats, sponsons (a mismatched cream armour skirt on the left, the siphon port on the right), three engine bells under a heat shield.
- **History:** an army recovery tractor built to pull wrecked walkers out of trenches, hence the oversized reactor and a coupling ring rated far beyond the TB-6. Holt bought it as surplus; the old unit number never quite comes off.
- **Stats:** reactor 120 (even flat out the conveyor still moves 1.75 u/s), belt 0.07, break-even at 50%, proposed hold 450. Siphon side: right.
- **Breakaway: reverse.** A heavy recovery tractor doesn't turn in a bore: she grinds back out on her retros, slowly, so a late breakaway is riskier.
- **Quirks:** the old belt means a full stop drains no faster than the others.
- **Interior:** one cross passage behind the helm, hold and drill console, then a spine aft to the engine room. Tools and siphon are off the spine, bunk and lockers aft. Trips are mid-length (1.5–1.7 s) but always the same simple shape.

#### SISTER JUNE (future): "Two hulls, one swappable hold container slung between. Big haul, long walks."
- **Look:** a catamaran: two hulls joined by a coupling beam forward and a reactor beam aft. The left hull is the original dirty teal; the right hull is bleached cream, salvaged from her sister ship (hence the name). The oxblood hold container "JUNE" hangs on a truss between them (you can see the bore floor through it), with an empty second cradle underneath. Reactor drum on the aft beam, one engine per hull, bridge glazing in the left nose, the drill-console blister in the right nose, the siphon port on the right flank, a lamp module on a rail mount.
- **History:** a twin-hull ore lighter that lost a hull in a docking accident; the replacement came off a scrapped sister ship. Holt got her cheap because nobody else wanted to walk her.
- **Stats:** reactor 92 (top speed ~97%; the conveyor gets nothing flat out), the fastest belt (0.095: a stop drains 8.7 u/s), the biggest proposed hold (900, and the container could be swapped). Siphon side: right.
- **Breakaway: reverse.** She's a catamaran, too wide to flip in the bore, so she backs straight out on her retros.
- **Quirks:** the worst walks (HELM → DRILL 2.67 s over the forward catwalk, HELM → SIPHON 2.71 s). The hard-mode ship.
- **Interior:** two long corridors (one per hull) joined by forward and aft catwalks. Left hull: helm, bunk, tools. Right hull: drill console, siphon, lockers. The hold container is reached from the forward catwalk.

#### PATIENCE (future): "A tugboat-shaped work tug: picture window on the hopper, lantern on a stick."
- **Look:** dirty teal with a broad bow and a tapered stern, like a harbour tug (a Lamplighter remix): a wide glazed brow looking straight at the TB-6's hopper, a chipped oxblood stripe, a netted olive crate on a dorsal mount, a folded magnet arm, a reactor stack with radiator fins aft, two engine pods on outrigger struts, a lantern boom front-left and the siphon port on the left flank.
- **History:** a yard tug that pushed drills around Meridian's surface yard for 20 years. Holt crewed her for a decade; when the yard went automated he bought her for scrap price.
- **Stats:** reactor 100, belt 0.085, the smallest proposed hold (350), the shortest walks (1.23 s). Siphon side: left.
- **Breakaway: flip** (my call). She's the smallest hull and narrower than the bore even with her outriggers, and the outrigger engines give her the torque to spin quickly (0.7 s). A tug that pirouettes is in character. If the outriggers end up wider than the bore in final art, switch her to reverse: it's one field.
- **Quirks:** DRILL → ENGINE is her one long trip (1.74 s). She's the easy ship, the natural starter.
- **Interior:** one small loop round a belly hold. Helm and drill console sit side by side under the brow (the vein routine is a two-step shuffle), bunk and tools either side of the hold, siphon aft-left at the port, engine/reactor at the stern.

## 5. Missions and planets

- **[C]** There are multiple distinct planets, chosen from a mission select screen. They have Deep Rock Galactic-style variety but are separate planets.
- **[C]** Some planets are "living."
- **[C]** There are depth zones, each with its own look and hazards.
- **[C]** The living planet Marrow is body horror and a later reveal, not part of the first set.
- **[C]** The launch set is Kessa-4, Vael, and Orun.
- **[C]** Calder will be a playable planet later. It won't be lore-only.

### [P] Mission select

The contract board lists one card per unlocked planet. Each card shows:
- name and palette
- pay rate
- hazard tags
- best depth
- codex completion
- a suggested loadout hint

Each contract carries one optional bonus objective, such as "reach 2000 m" or "recover 3 fossils."

### [P] Planets are data, not code

Each planet is one definition file. Today's `TUNING` values become Kessa-4's defaults.

```js
{
  id: 'kessa4', name: 'Kessa-4', payRate: 1.0, unlock: { licence: 0, after: null },
  modifiers: { heatMul: 1.0, wearMul: 1.0, obstacleGapMul: 1.0 },
  zones: [
    { from: 0,    name: 'Regolith',      palette: [...], hazards: { boulder: 1 } },
    { from: 1000, name: 'Basalt Shelf',  palette: [...], hazards: { boulder: 1, hardRock: 2 } },
    { from: 2000, name: 'Fossil Strata', palette: [...], hazards: { boulder: 1, void: 0.5 } },
    { from: 3000, name: 'Mantle Edge',   palette: [...], hazards: { boulder: 1, magma: 1 }, modifiers: { heatMul: 1.5 } },
  ],
  finds: [...], radio: 'kessa4',
}
```

- Zone boundaries line up with relays, so each relay screen can announce the zone ahead.
- The last zone repeats endlessly, with difficulty still ramping.

**Hazard library** (planets pick from it):

| Hazard | Effect | How you deal with it |
|---|---|---|
| Gas pocket | instant heat spike when drilled | blast it from range |
| Void | hidden cave; the rig slams the far wall | be below safe speed |
| Magma pocket | heat over time while drilling through | vent through it |
| Quake | rumble warning, then hull damage | be braced (throttle at 0) |
| Ice debris | shatters into extra small obstacles | — |
| Crystal band | rich salvage, wear ×2 | — |
| Mud | speed cap while inside | — |
| Magnetic storm | warnings and gauges scramble for a while | — |
| Growth (living only) | organic obstacle that regrows | — |

## 6. Planet candidates [P]

These are ordered by suggested unlock order. Each planet needs a licence plus a depth reached on the previous planet.

1. **Kessa-4, "the Quarry."**
   - Look: dusty ochre and violet rock.
   - Hazards: boulders and hard rock, the baseline set.
   - Modifier: none.
   - Story: a long-dead shallow sea full of fossils. Deep zones show the first odd warm readings (a Marrow seed).
2. **Vael.**
   - Look: pale blue and white ice.
   - Hazards: ice debris and frozen caverns (voids).
   - Modifier: passive cooling ×2, bit wear ×1.3.
   - Story: a frozen ocean that once had life, and a dead rig locked in the ice whose log is a find. Deep ice holds frozen tissue that is "neither fossil nor mineral" (a Marrow seed).
3. **Orun.**
   - Look: scorched black and ochre, with glass layers.
   - Hazards: gas pockets and quakes.
   - Modifier: heat ×1.3.
   - Story: rock layers record a civilization's end, with a buried city and sealed vaults. Its last records describe "the ground listening" (a Marrow seed).
4. **Tessaly.**
   - Look: violet and teal crystal.
   - Hazards: crystal bands (rich salvage, shredded bits), and shards that scatter after blasts.
   - Modifier: pay ×1.3.
   - Story: the crystals hold echoes of sound, and Holt hears voices in the grind.
5. **Selk.**
   - Look: drowned green-grey silt.
   - Hazards: mud (speed caps) and water voids that cool you but stall you.
   - Modifier: max speed −20%, cooling ×1.5.
   - Story: a colony that drowned when its sea rose. Its logs are the most personal in the codex.
6. **Cinder.**
   - Look: red and black magma glow.
   - Hazards: magma pockets and constant heat.
   - Modifier: heat ×1.6, no passive cooling.
   - Story: an earlier Meridian camp lost to a "geological event." The company's version and the rock's version don't match.
7. **Ferro.**
   - Look: rust and steel, an iron-rich planet.
   - Hazards: magnetic storms (gauges scramble) and dense ore.
   - Modifier: wear ×1.5, pay ×1.4.
   - Story: an old corporate mining war. Abandoned shafts from rival companies cross your bore.
8. **Sieve.**
   - Look: grey honeycomb, mostly caves.
   - Hazards: frequent voids, few boulders.
   - Modifier: obstacle gap ×2, void chance ×3.
   - Story: something dug these tunnels long ago, and nobody can say what. It's the strongest Marrow seed before the reveal.
9. **Marrow (later reveal, living, body horror).** See below.
10. **Calder (later, playable [C]).**
    - Look: grey and rust, a graveyard of automated rigs with lights still blinking.
    - Hazards: derelict rigs as obstacles, and interference.
    - Story: the site of the Calder incident. This is where the AI hook eventually pays off. It's playable, but scheduled after the AI-assistant direction is decided.

### [C] Launch set: Kessa-4, Vael, Orun

Reasons for the pick:

- **They pressure different stations.**
  - Kessa-4 is the balanced baseline.
  - Vael shifts the pressure from heat to bit wear and voids (drill and helm).
  - Orun is a heat-and-blast planet (engine and tools).

  That makes loadout choice matter from the first set onward.
- **Manageable scope.** Kessa-4 is mostly built already. The three together need only 4 new hazards: void, ice debris, gas pocket, quake.
- **Story coverage.** You get the natural history of a dead sea and a frozen ocean, then a dead civilization. All three carry a Marrow seed in their deep zones.
- **Distinct looks:** ochre, ice-blue, and black glass read clearly apart on a phone.

### [P] Marrow: the later reveal

- **Tone [C]:** body horror.
  - The walls go from warm rock to wet, fibrous tissue, then to meat and bone.
  - Growths look like teeth and cartilage, and they regrow about 20 s after being cleared.
  - Drilling a vein sprays fluid across the porthole and floods the drill, so wear and heat rise together.
  - The ambience turns into a slow heartbeat. In the deepest zone, contractions squeeze the hull.
  - Holt's barks go grim and quiet.
- **Zones:**
  - 0–1000 m, Crust: nearly normal, but warm.
  - 1000–2000 m, Cartilage: regrowing growths.
  - 2000–3000 m, Vascular: veins in the walls.
  - 3000+ m, the Waking: contractions, and growths that sprout in your path.
- **Wakefulness meter:** rams and blasts raise it, and slow grinding barely does. Higher wakefulness means more contractions and growths, which makes the throttle a moral and tactical choice.
- **How it's revealed:**
  - Seeds come first: Kessa-4's warm readings, Vael's frozen tissue, Orun's "listening ground," Sieve's tunnels, and lost-rig logs mentioning walls that "gave."
  - Once the player has reached the deepest zone on all three launch planets, Dispatch offers a contract with a redacted planet name and very high pay.
  - Ines warns Holt off it in the same message.
  - The card reads "MR-0 [REDACTED]," and the name Marrow only appears once Holt is inside.

## 7. Story delivery

**[C]** Dispatch stays text-only for now. Voice is a maybe for later.

### [P] Dispatch radio arc

Dispatch is one person: *Ines*, a relay controller on the station where the rig docks. Her messages are text, with a radio-static effect and a typing reveal.
- **Early contracts:** scripted company lines. Ines reads from a card.
- **Middle:** shifts get long and she talks off-script: bad coffee, other drillers whose rigs went quiet, a joke about the Operator Clause. She and Holt become something like friends.
- **Later:** cost cuts, rigs not recovered, "policy changes upstairs."
  - One relay she's replaced by a flat automated message.
  - Then she's back, rattled and not explaining.
  - The redacted Marrow contract comes through her desk.

Messages trigger at relay breaks, keyed to the contract count, the planet, and the depth reached. There are also a few short live lines mid-run.

### [P] Finds and codex

**[C]** Collectible finds and logs feed a codex that is kept between runs.

- **Collection [P]:** drill through a find at or below safe speed to recover it. Ram it fast and it's destroyed.
- **Codex categories:**
  - **Strata:** geology, history, and hazard hints for the zone.
  - **Life**
  - **Artifacts**
  - **Logs:** lost rigs and other drillers.
  - **Company**

  Each entry is 2–5 sentences, and Holt gets a bark when he recovers a find.

### [P] Environmental storytelling

- Strata shift by zone.
- Old drill shafts cross your bore.
- A dead rig sits in Vael's ice.
- Buried structures scroll past on Orun.
- Walls get subtly *wrong* in the deep zones of the launch planets, as Marrow seeds.

None of it is explained on screen; the codex and the radio fill it in.

### [P] AI-assistant hook (seeds only)

- Every rig has a sealed helm panel stamped "CLAUSE 7 – DO NOT SERVICE."
- Lost-rig logs mention "a second voice on the line."
- The automated message that briefly replaces Ines knows something it shouldn't.
- Calder exists as a planet name in codex memos long before it becomes playable (a later planet, [C]).

## 8. Milestone roadmap [P]

| Milestone | Scope | Playable at the end |
|---|---|---|
| **M1: Run structure and breaks** | Relay anchors (`RELAY_INTERVAL` = 1000), approach and anchoring, relay screen (free service, paid hull repair, pick 1 of 3 randomized stacking supplies, push on or cash out), haul and multiplier, the 1/3 hull-loss rule with the escape-pod sequence, end-of-run summary, placeholder dispatch text. | A full run loop on Kessa-4 with a real push-or-cash decision every few minutes. |
| **M2: Loadout and docked home base** | Versioned save, credits, a 6-slot loadout with about 12 trade-off parts wired into the tuning values, the Quartermaster's rotating randomized stock (2 per slot, at least 1 option per slot, refresh per contract, doubling reroll cost), the docked rig interior as home screen (tap rooms, Holt walks there), the airlock to the station concourse (Quartermaster, Survey office, Dispatch office), the run → summary → docked rig loop. *(Home screen since redesigned as the station concourse + rig bay, see 4.4.)* | You choose a loadout, run, and come home; parts change *how* you play, not how strong you are. |
| **M3: Planets and mission select (3 planets)** | Planet/zone data format (move `TUNING` into planet definitions), zone transitions, 4 new hazards (void, ice debris, gas pocket, quake), the launch set (Kessa-4, Vael, Orun [C]), contract board, licences and unlocks, bonus objectives. | Pick between 3 distinct planets with 4 zones each; loadout fit matters. |
| **M4: Story and personality** | Bark system with strain, Holt's idle animations, the text dispatch arc and triggers, finds plus codex shelf, Marrow seeds placed in launch-planet deep zones, first lore content pass. | The world talks back, the codex fills up, and the Ines arc and Marrow hints can be followed. |
| **M5: Art, sound, polish** | Real pixel art (ship, Holt, per-planet tilesets), audio (engine hum by speed, grind, radio static, relay music), haptics, first-run tutorial, settings, pause, black-bar and safe-area fixes, low-end phone performance, "add to home screen." | Release-candidate feel for the launch set. An art/sound teammate bot likely pays off here. |
| **Later** | Marrow reveal (body-horror art and audio pass, growth/vein/contraction hazards, wakefulness), more planets from section 6, possible dispatch voice, the AI-assistant direction, and **Calder as a playable planet [C]**. | Post-launch content updates. |
