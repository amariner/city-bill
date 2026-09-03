/**
 * Sonda determinista de H3.1.
 *
 * No forma parte del bundle: se ejecuta con `npx tsx scripts/economyProbe.ts`.
 * Construye tres pueblos sintéticos con la misma mezcla de casas, granjeros y
 * tiendas, deja cerrar un día y muestra el flujo monetario que guía el balance
 * de costes/mantenimiento.
 */
import { Simulation } from '../src/sim/simulation';
import { DAY_GAME_SECONDS, TICK_GAME_S } from '../src/sim/clock';
import { Grid } from '../src/world/grid';

const TICKS_PER_DAY = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);

function probe(targetHomes: number, seed: number): void {
  const grid = new Grid();
  const side = Math.ceil(Math.sqrt(targetHomes));
  grid.fillTerrain(-side * 3, -side * 3, side * 3, side * 3, 'field');
  for (let x = -side * 3; x <= side * 3; x++) grid.setRoad(x, 0, 'rural');

  let placed = 0;
  for (let row = 0; row < side && placed < targetHomes; row++) {
    for (let col = 0; col < side && placed < targetHomes; col++) {
      const x = -side * 2 + col * 5;
      const z = 3 + row * 5;
      if (grid.placeBuilding('cottage', 3, 3, x, z, 0)) placed++;
    }
  }
  grid.placeBuilding('barn', 0, 4, 0, -10, 0);
  grid.placeBuilding('shop', 4, 4, 5, -10, 0);

  const sim = new Simulation(grid, seed);
  sim.autonomousGrowth = false;
  const beforeTreasury = sim.economy.treasury;
  const beforeTaxes = sim.economy.taxesCollected;
  const beforeUpkeep = sim.economy.ledger.upkeep;
  for (let tick = 0; tick < TICKS_PER_DAY; tick++) sim.step();
  const after = sim.cityStats();
  console.log(JSON.stringify({
    homes: placed,
    population: after.population,
    taxes: +(sim.economy.taxesCollected - beforeTaxes).toFixed(2),
    upkeep: +(sim.economy.ledger.upkeep - beforeUpkeep).toFixed(2),
    treasuryDelta: +(sim.economy.treasury - beforeTreasury).toFixed(2),
    treasury: +sim.economy.treasury.toFixed(2),
    avgWealth: +after.avgWealth.toFixed(2),
  }));
}

for (const [homes, seed] of [[15, 300], [50, 600], [150, 900]] as const) probe(homes, seed);
