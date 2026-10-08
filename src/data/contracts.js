// Contract board entries. M2 has one planet; M3 adds Vael and Orun as more PLANETS rows
// (plus licences/unlocks) and GameScene reads its tuning from the chosen planet.
export const PLANETS = [
  { id: 'kessa4', name: 'KESSA-4', color: 0xb5532f, colorText: 0xffb347, pay: 1.0,
    title: 'IRON SURVEY CONTRACT', hazards: 'BOULDERS, HARD ROCK', unlocked: true },
];

export const CONTRACTS = () => PLANETS.filter((p) => p.unlocked).map((p) => ({
  planet: p.id, planetName: p.name, title: p.title, pay: p.pay, hazards: p.hazards, color: p.color, colorText: p.colorText,
}));
