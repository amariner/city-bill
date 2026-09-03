/** Contratos de acciones y replay. Se ejecuta sin worker ni THREE. */
import { Grid } from '../world/grid';
import { Simulation } from './simulation';
import { replayActions } from './actions';
import type { PlayerAction } from './protocol';
import { ROAD_SPECS } from '../world/roads';
import { Economy } from './economy';

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
original.economy.treasury = 100_000;
for (let i = 0; i < actions.length; i++) {
  while (original.clock.tick < ticks[i]) original.step();
  const result = original.applyAction(actions[i], i + 1);
  check(`acción ${i + 1} se acepta en el tick ${ticks[i]}`, result.ok);
}
const endTick = original.clock.tick + 2 * Math.round(2400 / 36);
while (original.clock.tick < endTick) original.step();
const recorded = [...original.actions];

const replay = new Simulation(startingGrid(), 8080);
replay.economy.treasury = 100_000;
replayActions(replay, recorded, endTick);
check('replay: snapshot final idéntico', replay.snapshot().join(',') === original.snapshot().join(','));
check('replay: grid final idéntico', replay.grid.serialize() === original.grid.serialize());
check('replay: conserva el registro de acciones', replay.actions.length === recorded.length);

const rejected = new Simulation(startingGrid(), 9090);
rejected.economy.treasury = 10_000;
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
  sim.economy.treasury = 10_000;
  const road: PlayerAction = { kind: 'road', road: 'rural', from: [-4, -2], to: [4, 3] };
  const result = sim.applyAction(road, 10);
  check('road: se acepta el trazado rural', result.ok);
  check('road: el índice crece exactamente con la calzada', sim.index.roadCells.length === (result.ok ? result.cost / ROAD_SPECS.rural.costPerCell : -1));
  check('road: conserva roadKind en el grid', sim.grid.get(0, -2)?.roadKind === 'rural');
  check('road: emite el evento del jugador', sim.events.some((e) => e.name === 'roadBuilt' && e.data.byPlayer === true));
  check('road: queda registrada para replay', sim.actions.length === 1 && sim.actions[0].action.kind === 'road');

  const replayGrid = new Grid();
  replayGrid.fillTerrain(-15, -15, 15, 15, 'field');
  const replay = new Simulation(replayGrid, 6060);
  replay.economy.treasury = 10_000;
  replayActions(replay, sim.actions, sim.clock.tick);
  check('road: replay conserva la geometría', replay.grid.serialize() === sim.grid.serialize());

  const lockedGrid = new Grid();
  lockedGrid.fillTerrain(-5, -5, 5, 5, 'field');
  const locked = new Simulation(lockedGrid, 7070);
  const street = locked.applyAction({ kind: 'road', road: 'street', from: [-2, 0], to: [2, 0] }, 1);
  check('road: la calle queda bloqueada hasta tier 2', !street.ok && street.reason === 'tierLocked');
}

