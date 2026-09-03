/** Tests puros de zonas y selección de parcelas autónomas. */
import { Grid, rotatedFootprint } from './grid';
import { createRng } from '../rng';
import { catalogData } from './catalogData';
import { findParcel, growthCenter, itemForDemand, residentialChoices, zoneForRole } from './growth';

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
}

console.log(`\ngrowth.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
