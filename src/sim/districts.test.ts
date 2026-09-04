/** Distritos y políticas H5.5: persistencia, acciones y efectos locales. */
import { Grid } from '../world/grid';
import { replayActions } from './actions';
import { Simulation } from './simulation';
import type { PlayerAction } from './protocol';
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

function districtGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-10, -10, 10, 10, 'field');
  for (let cx = -8; cx <= 8; cx++) grid.setRoad(cx, 0, 'rural');
  grid.placeBuilding('cottage', 3, 3, -5, 2, 0);
  return grid;
}

// La capa espacial viaja por serialize, journal y GridPatch sin perderse.
{
  const source = districtGrid();
  source.clearJournal();
  source.setDistrict(-2, -2, 3);
  const patch = source.takeJournal();
  const twin = new Grid();
  twin.applyPatch(patch);
  check('grid: el distrito sobrevive al patch', twin.get(-2, -2)?.district === 3);
  const restored = Grid.deserialize(source.serialize());
  check('grid: el distrito sobrevive al save', restored.get(-2, -2)?.district === 3);
  check('grid: el round-trip conserva el estado canónico', restored.serialize() === source.serialize());
}

const sim = new Simulation(districtGrid(), 5505);
sim.autonomousGrowth = false;
const paint: PlayerAction = { kind: 'district', op: 'paint', district: 1, x0: -4, z0: -2, x1: 4, z1: 2 };
const painted = sim.applyAction(paint, 1);
check('acción: pinta un distrito sobre terreno existente', painted.ok && sim.grid.get(0, 0)?.district === 1);
check('estadísticas: publica distritos y políticas', sim.cityStats().districts === 1 && sim.cityStats().districtPolicies.length === 0);

const noIndustry = sim.applyAction({ kind: 'district', op: 'policy', district: 1, policy: 'noIndustry', value: true }, 2);
const speed = sim.applyAction({ kind: 'district', op: 'policy', district: 1, policy: 'speed30', value: true }, 3);
const parks = sim.applyAction({ kind: 'district', op: 'policy', district: 1, policy: 'parksPriority', value: true }, 4);
const tax = sim.applyAction({ kind: 'district', op: 'policy', district: 1, policy: 'taxDelta', value: 0.1 }, 5);
check('políticas: acepta las cuatro políticas del panel', noIndustry.ok && speed.ok && parks.ok && tax.ok);
check('políticas: quedan visibles en CityStats', sim.cityStats().districtPolicies[0]?.[1].speed30 === true && sim.cityStats().districtPolicies[0]?.[1].taxDelta === 0.1);

const growthReader = sim as unknown as { growthAllowed: (id: string, cx: number, cz: number) => boolean };
check('sin industria: bloquea fábrica dentro del distrito', growthReader.growthAllowed('factory', 0, 0) === false);
check('sin industria: conserva tiendas y agricultura', growthReader.growthAllowed('shop', 0, 0) && growthReader.growthAllowed('barn', 0, 0));
check('sin industria: permite fábrica fuera del distrito', growthReader.growthAllowed('factory', 8, 8) === true);

const speedReader = sim as unknown as { speedAt: (cx: number, cz: number, mode: 'car') => number };
const localSpeed = speedReader.speedAt(0, 0, 'car');
const outsideSpeed = speedReader.speedAt(8, 0, 'car');
check('velocidad 30: ralentiza la calzada del distrito', localSpeed < outsideSpeed && Math.abs(localSpeed / outsideSpeed - 0.6) < 1e-9);
check('fiscalidad: el delta positivo reduce la nómina local', sim.districtTaxDelta(0, 0) === 0.1 && sim.districtTaxDelta(8, 8) === 0);

const baseEconomy = new Economy();
const taxedEconomy = new Economy();
baseEconomy.payWage('base', 1, 0, 0, 'commerce');
taxedEconomy.payWage('taxed', 1, 0, 0, 'commerce', 0.1);
check('fiscalidad: payWage aplica el delta sin cambiar el bruto', baseEconomy.walletOf('base') === 8 && taxedEconomy.walletOf('taxed') === 7);

const saved = JSON.parse(JSON.stringify(sim.serialize()));
const restoredSim = new Simulation(Grid.deserialize(saved.gridJson), 5505, saved);
check('save: conserva políticas de distrito', restoredSim.policyForDistrict(1).noIndustry && restoredSim.policyForDistrict(1).taxDelta === 0.1);
check('save: conserva la capa pintada', restoredSim.grid.get(0, 0)?.district === 1);

const replay = new Simulation(districtGrid(), 5505);
replay.autonomousGrowth = false;
replayActions(replay, sim.actions, sim.clock.tick);
check('replay: reproduce pintura y políticas', replay.grid.serialize() === sim.grid.serialize()
  && JSON.stringify([...replay.districtPolicies]) === JSON.stringify([...sim.districtPolicies]));

const denied = sim.applyAction({ kind: 'district', op: 'paint', district: 100, x0: 0, z0: 0, x1: 1, z1: 1 }, 6);
check('validación: rechaza identificadores fuera de rango', !denied.ok && denied.reason === 'invalid');
const erased = sim.applyAction({ kind: 'district', op: 'paint', district: null, x0: -1, z0: -1, x1: 1, z1: 1 }, 7);
check('acción: permite borrar el distrito', erased.ok && sim.grid.get(0, 0)?.district === undefined);

console.log(`\ndistricts.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