// --- Presupuesto de obras y mantenimiento (H3.1) ----------------------------
{
  const grid = new Grid();
  grid.fillTerrain(-20, -20, 20, 20, 'field');
  const sim = new Simulation(grid, 5150);
  sim.autonomousGrowth = false;
  const schoolCost = 1500;
  sim.economy.treasury = schoolCost + 500;
  const placed = sim.applyAction({ kind: 'place', id: 'school', cx: 4, cz: 4, rot: 0 }, 1);
  check('presupuesto: colocar escuela devuelve su coste', placed.ok && placed.cost === schoolCost);
  check('presupuesto: el tesoro baja exactamente el coste', sim.economy.treasury === 500);
  check('presupuesto: ledger.build registra el débito', sim.economy.ledger.build === schoolCost);

  const poorGrid = new Grid();
  poorGrid.fillTerrain(-20, -20, 20, 20, 'field');
  const poor = new Simulation(poorGrid, 5151);
  poor.autonomousGrowth = false;
  poor.economy.treasury = schoolCost - 1;
  const beforeGrid = poor.grid.serialize();
  const denied = poor.applyAction({ kind: 'place', id: 'school', cx: 4, cz: 4, rot: 0 }, 1);
  check('presupuesto: tesoro insuficiente devuelve noMoney', !denied.ok && denied.reason === 'noMoney');
  check('presupuesto: noMoney no muta el grid', poor.grid.serialize() === beforeGrid && poor.economy.treasury === schoolCost - 1);

  sim.economy.treasury = 10_000;
  const upkeep = sim.economy.chargeUpkeep(sim.index, ['rural', 'path']);
  check('mantenimiento: cobra edificios y vías una vez', upkeep === 61.5 && sim.economy.ledger.upkeep === 61.5);
  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const restored = new Simulation(Grid.deserialize(saved.gridJson), 5150, saved);
  check('presupuesto: el guardado conserva el ledger', restored.economy.ledger.build === schoolCost && restored.economy.ledger.upkeep === 61.5);

  const taxAction = sim.applyAction({ kind: 'setTax', sector: 'R', rate: 0.35 }, 101);
  check('impuestos: setTax cambia el tipo residencial', taxAction.ok && sim.economy.taxRates.R === 0.35);
  const clampedTax = sim.applyAction({ kind: 'setTax', sector: 'C', rate: 2 }, 102);
  check('impuestos: setTax acota el máximo al 50%', clampedTax.ok && sim.economy.taxRates.C === 0.5);
  const invalidTax = sim.applyAction({ kind: 'setTax', sector: 'I', rate: Number.NaN }, 103);
  check('impuestos: un tipo no numérico devuelve invalid', !invalidTax.ok && invalidTax.reason === 'invalid');
  check('impuestos: el HUD recibe los tipos efectivos', sim.cityStats().taxRates.R === 0.35 && sim.cityStats().taxRates.C === 0.5);
  const fiscalSave = JSON.parse(JSON.stringify(sim.serialize()));
  const fiscalRestore = new Simulation(Grid.deserialize(fiscalSave.gridJson), 5150, fiscalSave);
  check('impuestos: el guardado conserva las tasas', JSON.stringify(fiscalRestore.economy.taxRates) === JSON.stringify(sim.economy.taxRates));
  const fiscalReplayGrid = new Grid();
  fiscalReplayGrid.fillTerrain(-20, -20, 20, 20, 'field');
  const fiscalReplay = new Simulation(fiscalReplayGrid, 5150);
  fiscalReplay.autonomousGrowth = false;
  fiscalReplay.economy.treasury = schoolCost + 500;
  replayActions(fiscalReplay, sim.actions, sim.clock.tick);
  check('impuestos: el replay conserva las tasas', JSON.stringify(fiscalReplay.economy.taxRates) === JSON.stringify(sim.economy.taxRates));

  const taxes = new Economy();
  taxes.payWage('industry', 1, 0, 0, 'work');
  taxes.payWage('commerce', 1, 0, 0, 'commerce');
  check('impuestos: trabajo/agro suma renta y activity levy', taxes.walletOf('industry') === 7 && taxes.ledger.taxR === 4 && taxes.ledger.taxI === 1);
  check('impuestos: la nómina comercial usa renta, no sociedades', taxes.walletOf('commerce') === 8 && taxes.ledger.taxR === 4 && taxes.ledger.taxC === 0);
}

