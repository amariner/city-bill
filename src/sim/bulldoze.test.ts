import { Grid } from '../world/grid';
import { Simulation } from './simulation';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

function testGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-24, -24, 24, 24, 'field');
  grid.placeBuilding('farmhouse', 5, 4, -12, -2, 0);
  grid.placeBuilding('row-houses', 8, 3, 0, -2, 0);
  return grid;
}

// Una vivienda vecina con un hueco recibe el hogar completo y sus reservas.
{
  const sim = new Simulation(testGrid(), 17);
  const internals = sim as unknown as { households: Map<string, number>; leaving: Set<number> };
  const victimKey = '-12,-2';
  const targetKey = '0,-2';
  const victims = [...sim.citizens.values()].filter((c) => `${c.home.ax},${c.home.az}` === victimKey);
  const beforePopulation = sim.citizens.size;
  const targetWallet = sim.economy.walletOf(targetKey);
  const targetPantry = sim.pantry.get(targetKey) ?? 0;
  const oldWallet = sim.economy.walletOf(victimKey);
  const oldPantry = sim.pantry.get(victimKey) ?? 0;
  // El bloque tiene capacidad 4 y parte ocupado por 4 familias; se libera una
  // plaza como haría una muerte/emigración previa, sin tocar a sus ciudadanos.
  internals.households.set(targetKey, 3);

  check('realojo: la demolición conserva la población', sim.removeBuildingAt(-12, -2) && sim.citizens.size === beforePopulation);
  check('realojo: todos los afectados reciben la vivienda vecina', victims.every((c) => c.home.ax === 0 && c.home.az === -2));
  check('realojo: ningún afectado queda marcado para emigrar', victims.every((c) => !internals.leaving.has(c.id)));
  check('realojo: quien estaba dentro sale a decidir', victims.every((c) => !c.inside && c.phase.kind === 'deciding'));
  check('realojo: el índice encuentra el nuevo hogar', victims.every((c) => sim.index.at(c.home.ax, c.home.az) !== undefined));
  check('realojo: fusiona la despensa', (sim.pantry.get(targetKey) ?? 0) === targetPantry + oldPantry);
  check('realojo: fusiona la cartera', sim.economy.walletOf(targetKey) === targetWallet + oldWallet);
  check('realojo: elimina las claves de la vivienda demolida', !internals.households.has(victimKey) && !sim.pantry.has(victimKey) && !sim.economy.wallets.has(victimKey));
  check('realojo: emite el evento de demolición', sim.events.some((e) => e.name === 'buildingRazed' && e.data.id === 'farmhouse'));
}

// Sin vivienda libre, la familia sigue viva y sale por el camino de emigración.
{
  const grid = new Grid();
  grid.fillTerrain(-12, -12, 12, 12, 'field');
  grid.placeBuilding('farmhouse', 5, 4, 0, 0, 0);
  const sim = new Simulation(grid, 23);
  const internals = sim as unknown as { leaving: Set<number> };
  const beforePopulation = sim.citizens.size;
  const ids = [...sim.citizens.keys()];
  check('sin hueco: la demolición conserva la población', sim.removeBuildingAt(1, 1) && sim.citizens.size === beforePopulation);
  check('sin hueco: todos los afectados quedan en salida', ids.every((id) => internals.leaving.has(id)));
  check('sin hueco: la crónica registra la demolición', sim.events.some((e) => e.name === 'buildingRazed'));
}

console.log(`\nbulldoze.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests fallidos`);
