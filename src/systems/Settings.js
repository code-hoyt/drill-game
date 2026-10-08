// Runtime switches from the URL. ?anim=0 skips the transition cutscenes (tests / impatient playtests).
const q = new URLSearchParams(window.location.search);
export const ANIM = q.get('anim') !== '0';
