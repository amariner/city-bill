/** Tests puros de cobertura de servicios (H4.2). */
import { catalogData } from '../world/catalogData';
import { Grid } from '../world/grid';
import { computeCoverage, COVERAGE_BITS, coverageRates } from './coverage';
import { Simulation } from './simulation';
import { WorldIndex, SimBuilding } from './worldIndex';

let passed = 0;
let failed = 0;
function check(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function coverageGrid(): WorldIndex {
  const grid = new Grid();
  grid.fillTerrain(-12, -4, 34, 12, 'field');
  for (let cx = -12; cx <= 34; cx++) {
    grid.setRoad(cx, -2, 'rural');
    grid.setRoad(cx, 5, 'rural');
  }
  check(grid.placeBuilding('farmhouse', 5, 4, 0, 0), 'fixture: casa cercana');
  check(grid.placeBuilding('school', 6, 4, 8, 0), 'fixture: escuela');
  check(grid.placeBuilding('clinic', 4, 3, 3, 6), 'fixture: consultorio');
  check(grid.placeBuilding('cottage', 3, 3, 20, 0), 'fixture: casa lejana');
  return new WorldIndex(grid);
}

// La casa cercana está a 8.5 celdas del centro de la escuela (≤ 10) y a 8 del
// consultorio (≤ 8); la casa lejana queda fuera de ambos radios.
{
  const index = coverageGrid();
  const coverage = computeCoverage(index);
  const near = coverage.get('0,0') ?? 0;
  const far = coverage.get('20,0') ?? 0;
  check((near & COVERAGE_BITS.education) !== 0, 'cobertura: la casa a 8.5 recibe educación');
  check((near & COVERAGE_BITS.health) !== 0, 'cobertura: la casa a 8 recibe salud');
  check((far & COVERAGE_BITS.education) === 0, 'cobertura: la casa a más de 10 no recibe educación');
  check((far & COVERAGE_BITS.health) === 0, 'cobertura: la casa lejana no recibe salud');
  check(index.at(0, 0)?.coverage === near, 'índice: guarda la máscara calculada en la vivienda');
  const rates = coverageRates(index);
  check(rates.education === 0.5 && rates.health === 0.5, 'tasas: cuenta viviendas cubiertas, no proveedores');
  const stats = new Simulation(index.grid, 9090).cityStats();
  check(stats.coverage.education === 0.5 && stats.coverage.health === 0.5, 'cityStats: publica las tasas de cobertura');
}

// Un proveedor sin acceso vial y una casa abandonada no prestan/reciben
// cobertura aunque geométricamente estén dentro del radio.
{
  const index = coverageGrid();
  index.grid.setTerrain(0, -2, 'field');
  index.grid.setTerrain(1, -2, 'field');
  index.grid.setTerrain(2, -2, 'field');
  index.rebuild();
  check((index.at(0, 0)?.coverage ?? 0) & COVERAGE_BITS.education ? true : false, 'acceso: la escuela sigue conectada por su propia vía');
  // Cortar también la vía de la escuela deja el servicio inoperativo.
  for (let cx = -12; cx <= 34; cx++) {
    index.grid.setTerrain(cx, -2, 'field');
    index.grid.setTerrain(cx, 5, 'field');
  }
  index.rebuild();
  check((index.at(0, 0)?.coverage ?? 0) & COVERAGE_BITS.education ? false : true, 'acceso: un proveedor aislado deja de cubrir');
  index.grid.setBuildingAbandoned(8, 0, true);
  index.rebuild();
  check((index.at(0, 0)?.coverage ?? 0) & COVERAGE_BITS.education ? false : true, 'abandono: un servicio cerrado no cubre');
}

// 500 edificios ⇒ 250k comparaciones simples: el contrato de cobertura debe
// seguir siendo un cálculo de unos pocos milisegundos, sin BFS por edificio.
{
  const school = catalogData('school')!;
  const cottage = catalogData('cottage')!;
  const buildings: SimBuilding[] = [];
  for (let i = 0; i < 500; i++) {
    const data = i % 2 === 0 ? school : cottage;
    buildings.push({
      ax: i,
      az: 0,
      id: data.id,
      data,
      entrance: null,
      cx: i + data.w / 2,
      cz: data.d / 2,
      roadAccess: true,
      abandoned: false,
      coverage: 0,
    });
  }
  computeCoverage({ buildings }); // warmup: no se mezcla la compilación JIT con la sonda
  let result = new Map<string, number>();
  const t0 = performance.now();
  for (let i = 0; i < 3; i++) result = computeCoverage({ buildings });
  const elapsed = (performance.now() - t0) / 3;
  check(result.size === 500, 'escala: devuelve una máscara por edificio');
  check(elapsed < 5, `escala: 500 edificios se calculan en menos de 5 ms (${elapsed.toFixed(2)} ms)`);
}

console.log(`\ncoverage.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
