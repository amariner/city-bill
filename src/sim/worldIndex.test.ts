/** Acceso vial y abandono reversible (H2.6). */
import { DAY_GAME_SECONDS, TICK_GAME_S } from './clock';
import { ABANDON_DAYS, Simulation } from './simulation';
import { hasRoadAccess, WorldIndex } from './worldIndex';
import { Grid } from '../world/grid';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function houseGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-20, -20, 20, 20, 'field');
  grid.placeBuilding('farmhouse', 5, 4, 0, 0, 0);
  return grid;
}

function connectedHouseGrid(): Grid {
  const grid = houseGrid();
  grid.setTerrain(5, 1, 'path');
  return grid;
}

function stabilizeHousehold(sim: Simulation): void {
  // El fixture prueba acceso vial, no hambre: deja reservas holgadas para que
  // los diez días de aislamiento no introduzcan una muerte ajena al hito.
  sim.pantry.set('0,0', 10_000);
  for (const citizen of sim.citizens.values()) {
    citizen.age = 30;
    citizen.health = 1;
    citizen.needs.food = 1;
  }
}

// El anillo es deliberadamente exterior: cinco celdas de separación no cuentan,
// mientras un sendero que vuelve a entrar en el anillo sí da acceso.
{
  const grid = houseGrid();
  grid.setRoad(0, 9, 'rural');
  const index = new WorldIndex(grid);
  check('acceso: una casa a cinco celdas de la vía queda sin acceso', index.at(0, 0)?.roadAccess === false);
  check('acceso: la vía lejana no falsea el anillo', !hasRoadAccess(grid, 0, 0, 5, 4));
  grid.setTerrain(5, 1, 'path');
  check('acceso: un sendero en el anillo sí cuenta', hasRoadAccess(grid, 0, 0, 5, 4));
}

const ticksPerDay = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);

// Diez cierres consecutivos cierran el edificio, pero no despawnean a sus vecinos.
{
  const sim = new Simulation(connectedHouseGrid(), 31337);
  sim.autonomousGrowth = false;
  stabilizeHousehold(sim);
  // Primero observamos la conexión; el corte posterior es el inicio del reloj
  // de abandono y no una condena retroactiva de la semilla.
  for (let i = 0; i < ticksPerDay; i++) sim.step();
  const before = sim.citizens.size;
  sim.grid.setTerrain(5, 1, 'field');
  sim.index.rebuild();
  for (let i = 0; i < ticksPerDay; i++) sim.step();
  const pressureSave = JSON.parse(JSON.stringify(sim.serialize()));
  const pressureRestored = new Simulation(Grid.deserialize(pressureSave.gridJson), 31337, pressureSave);
  const restoredInternals = pressureRestored as unknown as { noAccessSince: Map<string, number> };
  check('abandono: el guardado conserva el inicio del temporizador', restoredInternals.noAccessSince.has('0,0'));
  for (let i = 0; i < ticksPerDay * ABANDON_DAYS; i++) sim.step();
  const building = sim.index.at(0, 0);
  check('abandono: tras diez días sin acceso se marca la casa', building?.abandoned === true);
  check('abandono: la huella sigue ocupada', sim.grid.get(0, 0)?.building?.abandoned === true);
  check('abandono: conserva toda la población', sim.citizens.size >= before);
  check('abandono: deja de ofrecer vivienda activa', sim.index.ofRole('residential').length === 0);
  check('abandono: aparece en el estado de ciudad', sim.cityStats().abandoned === 1);
  check('abandono: emite un evento narrable', sim.events.some((event) => event.name === 'buildingAbandoned'));

  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const restored = new Simulation(Grid.deserialize(saved.gridJson), 31337, saved);
  check('abandono: el guardado conserva la casa cerrada', restored.index.at(0, 0)?.abandoned === true);
}

// La presión no es irreversible: rehacer el acceso antes del umbral conserva la casa.
{
  const sim = new Simulation(connectedHouseGrid(), 4242);
  sim.autonomousGrowth = false;
  stabilizeHousehold(sim);
  for (let i = 0; i < ticksPerDay; i++) sim.step();
  const beforeRoad = sim.citizens.size;
  sim.grid.setTerrain(5, 1, 'field');
  sim.index.rebuild();
  for (let i = 0; i < ticksPerDay * 2; i++) sim.step();
  sim.grid.setTerrain(5, 1, 'path');
  sim.index.rebuild();
  for (let i = 0; i < ticksPerDay; i++) sim.step();
  const building = sim.index.at(0, 0);
  const internals = sim as unknown as { noAccessSince: Map<string, number> };
  check('recuperación: rehacer la vía antes del límite cancela la presión', !internals.noAccessSince.has('0,0'));
  check('recuperación: la casa vuelve a tener acceso', building?.roadAccess === true);
  check('recuperación: la casa no se abandona', building?.abandoned === false);
  check('recuperación: la vivienda vuelve a contar', sim.index.ofRole('residential').length === 1);
  check('recuperación: tampoco pierde población', sim.citizens.size >= beforeRoad);
}

console.log(`\nworldIndex.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
