/**
 * Tests del grid. Correr con: npm run test:grid  (tsx, sin THREE).
 */
import { Grid, rotatedFootprint, cellToWorld, worldToCell, CELL_SIZE } from './grid';
import { extendRoad } from './growth';
import { createRng } from '../rng';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// --- Terreno y celdas dispersas ---------------------------------------------
{
  const g = new Grid();
  assert(g.get(0, 0) === undefined, 'celda vacía es undefined');
  g.setTerrain(3, 5, 'grass');
  assert(g.get(3, 5)?.terrain === 'grass', 'setTerrain persiste');
  g.fillTerrain(0, 0, 2, 2, 'field');
  let count = 0;
  g.forEachInRect(0, 0, 2, 2, () => count++);
  assert(count === 9, `fillTerrain 3x3 crea 9 celdas (fue ${count})`);
}

// --- Footprint rotado -------------------------------------------------------
{
  assert(rotatedFootprint(4, 2, 0).join() === '4,2', 'rot 0 no cambia');
  assert(rotatedFootprint(4, 2, 1).join() === '2,4', 'rot 1 intercambia');
  assert(rotatedFootprint(4, 2, 2).join() === '4,2', 'rot 2 no cambia');
  assert(rotatedFootprint(4, 2, 3).join() === '2,4', 'rot 3 intercambia');
}

// --- Colocación y colisión de edificios -------------------------------------
{
  const g = new Grid();
  assert(g.canPlace(3, 2, 10, 10) === true, 'canPlace en zona libre');
  assert(g.placeBuilding('barn', 3, 2, 10, 10) === true, 'placeBuilding ok');
  // Todas las celdas del footprint 3x2 marcadas
  let occupied = 0;
  g.forEachInRect(10, 10, 12, 11, (c) => c.building && occupied++);
  assert(occupied === 6, `footprint 3x2 ocupa 6 celdas (fue ${occupied})`);
  // Solapamiento rechazado
  assert(g.canPlace(2, 2, 11, 10) === false, 'canPlace rechaza solapamiento');
  assert(g.placeBuilding('shed', 2, 2, 11, 10) === false, 'placeBuilding rechaza solapamiento');
  // Colocación con rotación cambia el footprint
  assert(g.canPlace(4, 1, 20, 20, 1) === true, 'canPlace rotado libre');
  g.placeBuilding('road', 4, 1, 20, 20, 1);
  assert(g.get(20, 23)?.building?.id === 'road', 'footprint rotado (1x4) ocupa hasta cz+3');
  assert(g.get(21, 20)?.building === undefined, 'footprint rotado no desborda en x');
}

// --- No se puede construir sobre agua/carretera -----------------------------
{
  const g = new Grid();
  g.setTerrain(5, 5, 'water');
  assert(g.canPlace(2, 2, 4, 4) === false, 'no construir sobre agua');
  g.setTerrain(8, 8, 'road');
  assert(g.canPlace(2, 2, 8, 8) === false, 'no construir sobre carretera');
}

// --- Demolición -------------------------------------------------------------
{
  const g = new Grid();
  g.placeBuilding('house', 3, 3, 0, 0);
  assert(g.removeBuilding(1, 1) === true, 'removeBuilding desde celda no-ancla');
  let remaining = 0;
  g.forEachInRect(0, 0, 2, 2, (c) => c.building && remaining++);
  assert(remaining === 0, `demolición limpia todas las celdas (quedaron ${remaining})`);
}

// --- Conversión celda ↔ mundo -----------------------------------------------
{
  assert(cellToWorld(0, 0).join() === '1,1', 'centro de celda 0 es (1,1)');
  assert(cellToWorld(2, 3).join() === `${2.5 * CELL_SIZE},${3.5 * CELL_SIZE}`, 'centro celda escala');
  assert(worldToCell(3.5, 5.9).join() === '1,2', 'worldToCell redondea abajo');
  assert(worldToCell(-1, -1).join() === '-1,-1', 'worldToCell con negativos');
}

// --- Serialización de ida y vuelta ------------------------------------------
{
  const g = new Grid();
  g.fillTerrain(-3, -3, 3, 3, 'field');
  g.placeBuilding('barn', 3, 2, 0, 0);
  g.setProp(-2, -2, { id: 'tree', variant: 42 });
  const json = g.serialize();
  const g2 = Grid.deserialize(json);
  assert(g2.get(0, 0)?.building?.id === 'barn', 'edificio sobrevive round-trip');
  assert(g2.get(-2, -2)?.prop?.variant === 42, 'prop sobrevive round-trip');
  assert(g2.serialize() === json, 'serialize es estable tras round-trip');
}

// --- T4.4 núcleo: extensión autónoma de vías --------------------------------
{
  const g = new Grid();
  g.placeBuilding('barn', 3, 2, 20, 0); // un edificio que la vía NO debe arrasar
  const rng = createRng(7);
  // Extiende hacia +X desde una celda de arranque, 10 celdas.
  const laid = extendRoad(g, [0, 0], { dx: 1, dz: 0 }, 10, rng);

  assert(laid.length > 0, 'extendRoad traza celdas de vía');
  // La calzada es de 3 celdas de ancho: en x=1 deben ser road cz=-1,0,1.
  assert(g.get(1, -1)?.terrain === 'road' && g.get(1, 0)?.terrain === 'road' && g.get(1, 1)?.terrain === 'road', 'calzada de 3 celdas de ancho');
  // Márgenes de hierba a ±2.
  assert(g.get(1, -2)?.terrain === 'grass' && g.get(1, 2)?.terrain === 'grass', 'márgenes de hierba a los lados');
  // Ortogonal: avanza en +X, no toca cz fuera de [-3,3].
  assert(laid.every(([, cz]) => cz >= -1 && cz <= 1), 'la calzada es ortogonal (recta en X)');
  // Hay arbolado en algún margen exterior (identidad del juego).
  let trees = 0;
  for (const cz of [-3, 3]) for (let cx = 1; cx <= 10; cx++) if (g.get(cx, cz)?.prop) trees++;
  assert(trees > 0, 'planta arbolado en los márgenes');
  // No arrasa el edificio en x≈20: la extensión se corta antes.
  assert(g.get(20, 0)?.building?.id === 'barn', 'la vía no arrasa edificios (se corta)');
  assert(laid.every(([cx]) => cx < 20), 'la extensión se detiene antes del edificio');
}

console.log(`\ngrid.test: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
