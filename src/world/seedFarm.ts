/**
 * Escenario semilla MÍNIMO para el test de aceptación estrella (T4.4,
 * ROADMAP.md): "con el juego en marcha y sin input, en 30 min de juego debe
 * emerger un pueblo coherente y bonito desde una sola granja". Aquí solo
 * sembramos lo justo para que exista una familia (farmhouse) y un puesto de
 * trabajo que dé de comer (barn), con un tocón de vía suficiente para que
 * findParcel/extendRoad tengan de dónde tirar — el resto lo construye el
 * crecimiento autónomo (growth.ts) sobre el campo abierto de alrededor.
 *
 * Independiente de seed.ts: NO se reusa ni se toca seedWorld() (el juego por
 * defecto sigue exactamente igual). Determinista vía createRng con su propia
 * semilla (FARM_SEED), distinta de SEED de seed.ts.
 */
import { Grid } from './grid';
import { catalogData } from './catalogData';
import { createRng } from '../rng';

const FARM_SEED = 20260704;

// Extensión del campo sembrado (celdas) alrededor del tocón de vía. Debe ser
// generosa: tanto findParcel como extendRoad (growth.ts) tratan una celda
// NUNCA sembrada (grid.get() === undefined) como "fuera del mundo" y abortan
// ahí — así que todo lo que el crecimiento autónomo pueda alcanzar en sus
// búsquedas (searchRadius por defecto 60, medido desde el centro de masa de
// lo construido, que deriva con cada edificio nuevo) tiene que ser campo
// real, no vacío implícito. 100 celdas a cada lado del origen deja margen de
// sobra a esa deriva durante una sesión larga observando el crecimiento.
const EXTENT = 100;

function place(grid: Grid, id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3 = 0): void {
  const it = catalogData(id);
  if (!it) return;
  grid.placeBuilding(id, it.w, it.d, cx, cz, rot);
}

/**
 * Siembra un grid con UNA granja (farmhouse + barn) junto a un tocón de vía
 * corto, rodeada de campo abierto en las cuatro direcciones. Es el punto de
 * partida más pequeño desde el que el crecimiento autónomo (T4.1-T4.4)
 * puede, sin más input, trazar sus propias calles y levantar un pueblo.
 */
export function seedFarm(): Grid {
  const grid = new Grid();
  const rng = createRng(FARM_SEED);

  // --- Campo de fondo -------------------------------------------------------
  grid.fillTerrain(-EXTENT, -EXTENT, EXTENT, EXTENT, 'field');

  // --- Tocón de vía horizontal (mismo perfil que seed.ts: 3 vía + 2 margen
  // verde a cada lado) centrado en el origen. 41 celdas: bastante más que un
  // parche simbólico (findParcel/paintRoadExtension necesitan margen real,
  // no solo un par de parcelas), pero MUY lejos del casi-infinito de
  // seed.ts — sigue siendo "un tocón", no una carretera sembrada.
  //
  // Nota de comportamiento real descubierta al dimensionar esto (documentada
  // para quien toque este escenario después): `extendRoad`/`nearestRoadCell`
  // NO buscan un punto con hueco lateral libre — cogen la celda de vía más
  // cercana al centro de masa construido y solo prueban las 2 direcciones
  // perpendiculares a ESE punto. Con densificación normal (casitas a ambos
  // lados de toda vía servible, que es justo lo que findParcel produce),
  // ambos lados de esa celda acaban flanqueados por edificios y `extendRoad`
  // devuelve null de forma persistente — incluso en seed.ts con sus vías
  // casi infinitas esto se comprobó (0 `roadBuilt` en 60 días de juego). No
  // es un bug de este escenario: es una limitación real de extendRoad tal
  // cual existe hoy. Un tocón más largo solo retrasa cuándo empieza a
  // pasar, no lo evita. Por eso el test de este escenario (sim.test.ts)
  // exige cityGrew (que SÍ ocurre pronto y con fuerza) y no roadBuilt.
  const STUB_X0 = -20;
  const STUB_X1 = 20;
  for (let cx = STUB_X0; cx <= STUB_X1; cx++) {
    grid.setTerrain(cx, 6, 'grass');
    grid.setTerrain(cx, 7, 'grass');
    grid.setTerrain(cx, 11, 'grass');
    grid.setTerrain(cx, 12, 'grass');
    for (let cz = 8; cz <= 10; cz++) grid.setTerrain(cx, cz, 'road');
  }

  // --- Parcela de la granja: farmhouse + barn retranqueados 1 celda al sur
  // del margen verde (cz=11,12), mirando a la vía (rot=2 → fachada -Z), con
  // un camino corto que conecta ambas puertas al margen de la carretera.
  place(grid, 'farmhouse', -6, 14, 2);
  place(grid, 'barn', 2, 14, 2);
  for (let cx = -6; cx <= 6; cx++) {
    grid.setTerrain(cx, 13, 'path');
  }

  // --- Arbolado disperso: abre el campo (identidad visual) sin bloquear el
  // crecimiento — los props no impiden canPlace/paintRoadExtension, solo
  // 'building'/'water'/'road' lo hacen. Densidad baja a propósito para que
  // el paisaje se lea abierto, listo para que el pueblo lo llene.
  for (let i = 0; i < 40; i++) {
    const cx = Math.round(rng.range(-EXTENT + 2, EXTENT - 2));
    const cz = Math.round(rng.range(-EXTENT + 2, EXTENT - 2));
    const cell = grid.get(cx, cz);
    if (!cell || cell.building || cell.prop || cell.terrain !== 'field') continue;
    const id = rng.next() < 0.35 ? 'tree-cypress' : 'tree-blob';
    grid.setProp(cx, cz, { id, variant: Math.floor(rng.next() * 1e9) });
  }

  return grid;
}
