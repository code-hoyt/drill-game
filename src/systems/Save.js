// Persistent meta save (localStorage 'drill.save', versioned JSON).
// v1 (M1): credits + run stats.  v2 (M2): + owned parts, loadout, vendor stock, radio log,
// per-planet best depth, lifetime earnings. Older saves are migrated, never wiped.
import { loadBest } from '../config.js';
import { PARTS, SLOTS, partById, DEFAULT_LOADOUT } from '../data/parts.js';

const KEY = 'drill.save';
export const VERSION = 2;
export const VENDOR_PER_SLOT = 2;
export const REROLL_BASE = 100;   // 100 -> 200 -> 400 ... per dock (resets when the stock refreshes)
const RADIO_MAX = 40;

const DEFAULTS = () => ({
  v: VERSION, credits: 0, totalEarned: 0, runs: 0, cashouts: 0, rigsLost: 0, relaysReached: 0, deepestRelay: 0,
  best: {},                                      // planetId -> best depth (m)
  owned: PARTS.filter((p) => p.stock).map((p) => p.id),
  loadout: DEFAULT_LOADOUT(),
  vendor: { stock: [], rerolls: 0, refreshes: 0 },
  radio: [],                                     // [{ tag, text }] newest last
});

/** Upgrade any older save object to the current version (pure; exported for tests). */
export function migrate(raw) {
  const s = DEFAULTS();
  if (!raw || typeof raw !== 'object') { s.best.kessa4 = loadBest(); return s; }
  if (raw.v === 1) {
    for (const k of ['credits', 'runs', 'cashouts', 'rigsLost', 'relaysReached']) s[k] = Number(raw[k]) || 0;
    s.totalEarned = s.credits; // v1 didn't track lifetime earnings; banked credits are the best floor
    s.migratedFrom = 1;
  } else if (raw.v === VERSION) {
    Object.assign(s, raw);
    s.loadout = { ...DEFAULT_LOADOUT(), ...(raw.loadout || {}) };
    s.vendor = { ...DEFAULTS().vendor, ...(raw.vendor || {}) };
    s.owned = [...new Set([...DEFAULTS().owned, ...(raw.owned || []).filter((id) => partById(id))])];
  }
  // best depth lived in its own key before M2; keep the higher of both
  s.best = { ...s.best, kessa4: Math.max(s.best.kessa4 || 0, loadBest()) };
  // never leave an unowned / unknown part equipped
  for (const slot of SLOTS) if (!s.owned.includes(s.loadout[slot.id]) || partById(s.loadout[slot.id])?.slot !== slot.id) s.loadout[slot.id] = DEFAULT_LOADOUT()[slot.id];
  if (!s.vendor.stock.length) s.vendor.stock = rollStock(s);
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
    const pool = PARTS.filter((p) => p.slot === slot.id && p.unlocked && !p.stock && !save.owned.includes(p.id));
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

/** New stock after every contract (cash-out or hull loss). Reroll price resets. */
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
  if (reason === 'cashout') s.cashouts += 1; else s.rigsLost += 1;
  s.relaysReached += relays;
  s.deepestRelay = Math.max(s.deepestRelay || 0, relays);
  s.best[planet] = Math.max(s.best[planet] || 0, Math.floor(depth));
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

/** Test/playtest shortcuts from the URL: ?credits=5000, ?own=all|id,id, ?stock=id,id, ?wipe=1 */
export function applyUrlShortcuts(search = window.location.search) {
  const q = new URLSearchParams(search);
  if (q.has('wipe')) { try { localStorage.removeItem(KEY); localStorage.removeItem('drill.bestDepth'); } catch { /* ignore */ } }
  if (!['credits', 'own', 'stock'].some((k) => q.has(k))) return null;
  const s = loadSave();
  if (q.has('credits')) s.credits = Math.max(0, Number(q.get('credits')) || 0);
  if (q.has('own')) {
    const ids = q.get('own') === 'all' ? PARTS.map((p) => p.id) : q.get('own').split(',').filter((id) => partById(id));
    s.owned = [...new Set([...s.owned, ...ids])];
  }
  if (q.has('stock')) s.vendor.stock = q.get('stock').split(',').filter((id) => partById(id) && !partById(id).stock);
  return writeSave(s);
}
