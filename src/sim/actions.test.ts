/** Contratos de acciones y replay. Se ejecuta sin worker ni THREE. */
import { Grid } from '../world/grid';
import { Simulation } from './simulation';
import { replayActions } from './actions';
import type { PlayerAction } from './protocol';

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

function startingGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-20, -20, 20, 20, 'field');
  grid.fillTerrain(-20, 0, 20, 0, 'road');
  grid.placeBuilding('farmhouse', 5, 4, -12, 4, 0);
  grid.placeBuilding('barn', 4, 5, 4, 4, 0);
  return Grid.deserialize(grid.serialize());
}

const actions: PlayerAction[] = [
  { kind: 'place', id: 'cottage', cx: -5, cz: 8, rot: 0 },
  { kind: 'place', id: 'shop', cx: 8, cz: 8, rot: 0 },
  { kind: 'place', id: 'cottage', cx: 14, cz: 12, rot: 1 },
];
const ticks = [300, 900, 1500];

const original = new Simulation(startingGrid(), 8080);
for (let i = 0; i < actions.length; i++) {
  while (original.clock.tick < ticks[i]) original.step();
  const result = original.applyAction(actions[i], i + 1);
  check(`acción ${i + 1} se acepta en el tick ${ticks[i]}`, result.ok);
}
const endTick = original.clock.tick + 2 * Math.round(2400 / 36);
while (original.clock.tick < endTick) original.step();
const recorded = [...original.actions];

const replay = new Simulation(startingGrid(), 8080);
replayActions(replay, recorded, endTick);
check('replay: snapshot final idéntico', replay.snapshot().join(',') === original.snapshot().join(','));
check('replay: grid final idéntico', replay.grid.serialize() === original.grid.serialize());
check('replay: conserva el registro de acciones', replay.actions.length === recorded.length);

const rejected = new Simulation(startingGrid(), 9090);
const blocked = rejected.applyAction({ kind: 'place', id: 'cottage', cx: -12, cz: 4, rot: 0 }, 1);
check('acción bloqueada: devuelve blocked', !blocked.ok && blocked.reason === 'blocked');
check('acción bloqueada: no entra en actions', rejected.actions.length === 0);
const placed = rejected.applyAction({ kind: 'place', id: 'cottage', cx: -5, cz: 8, rot: 0 }, 2);
check('place residencial: se acepta', placed.ok);
check('place residencial: llega al menos una persona', rejected.citizens.size >= 1);

// --- Vías del jugador -------------------------------------------------------
{
  const grid = new Grid();
  grid.fillTerrain(-15, -15, 15, 15, 'field');
  const sim = new Simulation(grid, 6060);
  const road: PlayerAction = { kind: 'road', road: 'rural', from: [-4, -2], to: [4, 3] };
  const result = sim.applyAction(road, 10);
  check('road: se acepta el trazado rural', result.ok);
  check('road: el índice crece exactamente con la calzada', sim.index.roadCells.length === (result.ok ? result.cost / 2 : -1) * 1 /* coste rural = 2 */);
  check('road: conserva roadKind en el grid', sim.grid.get(0, -2)?.roadKind === 'rural');
  check('road: emite el evento del jugador', sim.events.some((e) => e.name === 'roadBuilt' && e.data.byPlayer === true));
  check('road: queda registrada para replay', sim.actions.length === 1 && sim.actions[0].action.kind === 'road');

  const replayGrid = new Grid();
  replayGrid.fillTerrain(-15, -15, 15, 15, 'field');
  const replay = new Simulation(replayGrid, 6060);
  replayActions(replay, sim.actions, sim.clock.tick);
  check('road: replay conserva la geometría', replay.grid.serialize() === sim.grid.serialize());

  const lockedGrid = new Grid();
  lockedGrid.fillTerrain(-5, -5, 5, 5, 'field');
  const locked = new Simulation(lockedGrid, 7070);
  const street = locked.applyAction({ kind: 'road', road: 'street', from: [-2, 0], to: [2, 0] }, 1);
  check('road: la calle queda bloqueada hasta tier 2', !street.ok && street.reason === 'tierLocked');
}

console.log(`\nactions.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
