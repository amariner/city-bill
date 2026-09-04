/** Tests puros de zonas y selección de parcelas autónomas. */
import { Grid, rotatedFootprint } from './grid';
import { catalogData } from './catalogData';
import { carryingCapacityFor, CARRYING_CAPACITY, layoutMetrics, demandLevels, extendRoad, findParcel, growthCenter, itemForDemand, paintYard, residentialChoices, residentialVisualId, tierForPopulation, townAttractiveness, zoneForRole } from './growth';

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
  assert(findParcel(noZones, 'cottage', [0, 0], 1, 'zonesOnly', 30) === null, 'zonesOnly no construye sin zona compatible');

  const residential = roadGrid();
  residential.forEachInRect(-30, -30, 30, 30, (cell, cx, cz) => {
    if (cell.terrain !== 'road') residential.setZone(cx, cz, 'R');
  });
  const home = findParcel(residential, 'cottage', [0, 0], 1, 'zonesOnly', 30);
  assert(home !== null && footprintIsZone(residential, 'cottage', home!, 'R'), 'zonesOnly coloca toda la huella residencial en R');

  const commerce = roadGrid();
  commerce.forEachInRect(-30, -30, 30, 30, (cell, cx, cz) => {
    if (cell.terrain !== 'road') commerce.setZone(cx, cz, 'C');
  });
  const shop = findParcel(commerce, 'shop', [0, 0], 2, 'zonesOnly', 30);
  assert(shop !== null && footprintIsZone(commerce, 'shop', shop!, 'C'), 'la demanda comercial encuentra una tienda en C');
}

// --- H7.1: findParcel no consume el RNG vital -------------------------------
{
  const grid = roadGrid();
  const a = findParcel(grid, 'cottage', [0, 0], 4242, 'free', 30);
  const b = findParcel(grid, 'cottage', [0, 0], 4242, 'free', 30);
  assert(a !== null && b !== null && a.cx === b.cx && a.cz === b.cz && a.rot === b.rot, 'findParcel: misma semilla y grid ⇒ misma parcela (sin estado)');
  // El desempate depende de la semilla: en un frente con muchos candidatos
  // equidistantes, alguna semilla elige otra parcela.
  const picks = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const p = findParcel(grid, 'cottage', [0, 0], seed, 'free', 30);
    if (p) picks.add(`${p.cx},${p.cz},${p.rot}`);
  }
  assert(picks.size > 1, `findParcel: el desempate por hash varía con la semilla (${picks.size} parcelas distintas)`);
}

