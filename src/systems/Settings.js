// Runtime switches from the URL. ?anim=0 skips the transition cutscenes (tests / impatient playtests).
// ?animscale=N overrides config ANIM_SCALE (the cutscene speed multiplier) for a playtest.
import { ANIM_SCALE, ANIM_TIMING as T } from '../config.js';
const q = new URLSearchParams(window.location.search);
export const ANIM = q.get('anim') !== '0';
const forced = Number(q.get('animscale'));
export const animScale = forced >= 0.25 && forced <= 4 ? forced : ANIM_SCALE;
export const CUTSCENE_MS = Math.round(T.BASE_MS * animScale);                 // ascent
export const DESCENT_MS = Math.round(T.BASE_DESCENT_MS * animScale);        // descent (drill smash + dock-on)
export const GRACE_MS = Math.round(T.BASE_GRACE_MS * Math.cbrt(animScale));
export const LIFT_MS = Math.round(T.BASE_LIFT_MS * Math.sqrt(animScale));
window.__drillAnimCfg = { scale: animScale, cutsceneMs: CUTSCENE_MS, descentMs: DESCENT_MS, graceMs: GRACE_MS, liftMs: LIFT_MS };