// --- Préstamos, quiebra y dividendo solvente (H3.3) -------------------------
{
  const loanEconomy = new Economy();
  const issued = loanEconomy.takeLoan(0);
  check('préstamo: el tramo sube tesoro y deuda por el mismo importe', issued?.principal === 2000 && loanEconomy.treasury === 2000 && loanEconomy.debt === 2000);
  check('préstamo: no duplica un tramo vivo', loanEconomy.takeLoan(0) === null && loanEconomy.loans.length === 1);
  for (let day = 0; day < 40; day++) loanEconomy.serviceLoans();
  check('préstamo: se amortiza al terminar el plazo', loanEconomy.debt < 1e-9 && loanEconomy.loans.length === 0);
  check('préstamo: el servicio registra intereses', loanEconomy.interestPaid > 0 && loanEconomy.ledger.interest === loanEconomy.interestPaid);

  const debtDividend = new Economy();
  debtDividend.treasury = 10_000;
  debtDividend.takeLoan(0);
  const shared = debtDividend.payPublicDividend(['a', 'b'], 10);
  check('dividendo: descuenta la deuda antes de repartir', shared === 1_750 && debtDividend.treasury === 10_250);

  const loanGrid = new Grid();
  loanGrid.fillTerrain(-20, -20, 20, 20, 'field');
  const loanSim = new Simulation(loanGrid, 5152);
  loanSim.autonomousGrowth = false;
  const loanAction = loanSim.applyAction({ kind: 'loan', tier: 0 }, 1);
  check('acción préstamo: acepta el primer tramo', loanAction.ok && loanSim.economy.debt === 2000);
  const duplicateLoan = loanSim.applyAction({ kind: 'loan', tier: 0 }, 2);
  check('acción préstamo: rechaza el tramo duplicado', !duplicateLoan.ok && duplicateLoan.reason === 'invalid');

  const bankrupt = new Simulation(startingGrid(), 5153);
  bankrupt.economy.treasury = -10_000;
  bankrupt.economy.updateBankruptcy(bankrupt.citizens.size);
  const deniedPlace = bankrupt.applyAction({ kind: 'place', id: 'cottage', cx: -5, cz: 8, rot: 0 }, 1);
  const deniedRoad = bankrupt.applyAction({ kind: 'road', road: 'rural', from: [-4, -2], to: [4, 3] }, 2);
  check('quiebra: bloquea colocar y trazar vías', !deniedPlace.ok && deniedPlace.reason === 'bankrupt' && !deniedRoad.ok && deniedRoad.reason === 'bankrupt');
  for (let day = 0; day < 5; day++) for (let tick = 0; tick < Math.round(2400 / 36); tick++) bankrupt.step();
  check('quiebra: la simulación sigue viva', bankrupt.citizens.size > 0);
  const bankruptSave = JSON.parse(JSON.stringify(bankrupt.serialize()));
  const bankruptRestore = new Simulation(Grid.deserialize(bankruptSave.gridJson), 5153, bankruptSave);
  check('quiebra: estado y deuda sobreviven al guardado', bankruptRestore.economy.bankrupt === bankrupt.economy.bankrupt && bankruptRestore.economy.debt === bankrupt.economy.debt);

  const budgetSim = new Simulation(startingGrid(), 5154);
  budgetSim.autonomousGrowth = false;
  for (let tick = 0; tick < Math.round(86400 / 36); tick++) budgetSim.step();
  const budget = budgetSim.cityStats().budget;
  check('presupuesto: el histórico guarda un punto por cierre diario', budget.history.length === 1 && budget.history[0].day === 0);
  check('presupuesto: expone flujo, desglose y préstamos', Number.isFinite(budget.incomeToday) && Number.isFinite(budget.expenseToday) && budget.breakdown.taxR >= 0 && Array.isArray(budget.loans));
}

// --- Zonas del jugador ------------------------------------------------------
{
  const grid = new Grid();
  grid.fillTerrain(-5, -5, 5, 5, 'field');
  grid.setRoad(0, 0, 'rural');
  grid.placeBuilding('barn', 1, 1, 2, 2);
  const sim = new Simulation(grid, 8088);
  const painted = sim.applyAction({ kind: 'zone', zone: 'R', x0: -2, z0: -2, x1: 3, z1: 3 }, 1);
  check('zone: se acepta el rectángulo', painted.ok);
  check('zone: pinta las parcelas elegibles', sim.grid.get(-1, -1)?.zone === 'R');
  check('zone: no zonifica una carretera', sim.grid.get(0, 0)?.zone === undefined);
  check('zone: no zonifica la huella de un edificio', sim.grid.get(2, 2)?.zone === undefined);
  const restored = Grid.deserialize(sim.grid.serialize());
  check('zone: sobrevive serialize/deserialize', restored.get(-1, -1)?.zone === 'R');
  const erased = sim.applyAction({ kind: 'zone', zone: null, x0: -2, z0: -2, x1: 3, z1: 3 }, 2);
  check('zone: Shift/borrado limpia el rectángulo', erased.ok && sim.grid.get(-1, -1)?.zone === undefined);
  const policy = sim.applyAction({ kind: 'setPolicy', policy: 'growth', value: 'zonesOnly' }, 3);
  check('policy: cambia la política de crecimiento', policy.ok && sim.growthPolicy === 'zonesOnly');
  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const continued = new Simulation(Grid.deserialize(saved.gridJson), 8088, saved);
  check('policy: sobrevive al guardado', continued.growthPolicy === 'zonesOnly' && continued.cityStats().growthPolicy === 'zonesOnly');
}

console.log(`\nactions.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
