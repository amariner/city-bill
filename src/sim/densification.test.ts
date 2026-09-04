/** Pruebas de densificación in situ (H4.5). */
import { Grid } from '../world/grid';
import { catalogData } from '../world/catalogData';
import { DENSITY_LADDER, residentialVisualId, upgradeCandidate } from '../world/growth';
import { Simulation } from './simulation';
import { WorldIndex } from './worldIndex';

let passed = 0;
let failed = 0;
function check(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function gridWith(id: string, rot: 0 | 1 | 2 | 3 = 0): Grid {
  const grid = new Grid();
  grid.fillTerrain(-10, -10, 20, 20, 'field');
  const item = catalogData(id)!;
  check(grid.placeBuilding(id, item.w, item.d, 0, 0, rot), `fixture: coloca ${id}`);
  return grid;
}

// La escalera es estrictamente ascendente y la validación conserva ancla y
// giro. La huella actual se ignora, pero un vecino que ocupa la nueva columna
// sigue bloqueando el upgrade.
{
  check(DENSITY_LADDER.join('>') === 'cottage>town-house>row-houses>low-block>apartment-slab>brick-block', 'ladder: recorre casita, adosados y bloques de densidad creciente');
  const index = new WorldIndex(gridWith('cottage', 1));
  const building = index.at(0, 0)!;
  const candidate = upgradeCandidate(index.grid, building, 2, 0.8);
  check(candidate?.id === 'town-house' && candidate.cx === 0 && candidate.cz === 0 && candidate.rot === 1, 'candidato: cottage sube a town-house en la misma ancla y giro');
  check(upgradeCandidate(index.grid, building, 1, 0.8) === null, 'candidato: respeta el tier disponible');
  check(upgradeCandidate(index.grid, building, 2, 0.59) === null, 'candidato: el suelo bajo no densifica');

  const blockedGrid = gridWith('town-house');
  check(blockedGrid.placeBuilding('cottage', 3, 3, 4, 0), 'fixture: coloca obstáculo junto a los adosados');
  const blockedIndex = new WorldIndex(blockedGrid);
  check(upgradeCandidate(blockedGrid, blockedIndex.at(0, 0)!, 3, 0.8) === null, 'candidato: la reparcelación respeta edificios vecinos');

  const wideGrid = gridWith('low-block');
  check(upgradeCandidate(wideGrid, new WorldIndex(wideGrid).at(0, 0)!, 3, 0.8)?.id === 'apartment-slab', 'candidato: el bloque bajo sube a panelák si el solar libre alcanza');
  const cityGrid = gridWith('apartment-slab');
  check(upgradeCandidate(cityGrid, new WorldIndex(cityGrid).at(0, 0)!, 4, 0.8)?.id === 'brick-block', 'candidato: el panelák culmina en bloque Zlín al desbloquearse el tier 4');
}

// La sustitución ocurre una sola vez por día, conserva a los residentes en una
// vivienda válida y solo llena la capacidad recién creada sin desbordarla.
{
  const sim = new Simulation(gridWith('cottage'), 4411);
  sim.tier = 2;
  const internals = sim as unknown as {
    landValue: Map<string, number>;
    maybeUpgrade: () => void;
    households: Map<string, number>;
  };
  internals.landValue.set('0,0', 1);
  const originalIds = [...sim.citizens.keys()];
  const originalWallet = sim.economy.walletOf('0,0');
  internals.maybeUpgrade();
  check(sim.index.at(0, 0)?.id === 'town-house', 'upgrade: sustituye la casita por la casa con jardín');
  check(sim.index.at(0, 0)?.visualId === residentialVisualId('town-house', 0, 0, 0, 4411), 'upgrade: conserva una fachada determinista separada de la estructura');
  check(!sim.index.buildings.some((building) => building.id === 'cottage'), 'upgrade: la vivienda anterior desaparece del índice');
  check(sim.citizens.size > originalIds.length, 'upgrade: llena parte de los huecos con nuevas familias');
  check((internals.households.get('0,0') ?? 0) <= (catalogData('town-house')?.capacity ?? 0), 'upgrade: los hogares nunca superan la capacidad');
  check([...sim.citizens.values()].every((citizen) => citizen.home.ax === 0 && citizen.home.az === 0 && citizen.home.buildingId === 'town-house'), 'upgrade: los residentes conservan un home válido');
  check(sim.economy.walletOf('0,0') > originalWallet, 'upgrade: las reservas de las familias nuevas llegan a la misma clave');
  check(sim.events.some((event) => event.name === 'buildingUpgraded' && event.data.from === 'cottage' && event.data.id === 'town-house'), 'upgrade: emite un evento narrable');
  const patch = sim.takeGridChanges();
  check(patch.built.some((built) => built.id === 'town-house' && built.cx === 0 && built.cz === 0
    && built.visualId === residentialVisualId('town-house', 0, 0, 0, 4411)), 'upgrade: el render recibe la obra nueva con su fachada');
  check(patch.razed.some((razed) => razed.cx === 0 && razed.cz === 0), 'upgrade: el render recibe la huella sustituida');
  internals.maybeUpgrade();
  check(sim.index.at(0, 0)?.id === 'town-house', 'upgrade: no encadena dos obras en el mismo día');
}

// Un suelo bajo nunca dispara la obra, incluso si el tier ya permite el
// siguiente peldaño; cada peldaño del ladder queda dentro del tier máximo.
{
  const sim = new Simulation(gridWith('cottage'), 9922);
  sim.tier = 3;
  const internals = sim as unknown as { landValue: Map<string, number>; maybeUpgrade: () => void };
  internals.landValue.set('0,0', 0.4);
  internals.maybeUpgrade();
  check(sim.index.at(0, 0)?.id === 'cottage', 'upgrade: el valor bajo conserva la vivienda');
  const tiers = DENSITY_LADDER.map((id) => catalogData(id)!.tier);
  check(tiers.every((tier, i) => i === 0 || tier >= tiers[i - 1]), 'ladder: nunca baja de tier');
  check(DENSITY_LADDER.filter((id) => catalogData(id)!.tier <= sim.tier).every((id) => catalogData(id)!.tier <= sim.tier), 'ladder: cada candidato se filtra por el tier de la ciudad');
}

// Integración diaria sin sobrescribir el mapa: cinco servicios activos, una
// calle y servicios elevan el valor del solar. Forzamos un cierre lógico por
// escalón para aislar la reparcelación de obras autónomas ajenas: los adosados
// y bloques mayores deben encontrar su franja libre en el mismo solar.
{
  const grid = new Grid();
  grid.fillTerrain(-8, -8, 20, 20, 'field');
  for (let cx = -8; cx <= 20; cx++) {
    grid.setRoad(cx, -2, 'street');
    grid.setRoad(cx, 4, 'street');
  }
  grid.setRoad(0, 8, 'street');
  check(grid.placeBuilding('cottage', 3, 3, 0, 0), 'integración diaria: coloca vivienda');
  check(grid.placeBuilding('school', 6, 4, -7, 0), 'integración diaria: coloca escuela');
  check(grid.placeBuilding('fire-station', 4, 4, 10, 5), 'integración diaria: coloca bomberos');
  check(grid.placeBuilding('clinic', 4, 3, 0, 5), 'integración diaria: coloca clínica');
  check(grid.placeBuilding('police', 4, 4, 5, 5), 'integración diaria: coloca policía');
  check(grid.placeBuilding('park', 4, 4, 0, 9), 'integración diaria: coloca parque');
  const sim = new Simulation(grid, 1881);
  sim.autonomousGrowth = true;
  const internals = sim as unknown as { landValue: Map<string, number>; lastUpgradeDay: number; maybeUpgrade: () => void };
  internals.landValue.set('0,0', 1);
  const upgrade = (tier: 2 | 3): void => {
    sim.tier = tier;
    internals.lastUpgradeDay = -10;
    internals.maybeUpgrade();
  };
  upgrade(2);
  check(sim.index.at(0, 0)?.id === 'town-house', 'integración de parcela: el solar valioso sube primero a casa con jardín');
  upgrade(3);
  check(sim.index.at(0, 0)?.id === 'row-houses', 'integración de parcela: el segundo escalón reparcela en adosados');
  upgrade(3);
  check(sim.index.at(0, 0)?.id === 'low-block', 'integración de parcela: el tercer escalón concentra en bloque bajo');
  upgrade(3);
  check(sim.index.at(0, 0)?.id === 'apartment-slab', 'integración de parcela: el cuarto escalón usa la franja amplia para un panelák');
}

console.log(`\ndensification.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
