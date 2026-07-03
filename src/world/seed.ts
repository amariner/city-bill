/**
 * Escenario semilla: puebla un Grid con el primer barrio (campos de fondo,
 * carreteras cruzadas, parcela de granja y pequeño pueblo). Determinista.
 * Todo lo funcional (terreno, vías, edificios, árboles) queda como celdas
 * consultables; el render se genera DESDE el grid (ver render/worldView.ts).
 */
import { Grid, Rot } from './grid';
import { catalogItem } from './catalog';
import { createRng } from '../rng';

const SEED = 20260703;

// Extensión del área sembrada (celdas). Fuera de esto, mundo vacío por ahora.
const EXTENT = 90;

function place(grid: Grid, id: string, cx: number, cz: number, rot: Rot = 0): void {
  const it = catalogItem(id);
  if (!it) return;
  grid.placeBuilding(id, it.w, it.d, cx, cz, rot);
}

function scatterTrees(
  grid: Grid,
  rng: ReturnType<typeof createRng>,
  cx0: number,
  cz0: number,
  cx1: number,
  cz1: number,
  count: number,
  cypressRatio = 0.35,
): void {
  for (let i = 0; i < count; i++) {
    const cx = Math.round(rng.range(cx0, cx1));
    const cz = Math.round(rng.range(cz0, cz1));
    const cell = grid.get(cx, cz);
    if (!cell || cell.building || cell.prop || cell.terrain === 'water' || cell.terrain === 'road') continue;
    const id = rng.next() < cypressRatio ? 'tree-cypress' : 'tree-blob';
    grid.setProp(cx, cz, { id, variant: Math.floor(rng.next() * 1e9) });
  }
}

export function seedWorld(): Grid {
  const grid = new Grid();
  const rng = createRng(SEED);

  // --- Campos de fondo (patchwork) -----------------------------------------
  grid.fillTerrain(-EXTENT, -EXTENT, EXTENT, EXTENT, 'field');

  // --- Carreteras cruzadas + márgenes verdes -------------------------------
  // Carretera horizontal (dirección X) en cz ∈ [8,10]; vertical en cx ∈ [30,32].
  for (let cx = -EXTENT; cx <= EXTENT; cx++) {
    grid.setTerrain(cx, 6, 'grass');
    grid.setTerrain(cx, 7, 'grass');
    grid.setTerrain(cx, 11, 'grass');
    grid.setTerrain(cx, 12, 'grass');
    for (let cz = 8; cz <= 10; cz++) grid.setTerrain(cx, cz, 'road');
  }
  for (let cz = -EXTENT; cz <= EXTENT; cz++) {
    grid.setTerrain(28, cz, 'grass');
    grid.setTerrain(29, cz, 'grass');
    grid.setTerrain(33, cz, 'grass');
    grid.setTerrain(34, cz, 'grass');
    for (let cx = 30; cx <= 32; cx++) grid.setTerrain(cx, cz, 'road');
  }

  // Arbolado con huecos en los márgenes (rasgo de identidad).
  for (let cx = -EXTENT; cx <= EXTENT; cx += 2) {
    if (rng.next() < 0.35) continue;
    for (const cz of [5, 13]) {
      const id = rng.next() < 0.6 ? 'tree-cypress' : 'tree-blob';
      grid.setProp(cx, cz, { id, variant: Math.floor(rng.next() * 1e9) });
    }
  }
  for (let cz = -EXTENT; cz <= EXTENT; cz += 2) {
    if (rng.next() < 0.35) continue;
    for (const cx of [27, 35]) {
      if (cz >= 5 && cz <= 13) continue; // no pisar el cruce
      const id = rng.next() < 0.6 ? 'tree-cypress' : 'tree-blob';
      grid.setProp(cx, cz, { id, variant: Math.floor(rng.next() * 1e9) });
    }
  }

  // --- Parcela de la granja ------------------------------------------------
  grid.fillTerrain(-42, -34, -6, 4, 'grass');
  // Estanque ovalado
  const pcx = -34;
  const pcz = -28;
  for (let cx = -40; cx <= -28; cx++) {
    for (let cz = -32; cz <= -24; cz++) {
      const dx = (cx - pcx) / 6;
      const dz = (cz - pcz) / 4;
      if (dx * dx + dz * dz <= 1) grid.setTerrain(cx, cz, 'water');
    }
  }
  // Camino de entrada de la casa a la carretera horizontal
  for (let cz = -6; cz <= 7; cz++) {
    grid.setTerrain(-28, cz, 'path');
    grid.setTerrain(-27, cz, 'path');
  }
  place(grid, 'farmhouse', -32, -16, 0);
  place(grid, 'barn', -20, -14, 1);
  place(grid, 'shed', -14, -26, 0);
  scatterTrees(grid, rng, -42, -34, -8, -18, 14, 0.3);
  scatterTrees(grid, rng, -42, -6, -34, 4, 10, 0.4);

  // --- Pueblo --------------------------------------------------------------
  grid.fillTerrain(36, 14, 66, 40, 'grass');
  // Casitas alineadas a la carretera horizontal (miran hacia -Z, al norte)
  for (let i = 0; i < 4; i++) {
    const cx = 40 + i * 7;
    place(grid, 'cottage', cx, 16, 2);
    // sendero al verge de la carretera
    for (let cz = 13; cz <= 15; cz++) grid.setTerrain(cx + 1, cz, 'path');
  }
  // Calle interior del pueblo
  for (let cx = 37; cx <= 64; cx++) {
    grid.setTerrain(cx, 24, 'path');
    grid.setTerrain(cx, 25, 'path');
  }
  place(grid, 'shop', 37, 28, 1);
  place(grid, 'shed', 58, 30, 0);
  scatterTrees(grid, rng, 36, 30, 66, 40, 12, 0.35);
  scatterTrees(grid, rng, 36, 18, 40, 23, 5, 0.5);

  // --- Árboles sueltos por los campos --------------------------------------
  scatterTrees(grid, rng, -EXTENT, -EXTENT, EXTENT, EXTENT, 60, 0.45);

  return grid;
}
