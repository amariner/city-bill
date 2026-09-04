import { Grid } from '../world/grid';
import { seedFarm } from '../world/seed';
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

const seed = 42;
const original = new Simulation(seedFarm(seed), seed);
original.economy.treasury = 100_000;
for (let i = 0; i < 700; i++) original.step();
original.growthPolicy = 'preferZones';
const blob = JSON.stringify(original.serialize());
const state = JSON.parse(blob);
const restored = new Simulation(Grid.deserialize(state.gridJson), seed, state);

check('save: el JSON restaura el reloj', restored.clock.tick === original.clock.tick && restored.clock.time === original.clock.time);
check('save: restaura población y grid', restored.citizens.size === original.citizens.size && restored.grid.serialize() === original.grid.serialize());
check('save: conserva el registro de acciones', restored.actions.length === original.actions.length);
check('save: conserva la política de crecimiento', restored.growthPolicy === 'preferZones' && restored.cityStats().growthPolicy === 'preferZones');

for (let i = 0; i < 240 * 3; i++) {
  original.step();
  restored.step();
}
check('save: continuar tres días conserva el snapshot', equalArrays(original.snapshot(), restored.snapshot()));
check('save: continuar tres días conserva el grid', original.grid.serialize() === restored.grid.serialize());

const action = { kind: 'place', id: 'cottage', cx: 20, cz: 20, rot: 0 } as const;
const a = original.applyAction(action, 9001);
const b = restored.applyAction(action, 9001);
check('save: una acción posterior se acepta en ambas ramas', a.ok && b.ok);
check('save: el replay posterior sigue alineado', original.grid.serialize() === restored.grid.serialize() && original.actions.length === restored.actions.length);

// H1: `visualId` pertenece al grid serializado, pero se comprueba aquí el
// recorrido completo worker → JSON → worker para que una carga no devuelva la
// fachada al id estructural de la parcela.
{
  const grid = new Grid();
  grid.fillTerrain(-4, -4, 8, 8, 'field');
  check('save fachada: coloca la parcela de prueba', grid.placeBuilding('town-house', 4, 3, 0, 0, 0, 6, 'cottage'));
  const source = new Simulation(grid, 9411);
  source.autonomousGrowth = false;
  const state = JSON.parse(JSON.stringify(source.serialize()));
  const loaded = new Simulation(Grid.deserialize(state.gridJson), 9411, state);
  check('save fachada: el índice restaurado conserva la tipología visual', loaded.index.at(0, 0)?.visualId === 'cottage');
  check('save fachada: conserva además la capacidad de parcela', loaded.index.at(0, 0)?.capacity === 6);
}

console.log(`\nsave.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests fallidos`);

function equalArrays(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
