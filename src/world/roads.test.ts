/** Tests de planificación y pintado de vías. Correr con: npx tsx src/world/roads.test.ts */
import { Grid } from './grid';
import { paintRoad, paintRoadPlan, planRoad, previewRoad, ROAD_SPECS } from './roads';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function emptyGrid(): Grid {
  const grid = new Grid();
  grid.fillTerrain(-20, -20, 20, 20, 'field');
  grid.clearJournal();
  return grid;
}

function hasRoad(grid: Grid, cx: number, cz: number, kind?: string): boolean {
  const cell = grid.get(cx, cz);
  return cell?.terrain === 'road' && (kind === undefined || cell.roadKind === kind);
}

// --- Planificación ortogonal reproducible ----------------------------------
{
  assert(planRoad([0, 0], [0, 4]).length === 1, 'tramo vertical produce un solo eje');
  assert(planRoad([0, 0], [4, 0])[0]?.axis === 'x', 'tramo horizontal usa el eje X');
  assert(planRoad([0, 0], [4, 3]).length === 2, 'origen y destino distintos producen una L');
  const plan = planRoad([0, 0], [4, 3]);
  assert(plan[0]?.axis === 'x' && plan[1]?.axis === 'z', 'la L siempre se pinta primero en X');
  assert(plan[0]?.to.join() === '4,0' && plan[1]?.from.join() === '4,0', 'la esquina de la L coincide');
  assert(planRoad([2, 2], [2, 2]).length === 0, 'origen igual a destino no crea tramo');
}

// --- Perfiles y metadatos por tipo de vía ----------------------------------
{
  const path = emptyGrid();
  const pathResult = paintRoad(path, { axis: 'x', from: [0, 0], to: [4, 0] }, 'path', 7);
  assert(pathResult.laid.length === 5, 'sendero de cinco celdas tiene cinco celdas nuevas');
  assert(hasRoad(path, 2, 0, 'path') && path.get(2, 1)?.terrain === 'field', 'sendero tiene calzada de una celda');
  assert(pathResult.cost === 5 * ROAD_SPECS.path.costPerCell, 'coste del sendero usa su coste por celda');

  const rural = emptyGrid();
  const ruralResult = paintRoad(rural, { axis: 'x', from: [0, 0], to: [4, 0] }, 'rural', 11);
  assert(hasRoad(rural, 2, -1, 'rural') && hasRoad(rural, 2, 0, 'rural') && hasRoad(rural, 2, 1, 'rural'), 'vía rural tiene calzada de tres celdas');
  assert(rural.get(2, -2)?.terrain === 'grass' && rural.get(2, 2)?.terrain === 'grass', 'vía rural pinta márgenes de hierba');
  assert(ruralResult.cost === ruralResult.laid.length * ROAD_SPECS.rural.costPerCell, 'coste rural coincide con las celdas nuevas');

  const street = emptyGrid();
  paintRoad(street, { axis: 'x', from: [0, 0], to: [2, 0] }, 'street', 5);
  assert(street.get(1, -2)?.terrain === 'path' && street.get(1, 2)?.terrain === 'path', 'calle pinta aceras');
  assert(street.get(1, -3)?.terrain === 'grass' && street.get(1, 3)?.terrain === 'grass', 'calle pinta margen exterior');

  const avenue = emptyGrid();
  paintRoad(avenue, { axis: 'x', from: [0, 0], to: [2, 0] }, 'avenue', 5);
  assert(avenue.get(1, -2)?.terrain === 'road' && avenue.get(1, 1)?.terrain === 'road', 'avenida tiene dos carriles a cada lado');
  assert(avenue.get(1, 0)?.terrain === 'grass', 'avenida reserva una mediana');
  assert(avenue.get(1, -3)?.terrain === 'path' && avenue.get(1, 3)?.terrain === 'path', 'avenida pinta aceras exteriores');

  const preview = previewRoad(emptyGrid(), planRoad([-2, -2], [3, 2]), 'street');
  assert(preview.laid.length > 0 && preview.cost === preview.laid.length * ROAD_SPECS.street.costPerCell, 'preview calcula el coste de la L sin mutar');
  assert(preview.cells.some((cell) => cell.role === 'sidewalk'), 'preview enseña las aceras');
}

// --- Cruces, bloqueos y edificios intactos ---------------------------------
{
  const crossing = emptyGrid();
  paintRoad(crossing, { axis: 'x', from: [0, 0], to: [6, 0] }, 'rural', 3);
  const vertical = paintRoad(crossing, { axis: 'z', from: [3, -3], to: [3, 3] }, 'rural', 3);
  assert(hasRoad(crossing, 3, 0, 'rural'), 'el cruce conserva la calzada existente');
  assert(!vertical.laid.some(([cx, cz]) => cx === 3 && cz === 0), 'el cruce no duplica celdas ya colocadas');

  const blocked = emptyGrid();
  assert(blocked.placeBuilding('obstacle', 1, 1, 5, 0), 'precondición: edificio bloqueador colocado');
  const result = paintRoad(blocked, { axis: 'x', from: [0, 0], to: [10, 0] }, 'rural', 4);
  assert(result.blocked.length > 0, 'la vía informa la primera celda bloqueada');
  assert(blocked.get(5, 0)?.building?.id === 'obstacle', 'la vía no arrasa el edificio');
  assert(!hasRoad(blocked, 5, 0), 'la vía se detiene antes del edificio');
}

// --- Determinismo, plan en L y journal -------------------------------------
{
  const a = emptyGrid();
  const b = emptyGrid();
  const plan = planRoad([-2, -2], [4, 3]);
  const result = paintRoadPlan(a, plan, 'rural', 1234);
  paintRoadPlan(b, plan, 'rural', 1234);
  assert(a.serialize() === b.serialize(), 'el pintado de una L es determinista por semilla');
  assert(result.cost === result.laid.length * ROAD_SPECS.rural.costPerCell, 'coste de la L deduplica la esquina');

  const journal = a.takeJournal();
  const roadPatch = journal.find(([, , cell]) => cell.terrain === 'road' && cell.roadKind === 'rural');
  assert(roadPatch !== undefined, 'calzada y roadKind viajan por el journal');
  const twin = emptyGrid();
  twin.applyPatch(journal);
  assert(twin.serialize() === a.serialize(), 'applyPatch conserva roadKind y perfiles laterales');
}

console.log(`\nroads.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
