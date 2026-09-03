/** Conservación de dinero y replay económico (H3.5). */
import { Grid } from '../world/grid';
import { seedWorld } from '../world/seed';
import { DAY_GAME_SECONDS, TICK_GAME_S } from './clock';
import { Simulation } from './simulation';
import { replayActions } from './actions';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

const ticksPerDay = Math.round(DAY_GAME_SECONDS / TICK_GAME_S);
const endTick = ticksPerDay * 10;

function setup(): Simulation {
  const sim = new Simulation(seedWorld(), 42);
  sim.autonomousGrowth = false;
  // El capital inicial del tesoro forma parte de M(0), no es acuñación del
  // período que estamos auditando.
  sim.economy.treasury = 100_000;
  return sim;
}

function advance(sim: Simulation, tick: number): void {
  while (sim.clock.tick < tick) sim.step();
  if (sim.clock.tick !== tick) throw new Error(`tick inesperado: ${sim.clock.tick}`);
}

const original = setup();
const initialSupply = original.economy.moneySupply();
advance(original, 300);
check('conservación: la acción de escuela se acepta', original.applyAction({ kind: 'place', id: 'school', cx: 68, cz: 18, rot: 0 }, 1).ok);
advance(original, 900);
check('conservación: la acción de vía se acepta', original.applyAction({ kind: 'road', road: 'rural', from: [66, 8], to: [70, 8] }, 2).ok);
advance(original, 1500);
check('conservación: la acción de préstamo se acepta', original.applyAction({ kind: 'loan', tier: 0 }, 3).ok);
advance(original, endTick);

const flow = original.economy.moneyFlow();
const expectedDelta = flow.minted - flow.leaked - flow.build - flow.interest + flow.loanIn - flow.loanOut;
const actualDelta = flow.supply - initialSupply;
check(
  'conservación: M(t) = wallets + tills + treasury',
  Math.abs(flow.supply - original.economy.moneySupply()) < 1e-9,
);
check(
  'conservación: la ecuación monetaria cierra en 10 días',
  Math.abs(actualDelta - expectedDelta) < 1e-6,
  `→ error ${(actualDelta - expectedDelta).toExponential(3)}`,
);
check('conservación: el desglose incluye obra, interés y capital', flow.build > 0 && flow.interest > 0 && flow.loanIn === 2_000 && flow.loanOut > 0);
check('conservación: los sumideros externos quedan nombrados', flow.goodsImported > 0 && flow.lifestyleLeft > 0 && flow.prestige > 0 && flow.transport > 0);

const recorded = [...original.actions];
const replay = setup();
replayActions(replay, recorded, endTick);
const replayFlow = replay.economy.moneyFlow();
check('replay dinero: conserva el snapshot', replay.snapshot().join(',') === original.snapshot().join(','));
check('replay dinero: conserva el grid y las acciones', replay.grid.serialize() === original.grid.serialize() && replay.actions.length === recorded.length);
check('replay dinero: conserva la masa monetaria', Math.abs(replay.economy.moneySupply() - original.economy.moneySupply()) < 1e-9);
check('replay dinero: conserva el flujo auditado', JSON.stringify(replayFlow) === JSON.stringify(flow));

const saved = JSON.parse(JSON.stringify(original.serialize()));
const restored = new Simulation(Grid.deserialize(saved.gridJson), 42, saved);
check('save dinero: conserva la masa monetaria', Math.abs(restored.economy.moneySupply() - original.economy.moneySupply()) < 1e-9);
check('save dinero: conserva la auditoría', JSON.stringify(restored.economy.moneyFlow()) === JSON.stringify(flow));

console.log(`\nmoney.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
