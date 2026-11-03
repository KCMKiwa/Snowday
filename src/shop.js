// The shop: board and ski designs and outfits, bought with Flakes earned on runs. What has
// been bought (and the Flakes) is kept in the browser.
import { DESIGNS } from './boards.js';
import { OUTFITS } from './rider.js';

// Prices in Flakes (0 = there from the start).
export const PRICES = {
  designs: { polar: 0, sunset: 0, glacier: 600, ember: 900, kiwi: 1200, topo: 1800, camo: 1500, stripes: 2200, checkmate: 3000 },
  outfits: {
    signal: 0, glacier: 0, moss: 300, berry: 450, volt: 700, night: 1000,
    tangerine: 350, arctic: 500, ocean: 600, sakura: 800, lava: 900, blackout: 1200, retro: 1500, gold: 2500,
  },
};
export const ITEMS = { designs: DESIGNS, outfits: OUTFITS };

const START = 1000; // Flakes to start with

// Flakes for a finished run: 25 for getting down, and one for every 100 points.
export const flakesFor = (score) => 25 + Math.floor(Math.max(0, score) / 100);

export class Wallet {
  // store: { get(key, fallback), set(key, value) }; equipped: { designs, outfits } indices in
  // use (always owned, so nothing picked before the shop existed is taken away).
  constructor(store, equipped) {
    this.store = store;
    // enough to buy something right away (saves from before that got topped up once)
    this.flakes = store.get('flakes', START);
    if (!store.get('flakesTopUp', false)) { this.flakes = Math.max(this.flakes, START); store.set('flakesTopUp', true); }
    const saved = store.get('owned', null);
    this.owned = {};
    for (const kind of ['designs', 'outfits']) {
      const ids = new Set(saved?.[kind] ?? []);
      ITEMS[kind].forEach((it, i) => { if (!PRICES[kind][it.id] || i === equipped[kind]) ids.add(it.id); });
      this.owned[kind] = ids;
    }
    this.save();
  }

  has(kind, i) { return this.owned[kind].has(ITEMS[kind][i].id); }
  price(kind, i) { return PRICES[kind][ITEMS[kind][i].id] ?? 0; }

  // Buys item i; false when it is owned already or the Flakes do not reach.
  buy(kind, i) {
    const p = this.price(kind, i);
    if (this.has(kind, i) || this.flakes < p) return false;
    this.flakes -= p;
    this.owned[kind].add(ITEMS[kind][i].id);
    this.save();
    return true;
  }

  earn(n) { this.flakes += n; this.save(); }

  save() {
    this.store.set('flakes', this.flakes);
    this.store.set('owned', { designs: [...this.owned.designs], outfits: [...this.owned.outfits] });
  }
}
