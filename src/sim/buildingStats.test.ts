/** Contrato del canal espacial lento de overlays (H4.6). */
import { BUILDING_STRIDE } from './protocol';
import { Simulation } from './simulation';
import { Grid } from '../world/grid';

let passed = 0;
let failed = 0;
function check(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function fixture(): Simulation {
  const grid = new Grid();
  grid.fillTerrain(-12, -12, 24, 24, 'field');
  for (let cx = -12; cx <= 24; cx++) grid.setRoad(cx, -2, 'street');
  check(grid.placeBuilding('cottage', 3, 3, 0, 0), 'fixture: coloca vivienda');
  check(grid.placeBuilding('shop', 4, 3, 6, 0), 'fixture: coloca comercio');
  check(grid.placeBuilding('park', 4, 4, 12, 0), 'fixture: coloca parque');
  const sim = new Simulation(grid, 60606);
  sim.autonomousGrowth = false;
  return sim;
}

function at(stats: Float32Array, index: number, field: number): number {
  return stats[index * BUILDING_STRIDE + field];
}

// La matriz es compacta, estable y usa el mismo orden espacial que WorldIndex.
{
  const sim = fixture();
  const first = sim.buildingStats();
  const second = sim.buildingStats();
  check(first.length === sim.index.buildings.length * BUILDING_STRIDE, 'stats: stride y longitud coinciden');
  check(first.length === 3 * BUILDING_STRIDE, 'stats: fixture tiene tres edificios');
  check(at(first, 0, 0) === 0 && at(first, 0, 1) === 0, 'stats: primera fila es el hogar ancla');
  check(at(first, 1, 0) === 6 && at(first, 1, 1) === 0, 'stats: segunda fila es la tienda');
  check(at(first, 2, 0) === 12 && at(first, 2, 1) === 0, 'stats: tercera fila es el parque');
  check(at(first, 0, 2) >= 0 && at(first, 0, 2) <= 1, 'stats: felicidad residencial acotada');
  check(at(first, 1, 2) === -1 && at(first, 2, 2) === -1, 'stats: no residenciales usan felicidad neutra');
  check(at(first, 0, 6) === 1, 'stats: la vivienda inicial está ocupada');
  check(at(first, 1, 6) >= 0 && at(first, 1, 6) <= 1, 'stats: ocupación de empleo acotada');
  check(at(first, 0, 4) === sim.index.buildings[0].coverage, 'stats: transporta la máscara de cobertura');
  check([...first].every((value) => Number.isFinite(value)), 'stats: no contiene NaN/Infinity');
  check([...first].every((value, i) => value === second[i]), 'stats: dos lecturas consecutivas son deterministas');

  sim.economy.visitsToday.set('6,0', 4);
  const loaded = sim.buildingStats();
  check(at(loaded, 1, 7) === 0.5, 'stats: las visitas alimentan la carga de tráfico');

  const state = sim as unknown as { happiness: Map<string, number>; landValue: Map<string, number> };
  state.happiness.set('0,0', 0.73);
  state.landValue.set('0,0', 0.81);
  const overridden = sim.buildingStats();
  check(Math.abs(at(overridden, 0, 2) - 0.73) < 1e-6, 'stats: felicidad refleja la muestra del hogar');
  check(Math.abs(at(overridden, 0, 3) - 0.81) < 1e-6, 'stats: suelo refleja el snapshot diario');
}

console.log(`\nbuildingStats.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
