/** Tests puros de zonas y selección de parcelas autónomas. */
import { Grid, rotatedFootprint } from './grid';
import { createRng } from '../rng';
import { catalogData } from './catalogData';
import { demandLevels, findParcel, growthCenter, itemForDemand, paintYard, residentialChoices, residentialVisualId, townAttractiveness, zoneForRole } from './growth';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function roadGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-30, -30, 30, 30, 'field');
  for (let cx = -30; cx <= 30; cx++) grid.setRoad(cx, 0, 'rural');
  grid.clearJournal();
  return grid;
}

function footprintIsZone(grid: Grid, id: string, p: { cx: number; cz: number; rot: 0 | 1 | 2 | 3 }, zone: string): boolean {
  const item = catalogData(id)!;
  const [fw, fd] = rotatedFootprint(item.w, item.d, p.rot);
  for (let cx = p.cx; cx < p.cx + fw; cx++) {
    for (let cz = p.cz; cz < p.cz + fd; cz++) if (grid.get(cx, cz)?.zone !== zone) return false;
  }
  return true;
}

// --- Mapeo de roles y selección restringida --------------------------------
{
  assert(zoneForRole('residential') === 'R', 'residencial pide zona R');
  assert(zoneForRole('commerce') === 'C', 'comercio pide zona C');
  assert(zoneForRole('work') === 'I' && zoneForRole('agriculture') === 'A', 'trabajo y agricultura tienen zonas propias');
  assert(zoneForRole('civic') === 'P', 'cívico se orienta a zona P');

  const noZones = roadGrid();
  assert(findParcel(noZones, 'cottage', [0, 0], createRng(1), 'zonesOnly', 30) === null, 'zonesOnly no construye sin zona compatible');

  const residential = roadGrid();
  residential.forEachInRect(-30, -30, 30, 30, (cell, cx, cz) => {
    if (cell.terrain !== 'road') residential.setZone(cx, cz, 'R');
  });
  const home = findParcel(residential, 'cottage', [0, 0], createRng(1), 'zonesOnly', 30);
  assert(home !== null && footprintIsZone(residential, 'cottage', home!, 'R'), 'zonesOnly coloca toda la huella residencial en R');

  const commerce = roadGrid();
  commerce.forEachInRect(-30, -30, 30, 30, (cell, cx, cz) => {
    if (cell.terrain !== 'road') commerce.setZone(cx, cz, 'C');
  });
  const shop = findParcel(commerce, 'shop', [0, 0], createRng(2), 'zonesOnly', 30);
  assert(shop !== null && footprintIsZone(commerce, 'shop', shop!, 'C'), 'la demanda comercial encuentra una tienda en C');
}

// --- Preferencia zonificada y centro de zonas ------------------------------
{
  const grid = roadGrid();
  for (let cx = 12; cx <= 18; cx++) for (let cz = 2; cz <= 5; cz++) grid.setZone(cx, cz, 'R');
  const free = findParcel(grid, 'cottage', [0, 0], createRng(1), 'free', 30);
  const preferred = findParcel(grid, 'cottage', [0, 0], createRng(1), 'preferZones', 30);
  const freeDist = free ? Math.abs(free.cx) + Math.abs(free.cz) : -1;
  const preferredDist = preferred ? Math.abs(preferred.cx) + Math.abs(preferred.cz) : -1;
  assert(free !== null && preferred !== null && preferredDist >= freeDist + 6, 'preferZones elige la zona aunque esté al menos seis celdas más lejos');
  assert(preferred !== null && footprintIsZone(grid, 'cottage', preferred, 'R'), 'preferZones prioriza una huella compatible');

  const empty = new Grid();
  empty.fillTerrain(4, 5, 7, 8, 'field');
  empty.setZone(5, 6, 'R');
  empty.setZone(6, 6, 'R');
  assert(growthCenter(empty, []).join() === '6,6', 'sin edificios el centro cae en el centroide de las zonas');
  assert(growthCenter(empty, [[-4, 9]]).join() === '-4,9', 'con edificios el centro sigue siendo el pueblo construido');
}

