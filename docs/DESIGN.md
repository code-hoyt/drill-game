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

- **[C]** Runs are endless. Hull integrity is the lose condition and depth is the score.
- **[C]** The current mechanics stay: the helm, engine, drill, and tools stations on a 2x2 two-deck ship, plus heat, bit wear, boulders, hard rock, and a throttle that locks when nobody is at the helm.
- **[C]** There's a break every 1000 m, and the interval is tunable.
- **[C]** You can cash out at relays.
- **[C]** Hull loss keeps 1/3 of the haul.
- **[C]** Holt survives hull loss in an escape pod.

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
- **Cash out at a relay [C]:** the rig is winched back to the station. **[P]** You keep the haul plus a **10% completion bonus**.
- **Hull loss [C]:** Holt ejects in the escape pod and keeps **1/3 of the haul**.
  - **[P]** The rig's crew cab *is* the escape pod, so his home survives.
  - **[P]** The company recovers the wrecked drill section, refits it, and takes the other 2/3 as "recovery and refit." The rig comes back whole for the next contract.
- **[C] Transitions (built after M2, retimed to ~5.2 s):** short cutscenes, each about 5.2 s, tappable to skip after a 0.4 s grace. **[C] A 180° camera turn** bridges the run's drill-up view and the drill-down view outside. Descent: it turns as the rig sinks in after the bite. Ascent: it turns as the rig is winched out. A second, shorter turn links the station shot to the docked screen, which shows the rig drill-up with the station below the hatch. On the way back, the rig is winched out of the bore (or the pod launches), then a cut to space, where it rises to the station and the clamps engage. **The summary comes after docking**, shown over the docked rig. On contract start, the rig undocks, drops toward the planet, and the drill nose bites into the surface, landing in the run. They reuse the rig textures.
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

**[C]** The rig has **6 slots**, one per system. This leans into rig customization:

**Drill head · Engine · Hull · Tools · Helm · Holt's kit**

- Every slot always holds exactly one part. The stock parts are today's balance and a fair choice anywhere.
- Buying a part adds it to your options; it doesn't make the rig stronger overall.
- You swap parts only while docked, never mid-run, so the loadout is a pre-run plan for a specific planet.

**[C] Rotating vendor stock.** The station Quartermaster offers a randomized stock that refreshes between contracts. Because you can only buy what's on offer, each playthrough's rig ends up different.

**[P] Implications and rules:**
- The stock is a few parts per slot (proposed: 2 per slot, so 12 items) drawn from the *unlocked* pool. Credits buy unlocks that widen the pool, and stock offers then come from that wider pool.
- At least one non-stock option per slot whenever the pool allows, so no slot is ever a dead end.
- The stock refreshes after every contract (cash-out or hull loss), so a bad run still turns the shop over.
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

### 4.4 [P] Home base: docked aboard the rig

**[C]** Holt lives on his rig. Between contracts it docks at an orbital station.

The home screen is **the rig's own 2x2 interior while docked**: calm, lights on, the station visible through the HELM porthole. You tap things in the rooms, and Holt walks there using the same pathing as in a run.

**Rig rooms:**
- **HELM:** the nav console opens the **contract board** (mission select). The radio replays Dispatch messages.
- **DRL / ENG / TLS:** tap the station to see its slot and swap the equipped part. The TLS bench also holds the Hull and Holt's kit slots.
- **Shelf in DRL:** the **codex**. Recovered finds appear here physically.
- **Holt's fold-down cot by the ladder:** stats (runs, best depths, credits earned, rigs refitted).

**Airlock (the hatch in the bottom-deck floor, under the ladder) → station concourse.** This is a small second screen with vendor fronts:
- **Quartermaster:** buy parts and new relay supplies for the pool.
- **Survey office:** buy planet licences.
- **Dispatch office:** Ines's window.

The rig interior slowly gains personal clutter as you progress. That's the melancholy home beat, and it shows progression without numbers.

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
| **M2: Loadout and docked home base** | Versioned save, credits, a 6-slot loadout with about 12 trade-off parts wired into the tuning values, the Quartermaster's rotating randomized stock (2 per slot, at least 1 option per slot, refresh per contract, doubling reroll cost), the docked rig interior as home screen (tap rooms, Holt walks there), the airlock to the station concourse (Quartermaster, Survey office, Dispatch office), the run → summary → docked rig loop. | You choose a loadout, run, and come home; parts change *how* you play, not how strong you are. |
| **M3: Planets and mission select (3 planets)** | Planet/zone data format (move `TUNING` into planet definitions), zone transitions, 4 new hazards (void, ice debris, gas pocket, quake), the launch set (Kessa-4, Vael, Orun [C]), contract board, licences and unlocks, bonus objectives. | Pick between 3 distinct planets with 4 zones each; loadout fit matters. |
| **M4: Story and personality** | Bark system with strain, Holt's idle animations, the text dispatch arc and triggers, finds plus codex shelf, Marrow seeds placed in launch-planet deep zones, first lore content pass. | The world talks back, the codex fills up, and the Ines arc and Marrow hints can be followed. |
| **M5: Art, sound, polish** | Real pixel art (ship, Holt, per-planet tilesets), audio (engine hum by speed, grind, radio static, relay music), haptics, first-run tutorial, settings, pause, black-bar and safe-area fixes, low-end phone performance, "add to home screen." | Release-candidate feel for the launch set. An art/sound teammate bot likely pays off here. |
| **Later** | Marrow reveal (body-horror art and audio pass, growth/vein/contraction hazards, wakefulness), more planets from section 6, possible dispatch voice, the AI-assistant direction, and **Calder as a playable planet [C]**. | Post-launch content updates. |
