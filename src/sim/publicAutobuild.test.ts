/** Servicios públicos autónomos: demanda, coste, política y guardado (H4.8). */
import { Grid } from '../world/grid';
import { computeDemand } from '../world/growth';
import { Simulation } from './simulation';
import { chronicleText } from '../ui/chronicle';

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

const base = {
  population: 64,
  employed: 64,
  jobs: 64,
  freeHousing: 4,
  shops: 4,
  avgProsperity: 0.6,
  tier: 2 as const,
  children: 0,
  studentSlots: 0,
  avgHealth: 1,
  hasClinic: true,
  totalPopulation: 64,
  carryingCapacity: 120,
};

check('demanda pública: comisaría cuando falta cobertura', computeDemand({ ...base, policeCoverage: 0 }) === 'police');
check('demanda pública: bomberos cuando falta cobertura', computeDemand({ ...base, totalPopulation: 80, policeCoverage: 1, fireCoverage: 0 }) === 'fire');
check('demanda pública: parque cuando cae la felicidad', computeDemand({ ...base, tier: 1, avgHappiness: 0.4, parkCoverage: 0 }) === 'park');
check('demanda pública: cobertura suficiente no dispara servicios', computeDemand({ ...base, policeCoverage: 1, fireCoverage: 1, parkCoverage: 1, avgHappiness: 0.4 }) === null);
check('narrativa pública: manual explica la necesidad', chronicleText('serviceNeeded', { label: 'Consultorio', reason: 'disabled' }) === 'hace falta un servicio: Consultorio');
check('narrativa pública: tesoro explica el bloqueo', chronicleText('serviceNeeded', { label: 'Consultorio', reason: 'noMoney' }) === 'el tesoro no alcanza para Consultorio');

function serviceGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-50, -20, 50, 20, 'field');
  for (let cx = -50; cx <= 50; cx++) grid.setRoad(cx, 0, 'street');
  for (let i = 0; i < 20; i++) {
    const placed = grid.placeBuilding('cottage', 3, 3, -45 + i * 4, 2, 0);
    check(`fixture: coloca vivienda ${i + 1}`, placed);
  }
  grid.clearJournal();
  return grid;
}

function growOnce(sim: Simulation): void {
  (sim as unknown as { maybeGrow: () => void }).maybeGrow();
}

// Manual: la necesidad se comunica, pero la obra no aparece ni consume caja.
{
  const sim = new Simulation(serviceGrid(), 4808);
  sim.autonomousGrowth = false;
  sim.publicAutobuild = 'off';
  sim.economy.treasury = 10_000;
  growOnce(sim);
  const needed = sim.events.filter((event) => event.name === 'serviceNeeded');
  check('manual: no construye el consultorio', !sim.index.buildings.some((building) => building.id === 'clinic'));
  check('manual: emite la necesidad con motivo', needed.length === 1 && needed[0].data.kind === 'clinic' && needed[0].data.reason === 'disabled');
  growOnce(sim);
  check('manual: no repite el aviso en cada intento', sim.events.filter((event) => event.name === 'serviceNeeded').length === 1);
}

// Pagados: la ciudad solo confirma la obra después de poder pagarla y el débito
// queda en el mismo ledger que las construcciones del alcalde.
{
  const sim = new Simulation(serviceGrid(), 4809);
  sim.autonomousGrowth = false;
  sim.publicAutobuild = 'paid';
  sim.economy.treasury = 10_000;
  growOnce(sim);
  check('pagados: levanta el consultorio', sim.index.buildings.some((building) => building.id === 'clinic'));
  check('pagados: cobra el coste exacto', sim.economy.treasury === 9_200 && sim.economy.ledger.build === 800);
  check('pagados: resuelve el aviso pendiente', !sim.events.some((event) => event.name === 'serviceNeeded'));
}

// NoMoney es observable y también queda acotado a un solo aviso.
{
  const sim = new Simulation(serviceGrid(), 4810);
  sim.autonomousGrowth = false;
  sim.publicAutobuild = 'paid';
  sim.economy.treasury = 0;
  growOnce(sim);
  const needed = sim.events.filter((event) => event.name === 'serviceNeeded');
  check('sin fondos: no construye el consultorio', !sim.index.buildings.some((building) => building.id === 'clinic'));
  check('sin fondos: explica que falta tesoro', needed.length === 1 && needed[0].data.reason === 'noMoney');
}

// No basta con poder inaugurar: la ciudad deja el primer mes operativo en caja.
{
  const scarce = new Simulation(serviceGrid(), 4812);
  scarce.autonomousGrowth = false;
  scarce.publicAutobuild = 'paid';
  scarce.economy.treasury = 1_999; // clínica: 800 + 30 × 40 = 2.000
  growOnce(scarce);
  check('reserva: no inaugura un consultorio que no puede sostener un mes', !scarce.index.buildings.some((building) => building.id === 'clinic'));
  check('reserva: comunica el mismo bloqueo de tesoro', scarce.events.some((event) => event.name === 'serviceNeeded' && event.data.reason === 'noMoney'));

  const solvent = new Simulation(serviceGrid(), 4813);
  solvent.autonomousGrowth = false;
  solvent.publicAutobuild = 'paid';
  solvent.economy.treasury = 2_000;
  growOnce(solvent);
  check('reserva: permite la obra cuando cubre coste y primer mes', solvent.index.buildings.some((building) => building.id === 'clinic') && solvent.economy.treasury === 1_200);
}

// La elección es una acción normal: se registra y sobrevive al save, igual que
// la política espacial y los impuestos.
{
  const sim = new Simulation(serviceGrid(), 4811);
  sim.autonomousGrowth = false;
  const action = sim.applyAction({ kind: 'setPolicy', policy: 'publicAutobuild', value: 'off' }, 1);
  const saved = JSON.parse(JSON.stringify(sim.serialize()));
  const restored = new Simulation(Grid.deserialize(saved.gridJson), 4811, saved);
  check('política: setPolicy cambia a manual', action.ok && sim.publicAutobuild === 'off');
  check('política: el save conserva la elección y avisos', restored.publicAutobuild === 'off' && saved.serviceNeedsReported.length === 0);
}

console.log(`\npublicAutobuild.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
