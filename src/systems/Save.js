// Persistent meta save (localStorage). Credits are banked here; M2 will spend them.
const KEY = 'drill.save';
const VERSION = 1;
const DEFAULTS = () => ({ v: VERSION, credits: 0, runs: 0, cashouts: 0, rigsLost: 0, relaysReached: 0 });

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.v === VERSION) return { ...DEFAULTS(), ...raw };
  } catch { /* corrupted or private mode */ }
  return DEFAULTS();
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
  return save;
}

/** Bank credits from a finished run and bump stats. Returns the updated save. */
export function bankRun({ banked, reason, relays }) {
  const s = loadSave();
  s.credits += Math.max(0, Math.floor(banked));
  s.runs += 1;
  if (reason === 'cashout') s.cashouts += 1; else s.rigsLost += 1;
  s.relaysReached += relays;
  return writeSave(s);
}