// --- Preferencia zonificada y centro de zonas ------------------------------
{
  const grid = roadGrid();
  for (let cx = 12; cx <= 18; cx++) for (let cz = 2; cz <= 5; cz++) grid.setZone(cx, cz, 'R');
  const free = findParcel(grid, 'cottage', [0, 0], 1, 'free', 30);
  const preferred = findParcel(grid, 'cottage', [0, 0], 1, 'preferZones', 30);
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
  assert(tierForPopulation(0) === 1 && tierForPopulation(24) === 1, 'tier 1 hasta antes de 25 habitantes');
  assert(tierForPopulation(25) === 2 && tierForPopulation(79) === 2, 'tier 2 entre 25 y 79 habitantes');
  assert(tierForPopulation(80) === 3 && tierForPopulation(199) === 3, 'tier 3 entre 80 y 199 habitantes');
  assert(tierForPopulation(200) === 4, 'tier 4 abre la ciudad Zlín a 200 habitantes');
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

// --- Calle autónoma = calle del jugador ------------------------------------
{
  const grid = new Grid();
  grid.fillTerrain(-8, -8, 8, 8, 'field');
  // La banda de tres celdas debe frenar en el agua, sin "secarla" para abrir
  // paso. Es el mismo contrato de paintRoad usado por la herramienta manual.
  grid.setTerrain(0, 3, 'water');
  const laid = extendRoad(grid, [0, 0], { dx: 0, dz: 1 }, 6, 19);
  assert(laid.length === 6, 'calle autónoma se detiene antes de la franja de agua');
  assert(grid.get(0, 2)?.terrain === 'road' && grid.get(0, 3)?.terrain === 'water', 'calle autónoma comparte el veto de agua de la carretera manual');
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

// --- H7: layoutMetrics -------------------------------------------------------
{
  // Una sola calle recta con casas a un lado: tira (aspect alto), 1 tramo, 0 manzanas.
  const ribbon = new Grid();
  ribbon.fillTerrain(-20, -10, 40, 10, 'field');
  extendRoad(ribbon, [-18, 0], { dx: 1, dz: 0 }, 36, 1);
  for (let x = -15; x <= 30; x += 4) ribbon.placeBuilding('cottage', 3, 3, x, 2, 0);
  const r = layoutMetrics(ribbon);
  assert(r.streets === 1, `tira: 1 tramo (fue ${r.streets})`);
  assert(r.blocks === 0, `tira: 0 manzanas (fue ${r.blocks})`);
  assert(r.aspect > 3, `tira: aspect alto (fue ${r.aspect.toFixed(2)})`);
  assert(r.buildings === 12, `tira: cuenta 12 casas (fue ${r.buildings})`);

  // Una retícula de 2×2 calles cerrando una manzana con casas alrededor.
  const mesh = new Grid();
  mesh.fillTerrain(-20, -20, 20, 20, 'field');
  extendRoad(mesh, [-18, -8], { dx: 1, dz: 0 }, 36, 1);
  extendRoad(mesh, [-18, 8], { dx: 1, dz: 0 }, 36, 1);
  extendRoad(mesh, [-8, -18], { dx: 0, dz: 1 }, 36, 1);
  extendRoad(mesh, [8, -18], { dx: 0, dz: 1 }, 36, 1);
  const m = layoutMetrics(mesh);
  assert(m.streets === 4, `trama: 4 tramos (fue ${m.streets})`);
  assert(m.blocks === 1, `trama: 1 manzana cerrada (fue ${m.blocks})`);
  assert(m.aspect === 1, `sin edificios el aspect es 1 (fue ${m.aspect})`);
}

// --- H7.2: findParcel no tapa los extremos de una vía --------------------------
{
  const grid = new Grid();
  grid.fillTerrain(-30, -30, 30, 30, 'field');
  extendRoad(grid, [-8, 0], { dx: 1, dz: 0 }, 17, 1); // vía recta de x=-8..8, z=-1..1
  let capped = false;
  for (let i = 0; i < 40; i++) {
    const p = findParcel(grid, 'cottage', [0, 0], 7, 'free', 30);
    if (!p) break;
    // Un cabo tapado = huella que pisa la prolongación de la calzada (z ∈ [-1,1]) más allá de x=8 o antes de x=-8.
    const [fw, fd] = rotatedFootprint(3, 3, p.rot);
    for (let x = p.cx; x < p.cx + fw; x++) for (let z = p.cz; z < p.cz + fd; z++) if (z >= -1 && z <= 1 && (x > 8 || x < -8)) capped = true;
    grid.placeBuilding('cottage', 3, 3, p.cx, p.cz, p.rot);
  }
  assert(!capped, 'findParcel: ninguna parcela tapa la prolongación de la calle');
  assert(grid.get(-11, 0)?.building === undefined && grid.get(11, 0)?.building === undefined, 'los cabos de la vía quedan libres para extenderla');
}

// --- H7.2: capacidad de carga escalonada por tier -------------------------------
{
  assert(carryingCapacityFor(1) === CARRYING_CAPACITY, 'K: la aldea conserva el techo clásico');
  assert(carryingCapacityFor(2) > tierThreshold(3) && carryingCapacityFor(3) > tierThreshold(4), 'K: cada meseta queda por encima del umbral del tier siguiente (la escalera no se atasca)');
  assert(carryingCapacityFor(4) > carryingCapacityFor(3) && carryingCapacityFor(3) > carryingCapacityFor(2), 'K: monótono con el tier');
}
function tierThreshold(tier: number): number {
  let pop = 0;
  while (tierForPopulation(pop) < tier) pop++;
  return pop;
}

// --- H7.2: el lugar de trabajo se dimensiona al paro ---------------------------
{
  assert(itemForDemand('work', 4, 1) === 'shop', 'trabajo: un parado ⇒ una tienda (3 puestos)');
  assert(catalogData(itemForDemand('work', 4, 10))!.jobs! >= 10, 'trabajo: diez parados ⇒ un lugar con ≥ 10 puestos');
  assert(itemForDemand('work', 4, 35) === 'factory', 'trabajo: mucho paro ⇒ fábrica');
  assert(catalogData(itemForDemand('work', 1, 35))!.tier <= 1, 'trabajo: nunca por encima del tier');
}
