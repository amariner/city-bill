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

console.log(`\nactions.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
