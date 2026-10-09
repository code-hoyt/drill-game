// Persistent meta save (localStorage 'drill.save', versioned JSON).
// v1 (M1): credits + run stats.  v2 (M2): + owned parts, loadout, vendor stock, radio log,
// per-planet best depth, lifetime earnings. v4: + SIPHON slot. v5 ([C] separate drill + ship): rigsLost is
// now drillsLost (the ship always gets home; only leased drills are written off), and the vendor stock is
// re-checked for the new power-split parts. Older saves are migrated, never wiped.
import { loadBest } from '../config.js';
import { PARTS, SLOTS, partById, DEFAULT_LOADOUT, unlockMet } from '../data/parts.js';

const KEY = 'drill.save';
export const VERSION = 5;   // v5: drillsLost (was rigsLost) + power-split parts. v4: + SIPHON slot
export const VENDOR_PER_SLOT = 2;
export const REROLL_BASE = 100;   // 100 -> 200 -> 400 ... per dock (resets when the stock refreshes)
const RADIO_MAX = 40;

const DEFAULTS = () => ({
  v: VERSION, credits: 0, totalEarned: 0, runs: 0, cashouts: 0, drillsLost: 0, relaysReached: 0, deepestRelay: 0,
  best: {},                                      // planetId -> best depth (m)
  owned: PARTS.filter((p) => p.stock).map((p) => p.id),
  loadout: DEFAULT_LOADOUT(),
  vendor: { stock: [], rerolls: 0, refreshes: 0 },
  radio: [],                                     // [{ tag, text }] newest last
  unlocked: [],                                  // milestone parts unlocked so far (sticky)
  newUnlocks: [],                                // unlocked since the last dock notice
});

// ---- unlocks ------------------------------------------------------------------------
export const progressOf = (s) => ({ best: Math.max(0, ...Object.values(s.best || {})), relays: s.relaysReached || 0 });
/** Starter parts, milestone parts already unlocked, and anything owned (grandfathered). */
export const isUnlocked = (s, p) => !p.unlock || s.unlocked.includes(p.id) || s.owned.includes(p.id);
/** Unlock every part whose milestone is met. Returns the newly unlocked ids. */
export function checkUnlocks(s, notify = true) {
  const prog = progressOf(s), fresh = [];
  for (const p of PARTS) if (p.unlock && !s.unlocked.includes(p.id) && (unlockMet(p, prog) || s.owned.includes(p.id))) { s.unlocked.push(p.id); fresh.push(p.id); }
  if (notify) s.newUnlocks = [...new Set([...(s.newUnlocks || []), ...fresh.filter((id) => !s.owned.includes(id))])];
  return fresh;
}

/** Upgrade any older save object to the current version (pure; exported for tests).
 *  v1 (M1): credits + stats.  v2 (M2): + parts/loadout/vendor/radio.  v3: + unlocks. */
export function migrate(raw) {
  const s = DEFAULTS();
  const from = raw && typeof raw === 'object' ? raw.v : 0;
  if (from === 1) {
    for (const k of ['credits', 'runs', 'cashouts', 'relaysReached']) s[k] = Number(raw[k]) || 0;
    s.drillsLost = Number(raw.rigsLost) || 0;
    s.totalEarned = s.credits; // v1 didn't track lifetime earnings; banked credits are the best floor
    s.migratedFrom = 1;
  } else if (from >= 2 && from <= VERSION) {
    Object.assign(s, raw);
    // v5: a lost "rig" was always the drill (the ship burned home): carry the count over
    if (from < 5) { s.drillsLost = Number(raw.rigsLost) || 0; delete s.rigsLost; }
    s.loadout = { ...DEFAULT_LOADOUT(), ...(raw.loadout || {}) };
    s.vendor = { ...DEFAULTS().vendor, ...(raw.vendor || {}) };
    s.owned = [...new Set([...DEFAULTS().owned, ...(raw.owned || []).filter((id) => partById(id))])];
    s.unlocked = (raw.unlocked || []).filter((id) => partById(id));
    s.newUnlocks = raw.newUnlocks || [];
    if (from < VERSION) s.migratedFrom = s.migratedFrom || from;
  }
  s.v = VERSION;
  // best depth lived in its own key before M2; keep the higher of both
  s.best = { ...s.best, kessa4: Math.max(s.best.kessa4 || 0, loadBest()) };
  // never leave an unowned / unknown part equipped
  for (const slot of SLOTS) if (!s.owned.includes(s.loadout[slot.id]) || partById(s.loadout[slot.id])?.slot !== slot.id) s.loadout[slot.id] = DEFAULT_LOADOUT()[slot.id];
  if (from !== VERSION) {
    // pre-unlock saves: grandfather owned parts and silently open milestones already reached
    checkUnlocks(s, false);
    // an old stock that offered now-locked parts is re-drawn from the unlocked pool (keeps the per-slot guarantee)
    const kept = s.vendor.stock.filter((id) => partById(id) && isUnlocked(s, partById(id)));
    s.vendor.stock = kept.length && kept.length === s.vendor.stock.length ? kept : rollStock(s);
    // pre-v4 stock has no SIPHON offers: add the new slot's draw (if any siphon part is unlocked yet)
    if (!s.vendor.stock.some((id) => partById(id).slot === 'siphon')) s.vendor.stock.push(...rollStock(s).filter((id) => partById(id).slot === 'siphon'));
  }
  return s;
}

