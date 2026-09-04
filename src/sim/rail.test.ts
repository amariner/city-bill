/** H5.6: infraestructura ferroviaria, circuito y tren determinista. */
import { Grid } from '../world/grid';
import { isWalkable } from './geometry';
import { Simulation } from './simulation';
import { buildRailLoop, createTrain, stepTrain } from './transit';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function railLoopGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-12, -12, 12, 12, 'field');
  for (let x = -8; x <= 8; x++) {
    grid.setTerrain(x, -8, 'rail');
    grid.setTerrain(x, 8, 'rail');
  }
  for (let z = -8; z <= 8; z++) {
    grid.setTerrain(-8, z, 'rail');
    grid.setTerrain(8, z, 'rail');
  }
  return grid;
}

{
  const grid = railLoopGrid();
  check('vía: rail no es transitable a pie', !isWalkable(grid, -8, -8));
  check('vía: rail bloquea una nueva construcción', !grid.canPlace(1, 1, -8, -8));
  check('vía: save conserva el terreno ferroviario', Grid.deserialize(grid.serialize()).get(-8, -8)?.terrain === 'rail');
  const loop = buildRailLoop(grid);
  check('circuito: detecta un lazo cerrado', loop !== null && loop.length === 64);
  const train = loop ? createTrain(loop, 4) : null;
  if (train) {
    const start = train.routeIndex;
    stepTrain(train, train.route.length);
    check('tren: completa una vuelta y vuelve al índice inicial', train.routeIndex === start);
  } else check('tren: crea composición desde el circuito', false);
}

{
  const grid = railLoopGrid();
  grid.placeBuilding('station', 3, 6, -2, -3, 0);
  const sim = new Simulation(grid, 5606);
  sim.autonomousGrowth = false;
  sim.refreshTrain();
  check('estación: activa el tren al lado de un circuito', sim.cityStats().trainActive);
  const before = sim.vehiclesSnapshot();
  sim.step();
  const after = sim.vehiclesSnapshot();
  check('snapshot: expone locomotora y vagones', before.length >= 4 * 6 && (after[1] !== before[1] || after[2] !== before[2]));
  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const restored = new Simulation(Grid.deserialize(saved.gridJson), 5606, saved);
  check('save: conserva el servicio ferroviario', restored.cityStats().trainActive && restored.vehiclesSnapshot().length === sim.vehiclesSnapshot().length);
}

console.log(`\nrail.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