// --- El catálogo no salta el tier ------------------------------------------
{
  assert(residentialChoices(1).every((id) => (catalogData(id)?.tier ?? 99) <= 1), 'residentialChoices nunca supera el tier disponible');
  assert(residentialChoices(4).length > residentialChoices(1).length, 'residentialChoices crece al desbloquear tiers');
  assert(itemForDemand('residential', 1) === 'cottage', 'tier 1 no ofrece residenciales futuros');
  assert(itemForDemand('residential', 2) === 'row-houses', 'tier 2 ofrece el residencial desbloqueado más alto');
  assert(itemForDemand('residential', 3) !== 'brick-block', 'tier 3 no salta al tier 4');
  const visuals = new Set(Array.from({ length: 24 }, (_, x) => residentialVisualId('apartment-slab', x, x * 3, 0, 91)));
  assert(visuals.size > 1, 'las fachadas residenciales muestran mezcla determinista');
  assert([...visuals].every((id) => {
    const item = catalogData(id)!;
    return item.w <= 10 && item.d <= 4 && item.tier <= 3;
  }), 'cada fachada cabe en la parcela estructural y no adelanta tier');
}

// --- Demanda continua R/C/I -------------------------------------------------
{
  const base = {
    population: 40,
    employed: 32,
    jobs: 40,
    freeHousing: 2,
    shops: 2,
    avgProsperity: 0.6,
    attractiveness: 0.8,
    totalPopulation: 42,
    carryingCapacity: 120,
  };
  const full = demandLevels(base);
  const moreHousing = demandLevels({ ...base, freeHousing: 10 });
  const moreShops = demandLevels({ ...base, shops: 5 });
  const prosperous = demandLevels({ ...base, avgProsperity: 1 });
  const unemployed = demandLevels({ ...base, employed: 10, jobs: 10 });
  assert(moreHousing.R < full.R, 'la demanda residencial baja cuando sobran viviendas');
  assert(moreShops.C < full.C, 'la demanda comercial baja al aumentar las tiendas');
  assert(prosperous.C > full.C, 'la prosperidad confirma y eleva la demanda comercial');
  assert(unemployed.I > full.I, 'la demanda industrial sube con el desempleo');
  const extreme = demandLevels({
    population: 0,
    employed: -20,
    jobs: -20,
    freeHousing: -100,
    shops: 0,
    avgProsperity: 4,
    attractiveness: -2,
    totalPopulation: 500,
    carryingCapacity: 10,
  });
  assert([extreme.R, extreme.C, extreme.I].every((value) => value >= 0 && value <= 1), 'las tres demandas siempre están acotadas en [0,1]');
}

// --- Jardín render-only -----------------------------------------------------
{
  const grid = new Grid();
  grid.fillTerrain(0, 0, 8, 8, 'field');
  grid.setRoad(3, 4, 'rural');
  grid.setTerrain(7, 3, 'water');
  grid.placeBuilding('cottage', 3, 3, 4, 4, 0);
  const painted = paintYard(grid, 4, 4, 3, 3);
  assert(painted.length > 0, 'jardín: pinta suelo alrededor de la huella');
  assert(grid.get(4, 4)?.terrain === 'grass' && grid.get(6, 6)?.terrain === 'grass', 'jardín: cubre huella y retranqueo');
  assert(grid.get(3, 4)?.terrain === 'road', 'jardín: respeta la vía');
  assert(grid.get(7, 3)?.terrain === 'water', 'jardín: respeta el agua');
}

// --- Carga fiscal y atractividad (H3.2) -------------------------------------
{
  const input = { employment: 1, avgHealth: 0.95, avgFood: 0.9, avgPrestige: 0.7 };
  const normal = townAttractiveness({ ...input, taxBurden: 0.2 });
  const heavy = townAttractiveness({ ...input, taxBurden: 0.5 });
  assert(heavy < normal, 'impuestos: una carga por encima del 20% reduce la atractividad');
  assert(townAttractiveness(input) === normal, 'impuestos: el tipo neutral no cambia la atractividad');
  assert(townAttractiveness({ ...input, taxBurden: 0.2, bankrupt: true }) < normal, 'quiebra: resta atractividad sin detener el modelo');
}

console.log(`\ngrowth.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