export function loadSave() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* corrupted or private mode */ }
  const s = migrate(raw);
  if (!raw || raw.v !== VERSION) writeSave(s); // persist the migration once
  return s;
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
  return save;
}

// ---- vendor (Quartermaster) ------------------------------------------------------
/** 2 random parts per slot from the unlocked, unowned, non-stock pool (fewer if the pool is short). */
export function rollStock(save, rand = Math.random, avoid = null) {
  const out = [];
  for (const slot of SLOTS) {
    const pool = PARTS.filter((p) => p.slot === slot.id && !p.stock && isUnlocked(save, p) && !save.owned.includes(p.id));
    let pick;
    for (let tries = 0; tries < 6; tries++) {
      const a = [...pool];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      pick = a.slice(0, VENDOR_PER_SLOT).map((p) => p.id);
      // a reroll should change something whenever the pool allows
      if (!avoid || pool.length <= VENDOR_PER_SLOT || pick.some((id) => !avoid.includes(id))) break;
    }
    out.push(...pick);
  }
  return out;
}
export const rerollCost = (save) => REROLL_BASE * 2 ** save.vendor.rerolls;

/** New stock after every contract (cash-out or drill loss). Reroll price resets. */
export function refreshStock(save) {
  save.vendor = { stock: rollStock(save), rerolls: 0, refreshes: (save.vendor.refreshes || 0) + 1 };
  return save;
}

export function reroll() {
  const s = loadSave(), cost = rerollCost(s);
  if (s.credits < cost) return { ok: false, reason: 'NOT ENOUGH CREDITS' };
  s.credits -= cost;
  s.vendor.stock = rollStock(s, Math.random, s.vendor.stock);
  s.vendor.rerolls += 1;
  writeSave(s);
  return { ok: true, cost, save: s };
}

export function buyPart(id) {
  const s = loadSave(), p = partById(id);
  if (!p) return { ok: false, reason: 'UNKNOWN PART' };
  if (s.owned.includes(id)) return { ok: false, reason: 'ALREADY OWNED' };
  if (!isUnlocked(s, p)) return { ok: false, reason: 'LOCKED' };
  if (!s.vendor.stock.includes(id)) return { ok: false, reason: 'NOT IN STOCK' };
  if (s.credits < p.price) return { ok: false, reason: 'NOT ENOUGH CREDITS' };
  s.credits -= p.price;
  s.owned.push(id);
  writeSave(s);
  return { ok: true, save: s };
}

// ---- loadout ------------------------------------------------------------------------
// Parts swap only while docked. GameScene flips this flag for the length of a run.
let runActive = false;
export const setRunActive = (v) => { runActive = !!v; };
export const isRunActive = () => runActive;

export function equipPart(id) {
  if (runActive) return { ok: false, reason: 'RUN ACTIVE: SWAP WHILE DOCKED' };
  const s = loadSave(), p = partById(id);
  if (!p || !s.owned.includes(id)) return { ok: false, reason: 'NOT OWNED' };
  s.loadout[p.slot] = id;
  writeSave(s);
  return { ok: true, save: s };
}

// ---- runs -----------------------------------------------------------------------------
/** Bank credits from a finished run, bump stats, refresh the vendor stock. Returns the save. */
export function bankRun({ banked, reason, relays, depth = 0, planet = 'kessa4' }) {
  const s = loadSave();
  const b = Math.max(0, Math.floor(banked));
  s.credits += b;
  s.totalEarned += b;
  s.runs += 1;
  if (reason === 'cashout') s.cashouts += 1; else s.drillsLost += 1;
  s.relaysReached += relays;
  s.deepestRelay = Math.max(s.deepestRelay || 0, relays);
  s.best[planet] = Math.max(s.best[planet] || 0, Math.floor(depth));
  checkUnlocks(s);   // milestones first, so the new stock can include fresh unlocks
  refreshStock(s);
  return writeSave(s);
}

/** Keep Ines's messages for the HELM radio replay. */
export function logRadio(tag, text) {
  const s = loadSave();
  s.radio.push({ tag, text });
  if (s.radio.length > RADIO_MAX) s.radio.splice(0, s.radio.length - RADIO_MAX);
  writeSave(s);
}

/** Clear the dock notice. */
export function ackUnlocks() { const s = loadSave(); const ids = s.newUnlocks; s.newUnlocks = []; writeSave(s); return ids; }

/** Test/playtest shortcuts from the URL: ?credits=5000, ?own=all|id,id, ?unlock=all, ?stock=id,id, ?wipe=1 */
export function applyUrlShortcuts(search = window.location.search) {
  const q = new URLSearchParams(search);
  if (q.has('wipe')) { try { localStorage.removeItem(KEY); localStorage.removeItem('drill.bestDepth'); } catch { /* ignore */ } }
  if (!['credits', 'own', 'stock', 'unlock'].some((k) => q.has(k))) return null;
  const s = loadSave();
  if (q.has('credits')) s.credits = Math.max(0, Number(q.get('credits')) || 0);
  if (q.has('own')) {
    const ids = q.get('own') === 'all' ? PARTS.map((p) => p.id) : q.get('own').split(',').filter((id) => partById(id));
    s.owned = [...new Set([...s.owned, ...ids])];
  }
  if (q.get('unlock') === 'all') s.unlocked = PARTS.filter((p) => p.unlock).map((p) => p.id);
  if (q.has('stock')) s.vendor.stock = q.get('stock').split(',').filter((id) => partById(id) && !partById(id).stock);
  return writeSave(s);
}
